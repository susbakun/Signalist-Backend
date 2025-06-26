require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const multer = require("multer");
const http = require("http");
const usersRoutes = require("./routes/users.routes");
const signalsRoutes = require("./routes/signals.routes");
const postsRoutes = require("./routes/posts.routes");
const newsRoutes = require("./routes/news.routes");
const messagesRoutes = require("./routes/messages.routes");

const usersController = require("./controllers/users.controller");
const signalsController = require("./controllers/signals.controller");
const postsController = require("./controllers/posts.controller");
const messagesController = require("./controllers/messages.controller");

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Create HTTP server
const server = http.createServer(app);

// Get allowed origins from environment or use default
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["https://signalisttech.com", "http://localhost:5173"];

// Initialize Socket.io
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Authenticate user and join their personal room
  socket.on("authenticate", (username) => {
    if (username) {
      socket.join(username);
      console.log(`User ${username} authenticated and joined personal room`);
    }
  });

  // Handle new messages (this is for frontend socket events, not used currently)
  socket.on("sendMessage", async (data) => {
    try {
      const { roomId, message, recipients } = data;
      console.log(`Received sendMessage event for room ${roomId}:`, message);

      // Emit to all recipients
      if (recipients && Array.isArray(recipients)) {
        recipients.forEach((recipient) => {
          io.to(recipient).emit("newMessage", message);
        });
      }

      // Also emit to the room itself for group conversations
      io.to(roomId).emit("newMessage", message);
    } catch (error) {
      console.error("Error handling sendMessage event:", error);
    }
  });

  // Join a specific chat room
  socket.on("joinRoom", (roomId) => {
    if (roomId) {
      socket.join(roomId);
      console.log(`Socket ${socket.id} joined room: ${roomId}`);

      // Get all rooms the socket is in
      console.log(
        `Socket ${socket.id} is now in rooms:`,
        Array.from(socket.rooms)
      );
    }
  });

  // Leave a specific chat room
  socket.on("leaveRoom", (roomId) => {
    if (roomId) {
      socket.leave(roomId);
      console.log(`Socket ${socket.id} left room: ${roomId}`);
    }
  });

  // Handle disconnection
  socket.on("disconnect", (reason) => {
    console.log(`Socket disconnected: ${socket.id}, reason: ${reason}`);
  });
});

// Middleware
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

// Make io instance available to all routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Multer setup for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Routes
app.get("/", (req, res) => {
  res.json({ message: "Welcome to Signalist Backend API" });
});

// Define routes
app.use("/api/users", usersRoutes);
app.use("/api/signals", signalsRoutes);
app.use("/api/posts", postsRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/messages", messagesRoutes);

// Upload routes
app.post(
  "/api/upload/signals",
  upload.single("file"),
  signalsController.uploadImage
);
app.post(
  "/api/upload/posts",
  upload.single("file"),
  postsController.uploadImage
);
app.post(
  "/api/upload/users",
  upload.single("file"),
  usersController.uploadImage
);

app.post(
  "/api/upload/messages",
  upload.single("file"),
  messagesController.uploadImage
);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: "Internal Server Error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Start server
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("Shutting down gracefully");
  process.exit(0);
});
