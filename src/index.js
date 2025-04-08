require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

// Initialize Express app
const app = express();
const port = process.env.PORT || 5000;

// Import Redis service
const redisService = require("./services/redis.service");

// Ensure Redis connection is established
try {
  // Redis service is initialized when imported
  console.log("Connected to Redis successfully");
} catch (error) {
  console.error("Redis connection error:", error);
  process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

// Routes
app.get("/", (req, res) => {
  res.json({ message: "Welcome to Signalist Backend API" });
});

// API routes
app.use("/api", require("./routes"));

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
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("Shutting down gracefully");
  redisService
    .disconnect()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error("Error during shutdown:", err);
      process.exit(1);
    });
});
