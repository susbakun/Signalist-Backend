const redisService = require("./redis.service");

let io;
const connectedUsers = {};

/**
 * Initialize the Socket.io service
 * @param {Server} socketIo - The Socket.io server instance
 */
const initialize = (socketIo) => {
  io = socketIo;

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

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

    // Handle sending messages
    socket.on("sendMessage", async (data) => {
      try {
        const { roomId, message, isGroup } = data;

        if (!roomId || !message) {
          socket.emit("error", { message: "Invalid message data" });
          return;
        }

        console.log(
          `Message received: ${JSON.stringify(message)} for room: ${roomId}, isGroup: ${isGroup}`
        );

        // Store the message in Redis
        await saveMessage(roomId, message);

        if (isGroup) {
          // Send to all members of the group
          console.log(`Broadcasting message to group room: ${roomId}`);
          io.to(roomId).emit("newMessage", { roomId, message });
        } else {
          // Get recipient from roomId (format: user1_user2)
          const users = roomId.split("_");
          const sender = socket.username;

          if (!sender) {
            socket.emit("error", { message: "Sender not authenticated" });
            return;
          }

          const recipient = users.find((user) => user !== sender);

          console.log(`Sending message from ${sender} to ${recipient}`);

          // Send to the recipient (if they're online)
          if (recipient && connectedUsers[recipient]) {
            console.log(`Recipient ${recipient} is online, delivering message`);
            io.to(connectedUsers[recipient]).emit("newMessage", {
              roomId,
              message,
            });
          } else {
            console.log(
              `Recipient ${recipient} is offline, message will be delivered on next login`
            );
          }

          // Also send to the sender (for multi-device support)
          socket.emit("newMessage", { roomId, message });
        }
      } catch (error) {
        console.error("Error sending message:", error);
        socket.emit("error", { message: "Failed to send message" });
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
 * Save a message to Redis
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
    await redisService.set(roomKey, JSON.stringify(messages));

    return true;
  } catch (error) {
    console.error("Error saving message to Redis:", error);
    throw error;
  }
};

/**
 * Send a message to a specific user
 * @param {string} username - The recipient's username
 * @param {object} data - The data to send
 */
const sendToUser = (username, data) => {
  if (connectedUsers[username]) {
    io.to(connectedUsers[username]).emit("message", data);
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
    io.disconnectSockets();
    console.log("All socket connections closed");
  }
  return Promise.resolve();
};

module.exports = {
  initialize,
  sendToUser,
  broadcast,
  disconnect,
  getOnlineUsers,
  isUserOnline,
};
