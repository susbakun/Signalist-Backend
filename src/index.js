require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const multer = require("multer");
const http = require("http");
const { Server } = require("socket.io");
const usersRoutes = require("./routes/users.routes");
const signalsRoutes = require("./routes/signals.routes");
const postsRoutes = require("./routes/posts.routes");
const messagesRoutes = require("./routes/messages.routes");
const socketService = require("./services/socket.service");

// Import controllers for upload handling
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

// Setup Socket.io with CORS configuration
const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Initialize socket service
socketService.initialize(io);

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
  socketService
    .disconnect()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error("Error during shutdown:", err);
      process.exit(1);
    });
});
