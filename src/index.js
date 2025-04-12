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

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Create HTTP server
const server = http.createServer(app);

// Setup Socket.io with CORS configuration
const io = new Server(server, {
  cors: {
    origin: "*", // In production, specify exact origins
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Initialize socket service
socketService.initialize(io);

// Middleware
app.use(cors());
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

// Upload route
app.post("/api/upload/:type", upload.single("file"), (req, res) => {
  const { type } = req.params;

  // Route the file upload to the appropriate controller based on 'type'
  switch (type) {
    case "signals":
      return signalsRoutes.uploadImage(req, res);
    case "posts":
      return postsRoutes.uploadImage(req, res);
    case "users":
      return usersRoutes.uploadImage(req, res);
    case "messages":
      return messagesRoutes.uploadImage(req, res);
    default:
      return res.status(400).json({ message: "Invalid upload type" });
  }
});

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
