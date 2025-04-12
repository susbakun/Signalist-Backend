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
  const { sender, text, messageImageId } = req.body;

  try {
    // Create message object
    const message = {
      sender,
      text,
      date: Date.now(),
    };

    if (messageImageId) {
      message.messageImageId = messageImageId;
    }

    // Get existing messages
    const roomKey = `message:${roomId}`;
    const existingMessagesJson = await redisService.get(roomKey);

    let messages = [];
    if (existingMessagesJson) {
      messages = JSON.parse(existingMessagesJson);
    }

    // Add new message
    messages.push(message);

    // Save to Redis
    await redisService.set(roomKey, JSON.stringify(messages));

    // Determine if this is a group chat or DM
    const isGroup = roomId.startsWith("group:") || roomId.split("_").length > 2;

    // Use socket.io to notify recipients
    if (isGroup) {
      // For group chat, broadcast to room
      socketService.broadcast(`newMessage:${roomId}`, { message, roomId });
    } else {
      // For DM, send to recipient
      const users = roomId.split("_");
      const recipient = users.find((user) => user !== sender.username);

      if (recipient) {
        socketService.sendToUser(recipient, {
          type: "newMessage",
          message,
          roomId,
        });
      }
    }

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
