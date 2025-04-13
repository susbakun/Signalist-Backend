const redisService = require("./redis.service");

let io;
const connectedUsers = {};
const messageQueue = {}; // Queue for batching messages to Redis
let saveInterval = null; // Interval for batch saving

/**
 * Initialize the Socket.io service
 * @param {Server} socketIo - The Socket.io server instance
 */
const initialize = (socketIo) => {
  io = socketIo;

  // Set up batch saving interval (save messages every 5 seconds)
  saveInterval = setInterval(processBatchSaves, 5000);

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Heartbeat to keep connection alive
    socket.on("heartbeat", (data) => {
      // Just respond to confirm connection is alive
      socket.emit("heartbeat_ack", { timestamp: Date.now() });
    });

    // User authentication
    socket.on("authenticate", async (username) => {
      try {
        if (!username) {
          socket.emit("error", {
            message: "Username is required for authentication",
          });
          return;
        }

        // Store the socket ID with the username
        connectedUsers[username] = socket.id;
        socket.username = username;

        console.log(`User authenticated: ${username}, socket: ${socket.id}`);

        // Join a room for the user (for direct messages)
        socket.join(username);

        // Notify user of successful connection
        socket.emit("authenticated", { success: true });

        // Send initial online users
        io.emit("onlineUsers", Object.keys(connectedUsers));
      } catch (error) {
        console.error(`Authentication error for ${username}:`, error);
        socket.emit("error", { message: "Authentication failed" });
      }
    });

    // Sync messages that might have been missed
    socket.on("syncMessages", async (data) => {
      try {
        const { roomId, since, existingIds = [] } = data;
        if (!roomId) return;

        // Get messages since the given timestamp
        const roomKey = `message:${roomId}`;
        const messagesJson = await redisService.get(roomKey);

        if (messagesJson) {
          const allMessages = JSON.parse(messagesJson);

          // Create a Set of existing IDs for faster lookups
          const existingIdsSet = new Set(existingIds);

          // Ensure each message has a unique ID and filter out messages
          // that the client already has (based on existingIds)
          const messagesToSend = allMessages
            .filter((msg) => {
              // Only include messages newer than the since timestamp
              if (msg.date <= since) {
                return false;
              }

              // Generate ID if not present
              if (!msg.id && msg.date && msg.sender && msg.text) {
                msg.id = `${msg.date}-${msg.sender.username}-${msg.text.substring(0, 10)}`;
              }

              // Skip messages that the client already has
              if (msg.id && existingIdsSet.has(msg.id)) {
                console.log(
                  `Skipping already existing message in sync: ${msg.id}`
                );
                return false;
              }

              // Also skip messages sent by this user to avoid duplicates
              if (msg.sender && msg.sender.username === socket.username) {
                console.log(
                  `Skipping own message in sync: ${msg.id || "unknown"}`
                );
                return false;
              }

              return true;
            })
            .map((msg) => {
              // Ensure proper flag for own messages
              if (msg.sender && msg.sender.username === socket.username) {
                msg.own = true;
              }
              return msg;
            });

          if (messagesToSend.length > 0) {
            console.log(
              `Sending ${messagesToSend.length} missed messages to ${socket.username}`
            );
            socket.emit("syncedMessages", { roomId, messages: messagesToSend });
          } else {
            console.log(`No new messages to sync for ${socket.username}`);
          }
        }
      } catch (error) {
        console.error("Error syncing messages:", error);
      }
    });

    // Handle sending messages
    socket.on("sendMessage", async (data) => {
      try {
        const { roomId, message, isGroup, fromAPI } = data;

        if (!roomId || !message) {
          socket.emit("error", { message: "Invalid message data" });
          return;
        }

        console.log(
          `Message received via socket: ${message.text} for room: ${roomId}, isGroup: ${isGroup}, fromAPI: ${fromAPI}`
        );

        // If the message is already coming from the API, don't save again and don't broadcast
        if (fromAPI) {
          console.log(
            "Message already processed by API, skipping socket processing"
          );
          return;
        }

        // Ensure message has a unique ID
        if (!message.id) {
          message.id =
            Date.now().toString() +
            "-" +
            Math.random().toString(36).substr(2, 9);
        }

        // Check if this message already exists in Redis before processing
        const roomKey = `message:${roomId}`;
        const existingMessagesJson = await redisService.get(roomKey);
        if (existingMessagesJson) {
          const existingMessages = JSON.parse(existingMessagesJson);

          // Check for exact ID match first
          const isDuplicateById = existingMessages.some(
            (msg) => msg.id === message.id
          );
          if (isDuplicateById) {
            console.log(
              `Skipping duplicate message with ID ${message.id} in room ${roomId}`
            );
            return;
          }

          // Then check for content-based duplicates
          const isDuplicate = existingMessages.some(
            (msg) =>
              msg.sender.username === message.sender.username &&
              msg.text === message.text &&
              Math.abs(msg.date - message.date) < 30000 // Within 30 seconds
          );

          if (isDuplicate) {
            console.log(`Skipping duplicate message in room ${roomId}`);
            return;
          }
        }

        // Queue the message for batch saving
        queueMessageForSave(roomId, message);

        if (isGroup) {
          // Send to all members of the group except the sender
          socket.to(roomId).emit("newMessage", { roomId, message });

          // Don't emit back to the sender - frontend already has this message
          // The frontend logic will handle showing the message
        } else {
          // Get recipient from roomId (format: user1_user2)
          const users = roomId.split("_");
          const sender = socket.username;

          if (!sender) {
            socket.emit("error", { message: "Sender not authenticated" });
            return;
          }

          const recipient = users.find((user) => user !== sender);

          if (recipient && connectedUsers[recipient]) {
            // Send to recipient
            io.to(connectedUsers[recipient]).emit("newMessage", {
              roomId,
              message,
            });
          }

          // Don't emit back to the sender - frontend already has this message
        }
      } catch (error) {
        console.error("Error sending message:", error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    // Handle updating messages (e.g., when image upload completes)
    socket.on("updateMessage", async (data) => {
      try {
        const { roomId, messageId, updates } = data;

        if (!roomId || !messageId || !updates) {
          socket.emit("error", { message: "Invalid update data" });
          return;
        }

        // Broadcast the update to all relevant users
        if (roomId.startsWith("group:")) {
          // It's a group chat
          io.to(roomId).emit("messageUpdated", { roomId, messageId, updates });
        } else {
          // It's a DM
          const users = roomId.split("_");
          users.forEach((username) => {
            if (connectedUsers[username]) {
              io.to(connectedUsers[username]).emit("messageUpdated", {
                roomId,
                messageId,
                updates,
              });
            }
          });
        }

        // We'll update the message in Redis during the next batch save
        updateQueuedMessage(roomId, messageId, updates);
      } catch (error) {
        console.error("Error updating message:", error);
        socket.emit("error", { message: "Failed to update message" });
      }
    });

    // Join a room (for group chats)
    socket.on("joinRoom", (roomId) => {
      if (!roomId) return;

      socket.join(roomId);
      console.log(`${socket.username} joined room: ${roomId}`);

      // Notify the room that a user has joined
      socket.to(roomId).emit("userJoined", {
        username: socket.username,
        roomId,
      });
    });

    // Leave a room
    socket.on("leaveRoom", (roomId) => {
      if (!roomId) return;

      socket.leave(roomId);
      console.log(`${socket.username} left room: ${roomId}`);

      // Notify the room that a user has left
      socket.to(roomId).emit("userLeft", {
        username: socket.username,
        roomId,
      });
    });

    // Handle typing indicators
    socket.on("typing", (data) => {
      const { roomId, isTyping } = data;

      if (!roomId) return;

      // Notify other participants
      socket.to(roomId).emit("userTyping", {
        username: socket.username,
        roomId,
        isTyping,
      });
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);

      if (socket.username) {
        delete connectedUsers[socket.username];

        // Notify other users about offline status
        io.emit("onlineUsers", Object.keys(connectedUsers));
      }
    });

    // Handle errors
    socket.on("error", (error) => {
      console.error(`Socket error for ${socket.id}:`, error);
    });
  });
};

/**
 * Queue a message for batch saving to Redis
 * @param {string} roomId - The room/conversation ID
 * @param {object} message - The message object
 */
const queueMessageForSave = (roomId, message) => {
  if (!messageQueue[roomId]) {
    messageQueue[roomId] = [];
  }

  messageQueue[roomId].push({
    ...message,
    queued_at: Date.now(),
  });
};

/**
 * Update a message in the queue that hasn't been saved yet
 * @param {string} roomId - The room ID
 * @param {string} messageId - The message ID to update
 * @param {object} updates - The updates to apply
 */
const updateQueuedMessage = (roomId, messageId, updates) => {
  if (messageQueue[roomId]) {
    // Find the message in the queue
    const messageIndex = messageQueue[roomId].findIndex(
      (m) => m.id === messageId
    );
    if (messageIndex >= 0) {
      // Update the message
      messageQueue[roomId][messageIndex] = {
        ...messageQueue[roomId][messageIndex],
        ...updates,
        updated_at: Date.now(),
      };
    } else {
      // Message already saved to Redis, need to update it there
      updateSavedMessage(roomId, messageId, updates);
    }
  } else {
    // Message already saved to Redis, need to update it there
    updateSavedMessage(roomId, messageId, updates);
  }
};

/**
 * Update a message already saved in Redis
 * @param {string} roomId - The room ID
 * @param {string} messageId - The message ID
 * @param {object} updates - The updates to apply
 */
const updateSavedMessage = async (roomId, messageId, updates) => {
  try {
    const roomKey = `message:${roomId}`;
    const messagesJson = await redisService.get(roomKey);

    if (messagesJson) {
      const messages = JSON.parse(messagesJson);
      const messageIndex = messages.findIndex((m) => m.id === messageId);

      if (messageIndex >= 0) {
        messages[messageIndex] = {
          ...messages[messageIndex],
          ...updates,
          updated_at: Date.now(),
        };

        // Save back to Redis
        await redisService.set(roomKey, JSON.stringify(messages));
      }
    }
  } catch (error) {
    console.error("Error updating saved message:", error);
  }
};

/**
 * Process all queued messages and save them to Redis
 */
const processBatchSaves = async () => {
  // Exit if no messages to save
  if (Object.keys(messageQueue).length === 0) return;

  try {
    // For each room with queued messages
    for (const roomId of Object.keys(messageQueue)) {
      if (messageQueue[roomId].length === 0) continue;

      // Get current messages from Redis
      const roomKey = `message:${roomId}`;
      const existingMessagesJson = await redisService.get(roomKey);

      let messages = [];
      if (existingMessagesJson) {
        messages = JSON.parse(existingMessagesJson);
      }

      // Create a map of existing message IDs for deduplication
      const existingMessageIds = new Map();
      messages.forEach((msg) => {
        if (msg.id) {
          existingMessageIds.set(msg.id, true);
        } else if (msg.date && msg.sender && msg.text) {
          // Create a fallback ID if the message doesn't have one
          const fallbackId = `${msg.date}-${msg.sender.username}-${msg.text.substring(0, 10)}`;
          existingMessageIds.set(fallbackId, true);
          // Add the ID to the message for future reference
          msg.id = fallbackId;
        }
      });

      // Add only queued messages that don't already exist
      for (const queuedMessage of messageQueue[roomId]) {
        // Ensure each message has an ID
        if (!queuedMessage.id && queuedMessage.date && queuedMessage.sender) {
          queuedMessage.id = `${queuedMessage.date}-${queuedMessage.sender.username}-${queuedMessage.text.substring(0, 10)}`;
        }

        // Skip if this message already exists (by ID)
        if (queuedMessage.id && existingMessageIds.has(queuedMessage.id)) {
          console.log(
            `Skipping duplicate message ${queuedMessage.id} in room ${roomId}`
          );
          continue;
        }

        // Add to messages and mark as existing
        messages.push(queuedMessage);
        if (queuedMessage.id) {
          existingMessageIds.set(queuedMessage.id, true);
        }
      }

      // Save to Redis with a long expiry
      await redisService.set(
        roomKey,
        JSON.stringify(messages),
        60 * 60 * 24 * 30 // 30 days
      );

      // Clear the queue for this room
      messageQueue[roomId] = [];
    }
  } catch (error) {
    console.error("Error processing batch saves:", error);
  }
};

/**
 * Save a message to Redis (legacy method, use queueMessageForSave instead)
 * @param {string} roomId - The room/conversation ID
 * @param {object} message - The message object
 */
const saveMessage = async (roomId, message) => {
  try {
    // Get existing messages for this room
    const roomKey = `message:${roomId}`;
    const existingMessages = await redisService.get(roomKey);

    let messages = [];
    if (existingMessages) {
      messages = JSON.parse(existingMessages);
    }

    // Add new message
    messages.push({
      ...message,
      timestamp: Date.now(),
    });

    // Save back to Redis
    await redisService.set(
      roomKey,
      JSON.stringify(messages),
      60 * 60 * 24 * 30
    ); // 30 days

    return true;
  } catch (error) {
    console.error("Error saving message to Redis:", error);
    throw error;
  }
};

/**
 * Send a message to a specific user
 * @param {string} username - The recipient's username
 * @param {string} event - The event name
 * @param {object} data - The data to send
 */
const sendToUser = (username, event, data) => {
  if (connectedUsers[username]) {
    io.to(connectedUsers[username]).emit(event, data);
    return true;
  }
  return false;
};

/**
 * Broadcast a message to all connected users
 * @param {string} event - The event name
 * @param {object} data - The data to broadcast
 */
const broadcast = (event, data) => {
  io.emit(event, data);
};

/**
 * Get a list of currently online users
 * @returns {Array} Array of online usernames
 */
const getOnlineUsers = () => {
  return Object.keys(connectedUsers);
};

/**
 * Check if a user is online
 * @param {string} username - The username to check
 * @returns {boolean} True if the user is online
 */
const isUserOnline = (username) => {
  return !!connectedUsers[username];
};

/**
 * Clean up connections when the server shuts down
 */
const disconnect = async () => {
  if (io) {
    // Process any remaining messages in the queue
    await processBatchSaves();

    // Clear the save interval
    if (saveInterval) {
      clearInterval(saveInterval);
      saveInterval = null;
    }

    // Close all connections
    const sockets = await io.fetchSockets();
    sockets.forEach((socket) => {
      socket.disconnect(true);
    });

    console.log("All socket connections closed");
  }
};

module.exports = {
  initialize,
  sendToUser,
  broadcast,
  getOnlineUsers,
  isUserOnline,
  disconnect,
};
