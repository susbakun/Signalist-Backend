const { v4: uuidv4 } = require("uuid");
const redisService = require("../services/redis.service");
const socketService = require("../services/socket.service");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

// Initialize S3 client
const s3Client = new S3Client({
  region: "default",
  endpoint: process.env.LIARA_ENDPOINT,
  credentials: {
    accessKeyId: process.env.LIARA_BUCKET_ACCESS_KEY,
    secretAccessKey: process.env.LIARA_SECRET_KEY,
  },
});

// Create an in-memory message cache to avoid frequent Redis reads
const messageCache = new Map();
const MESSAGE_CACHE_TTL = 60 * 1000; // 60 seconds in milliseconds

/**
 * Get all conversations for a user
 */
exports.getUserConversations = async (req, res) => {
  const { username } = req.params;

  try {
    // Find all message keys that might involve this user
    const conversationKeys = await redisService.keys(`message:*${username}*`);

    if (!conversationKeys.length) {
      return res.json({ conversations: {} });
    }

    const conversations = {};

    // Process each conversation
    for (const key of conversationKeys) {
      const roomId = key.replace("message:", "");

      // Check if we have a fresh cache entry
      const cacheKey = `${roomId}:${username}`;
      const cachedData = messageCache.get(cacheKey);
      const now = Date.now();

      if (cachedData && now - cachedData.timestamp < MESSAGE_CACHE_TTL) {
        // Use cached data if available and fresh
        conversations[roomId] = cachedData.data;
        continue;
      }

      // Otherwise fetch from Redis
      const messagesJson = await redisService.get(key);
      if (!messagesJson) continue;

      const messages = JSON.parse(messagesJson);

      // Determine conversation type (DM or group)
      const users = roomId.split("_");
      const isGroup = users.length > 2 || roomId.startsWith("group:");

      if (isGroup) {
        // Group conversation logic
        const groupInfoJson = await redisService.get(`group:${roomId}`);
        if (!groupInfoJson) continue;

        const groupInfo = JSON.parse(groupInfoJson);

        conversations[roomId] = {
          userInfo: null,
          messages,
          isGroup: true,
          groupInfo: {
            groupName: groupInfo.groupName,
            groupImageId: groupInfo.groupImageId,
          },
          usersInfo: groupInfo.members,
        };

        // Update cache
        messageCache.set(cacheKey, {
          data: conversations[roomId],
          timestamp: now,
        });
      } else {
        // Direct message logic
        const otherUser = users.find((u) => u !== username);

        // Get user info
        const userJson = await redisService.get(`user:${otherUser}`);
        if (!userJson) continue;

        const user = JSON.parse(userJson);

        conversations[roomId] = {
          userInfo: {
            name: user.name,
            username: user.username,
            imageUrl: user.imageUrl || "",
          },
          messages,
          isGroup: false,
          groupInfo: null,
          usersInfo: null,
        };

        // Update cache
        messageCache.set(cacheKey, {
          data: conversations[roomId],
          timestamp: now,
        });
      }
    }

    res.json({ conversations });
  } catch (error) {
    console.error("Error getting user conversations:", error);
    res.status(500).json({ message: "Failed to get conversations" });
  }
};

/**
 * Get messages for a specific conversation
 */
exports.getConversationMessages = async (req, res) => {
  const { roomId } = req.params;

  try {
    const messagesJson = await redisService.get(`message:${roomId}`);

    if (!messagesJson) {
      return res.json({ messages: [] });
    }

    const messages = JSON.parse(messagesJson);
    res.json({ messages });
  } catch (error) {
    console.error("Error getting conversation messages:", error);
    res.status(500).json({ message: "Failed to get messages" });
  }
};

/**
 * Send a message
 */
exports.sendMessage = async (req, res) => {
  const { roomId } = req.params;
  const { sender, text, messageImageHref } = req.body;

  try {
    // Create message object with unique id
    const messageId = uuidv4();
    const now = Date.now();
    const message = {
      id: messageId,
      sender,
      text,
      date: now,
    };

    if (messageImageHref) {
      message.messageImageHref = messageImageHref;
    }

    // Get existing messages
    const roomKey = `message:${roomId}`;

    // Add message directly to Redis without waiting for result
    // (faster response to client, async processing)
    const updatePromise = (async () => {
      try {
        const existingMessagesJson = await redisService.get(roomKey);
        let messages = [];
        if (existingMessagesJson) {
          messages = JSON.parse(existingMessagesJson);
        }

        // Check for duplicate messages (within last 10 seconds with same text)
        // This helps prevent duplicate messages during reconnection scenarios
        const isDuplicate = messages.some((msg) => {
          return (
            msg.sender.username === sender.username &&
            msg.text === text &&
            now - msg.date < 30000 // Increase from 10s to 30s to catch more duplicates
          );
        });

        if (isDuplicate) {
          console.log(
            `Skipping duplicate API message from ${sender.username}: ${text}`
          );
          return; // Don't save this message if it's a duplicate
        }

        // Add new message
        messages.push(message);

        // Save to Redis with long expiry to ensure persistence
        await redisService.set(
          roomKey,
          JSON.stringify(messages),
          60 * 60 * 24 * 30
        ); // 30 days

        // Clear cache for this room
        const users = roomId.startsWith("group:")
          ? extractUsersFromGroup(roomId)
          : roomId.split("_");

        users.forEach((username) => {
          messageCache.delete(`${roomId}:${username}`);
        });
      } catch (e) {
        console.error("Error in async message update:", e);
      }
    })();

    // Determine if this is a group chat or DM
    const isGroup = roomId.startsWith("group:") || roomId.split("_").length > 2;

    // Use socket.io to notify recipients in real-time
    if (socketService.io) {
      // Mark the message as coming from the API to prevent duplicate processing
      message.fromAPI = true;

      if (isGroup) {
        // For group chat, broadcast to everyone EXCEPT the sender
        // The sender already has the message in their UI
        const roomClients =
          socketService.io.sockets.adapter.rooms.get(roomId) || new Set();
        for (const clientId of roomClients) {
          const clientSocket = socketService.io.sockets.sockets.get(clientId);
          if (clientSocket && clientSocket.username !== sender.username) {
            clientSocket.emit("newMessage", { roomId, message });
          }
        }
      } else {
        // For DM, send only to recipient, not back to sender
        const users = roomId.split("_");
        const recipient = users.find((user) => user !== sender.username);

        if (recipient && socketService.isUserOnline(recipient)) {
          socketService.sendToUser(recipient, "newMessage", {
            roomId,
            message,
          });
        }

        // Don't emit back to the sender - they already have the message
      }
    }

    // Respond immediately without waiting for Redis update
    res.status(201).json({ message });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ message: "Failed to send message" });
  }
};

/**
 * Create a new direct message conversation
 */
exports.createDMConversation = async (req, res) => {
  const { user1, user2 } = req.body;

  if (!user1 || !user2) {
    return res.status(400).json({ message: "Both users are required" });
  }

  try {
    // Create a deterministic room ID by sorting usernames
    const users = [user1.username, user2.username].sort();
    const roomId = `${users[0]}_${users[1]}`;

    // Check if conversation already exists
    const exists = await redisService.exists(`message:${roomId}`);

    if (!exists) {
      // Initialize empty conversation
      await redisService.set(`message:${roomId}`, JSON.stringify([]));
    }

    // Return conversation info
    res.status(201).json({
      roomId,
      userInfo: user2, // Return info about the other user
      messages: [],
      isGroup: false,
      groupInfo: null,
      usersInfo: null,
    });
  } catch (error) {
    console.error("Error creating conversation:", error);
    res.status(500).json({ message: "Failed to create conversation" });
  }
};

/**
 * Create a group conversation
 */
exports.createGroupConversation = async (req, res) => {
  const { groupName, members, createdBy } = req.body;

  if (!groupName || !members || !members.length || !createdBy) {
    return res
      .status(400)
      .json({ message: "Group name, members, and creator are required" });
  }

  try {
    // Create unique room ID for the group
    const roomId = `group:${uuidv4()}`;

    // Include creator in members if not already present
    if (!members.find((m) => m.username === createdBy.username)) {
      members.push(createdBy);
    }

    // Create group info
    const groupInfo = {
      groupName,
      members,
      createdBy: createdBy.username,
      createdAt: Date.now(),
    };

    // Save group info and initialize empty message list
    await redisService.set(`group:${roomId}`, JSON.stringify(groupInfo));
    await redisService.set(`message:${roomId}`, JSON.stringify([]));

    // Return group info
    res.status(201).json({
      roomId,
      userInfo: null,
      messages: [],
      isGroup: true,
      groupInfo: {
        groupName,
        groupImageId: null,
      },
      usersInfo: members,
    });
  } catch (error) {
    console.error("Error creating group:", error);
    res.status(500).json({ message: "Failed to create group" });
  }
};

/**
 * Upload an image for a message
 */
exports.uploadImage = async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const params = {
      Bucket: "messages",
      Key: `${uuidv4()}-${file.originalname}`,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    await s3Client.send(new PutObjectCommand(params));

    const imageUrl = `${process.env.LIARA_ENDPOINT}/messages/${params.Key}`;
    res.status(200).json({ url: imageUrl, messageImageId: params.Key });
  } catch (error) {
    console.error("Error uploading message image:", error);
    res.status(500).json({ message: "Error uploading message image" });
  }
};

/**
 * Extract usernames from a group chat
 */
function extractUsersFromGroup(roomId) {
  try {
    const groupInfoJson = redisService.get(`group:${roomId}`);
    if (!groupInfoJson) return [];

    const groupInfo = JSON.parse(groupInfoJson);
    return groupInfo.members.map((member) => member.username);
  } catch (error) {
    console.error("Error extracting users from group:", error);
    return [];
  }
}

// Clear the message cache periodically (every 5 minutes)
setInterval(
  () => {
    const now = Date.now();
    for (const [key, data] of messageCache.entries()) {
      if (now - data.timestamp > MESSAGE_CACHE_TTL) {
        messageCache.delete(key);
      }
    }
  },
  5 * 60 * 1000
);
