const { v4: uuidv4 } = require("uuid");
const databaseService = require("../services/database.service");
const axios = require("axios");

/**
 * Helper function to get a conversation by ID
 * @param {string} roomId - The conversation room ID
 * @returns {Promise<Array>} - The messages in the conversation
 */
async function getConversationFromRedis(roomId) {
  try {
    const conversation = await databaseService.get(`message:${roomId}`);
    return conversation ? JSON.parse(conversation) : [];
  } catch (error) {
    console.error(`Error getting conversation ${roomId}:`, error);
    return [];
  }
}

/**
 * Helper function to get all conversations for a user
 * @param {string} username - The username to get conversations for
 * @returns {Promise<Object>} - The user's conversations
 */
async function getUserConversationsFromRedis(username) {
  try {
    // Get all conversation keys that involve this user
    const conversationKeys = await databaseService.keys(
      `message:*${username}*`
    );
    const conversations = {};

    // Process each conversation
    for (const key of conversationKeys) {
      const roomId = key.split(":")[1]; // Extract roomId from key format "message:roomId"
      const messages = await getConversationFromRedis(roomId);

      if (messages.length === 0) continue;

      // Determine if this is a DM or group conversation
      const isGroup = roomId.startsWith("group-");

      if (isGroup) {
        // Group conversation
        const groupInfo = {
          groupName: roomId.split("group-")[1],
          groupImageHref: null, // You can implement group images later
        };

        // Get unique users from messages
        const usersInfo = [];
        const userMap = new Map();

        messages.forEach((message) => {
          if (!userMap.has(message.sender.username)) {
            userMap.set(message.sender.username, message.sender);
            usersInfo.push(message.sender);
          }
        });

        conversations[roomId] = {
          isGroup: true,
          groupInfo,
          usersInfo,
          userInfo: null,
          messages,
        };
      } else {
        // DM conversation - determine the other user
        const parts = roomId.split("-");
        const otherUsername = parts[0] === username ? parts[1] : parts[0];

        // Find the other user's info from messages
        let otherUserInfo = messages.find(
          (m) => m.sender.username === otherUsername
        )?.sender;

        // If no messages from other user exist, try to fetch user data
        if (!otherUserInfo) {
          try {
            // Try to fetch user data from users API
            const baseUrl =
              process.env.NODE_ENV === "production"
                ? "https://api.signalisttech.com/api"
                : "http://localhost:3000/api";
            const userResponse = await axios.get(
              `${baseUrl}/users/${otherUsername}`
            );
            otherUserInfo = {
              username: userResponse.data.username,
              name: userResponse.data.name,
              imageUrl: userResponse.data.imageUrl,
            };
          } catch (error) {
            console.log(
              `Could not fetch user data for ${otherUsername}, using fallback`
            );
            // Fallback user info
            otherUserInfo = {
              username: otherUsername,
              name: otherUsername,
              imageUrl: null,
            };
          }
        }

        conversations[roomId] = {
          isGroup: false,
          userInfo: otherUserInfo,
          groupInfo: null,
          usersInfo: null,
          messages,
        };
      }
    }

    return conversations;
  } catch (error) {
    console.error(`Error getting conversations for ${username}:`, error);
    return {};
  }
}

/**
 * Get all conversations for a user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getUserConversations(req, res) {
  try {
    const { username } = req.params;

    if (!username) {
      return res
        .status(400)
        .json({ success: false, message: "Username is required" });
    }

    const conversations = await getUserConversationsFromRedis(username);

    return res.status(200).json({
      success: true,
      conversations,
    });
  } catch (error) {
    console.error("Error in getUserConversations:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching conversations",
      error: error.message,
    });
  }
}

/**
 * Get messages for a specific conversation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getConversationMessages(req, res) {
  try {
    const { roomId } = req.params;

    if (!roomId) {
      return res
        .status(400)
        .json({ success: false, message: "Room ID is required" });
    }

    const messages = await getConversationFromRedis(roomId);

    return res.status(200).json({
      success: true,
      messages,
    });
  } catch (error) {
    console.error("Error in getConversationMessages:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching messages",
      error: error.message,
    });
  }
}

/**
 * Send a message to a conversation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function sendMessage(req, res) {
  try {
    const { roomId } = req.params;
    const { sender, text, messageImageHref } = req.body;

    if (!roomId || !sender || !text) {
      return res.status(400).json({
        success: false,
        message: "Room ID, sender information, and message text are required",
      });
    }

    // Get existing messages
    const messages = await getConversationFromRedis(roomId);

    // Create new message
    const newMessage = {
      id: uuidv4(),
      sender,
      text,
      date: Date.now(),
      messageImageHref: messageImageHref || null,
    };

    // Add message to conversation
    messages.push(newMessage);

    // Save updated conversation
    await databaseService.set(`message:${roomId}`, JSON.stringify(messages));

    // Emit the message to all users in the room via socket
    if (req.io) {
      console.log(`Emitting newMessage to room ${roomId}:`, newMessage);
      req.io.to(roomId).emit("newMessage", newMessage);

      // Also emit to all connected sockets for debugging
      const socketsInRoom = await req.io.in(roomId).allSockets();
      console.log(`Sockets in room ${roomId}:`, Array.from(socketsInRoom));
    } else {
      console.error("Socket.io instance not available in request");
    }

    return res.status(201).json({
      success: true,
      message: newMessage,
    });
  } catch (error) {
    console.error("Error in sendMessage:", error);
    return res.status(500).json({
      success: false,
      message: "Error sending message",
      error: error.message,
    });
  }
}

/**
 * Create a new direct message conversation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createDMConversation(req, res) {
  try {
    const { user1, user2 } = req.body;

    if (!user1 || !user2) {
      return res.status(400).json({
        success: false,
        message: "Both users' information is required",
      });
    }

    // Create a unique room ID for the conversation (sorted usernames to ensure consistency)
    const users = [user1.username, user2.username].sort();
    const roomId = `${users[0]}-${users[1]}`;

    // Check if conversation already exists
    const exists = await databaseService.exists(`message:${roomId}`);

    if (!exists) {
      // Create empty conversation
      await databaseService.set(`message:${roomId}`, JSON.stringify([]));
    }

    // Return the conversation structure expected by the frontend
    return res.status(201).json({
      success: true,
      roomId,
      isGroup: false,
      userInfo: user2, // From user1's perspective
      groupInfo: null,
      usersInfo: null,
      messages: [],
    });
  } catch (error) {
    console.error("Error in createDMConversation:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating conversation",
      error: error.message,
    });
  }
}

/**
 * Create a new group conversation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createGroupConversation(req, res) {
  try {
    const { groupName, members, createdBy } = req.body;

    if (!groupName || !members || !members.length || !createdBy) {
      return res.status(400).json({
        success: false,
        message: "Group name, members, and creator information are required",
      });
    }

    // Create a unique room ID for the group
    const roomId = `group-${groupName}-${Date.now()}`;

    // Create empty conversation
    await databaseService.set(`message:${roomId}`, JSON.stringify([]));

    // Return the group conversation structure expected by the frontend
    return res.status(201).json({
      success: true,
      roomId,
      isGroup: true,
      userInfo: null,
      groupInfo: {
        groupName,
        groupImageHref: null, // You can implement group images later
      },
      usersInfo: members,
      messages: [],
    });
  } catch (error) {
    console.error("Error in createGroupConversation:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating group conversation",
      error: error.message,
    });
  }
}

/**
 * Upload an image for a message
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function uploadImage(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    // Generate a unique filename
    const filename = `message_${Date.now()}_${uuidv4()}.jpg`;

    // In a real implementation, you would save the file to a storage service
    // For this example, we'll just return a mock URL
    const url = `https://api.signalisttech.com/uploads/messages/${filename}`;

    return res.status(200).json({
      success: true,
      url,
    });
  } catch (error) {
    console.error("Error uploading message image:", error);
    return res.status(500).json({
      success: false,
      message: "Error uploading image",
      error: error.message,
    });
  }
}

module.exports = {
  getUserConversations,
  getConversationMessages,
  sendMessage,
  createDMConversation,
  createGroupConversation,
  uploadImage,
};
