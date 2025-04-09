const express = require("express");
const router = express.Router();

// Import route modules
const dataRoutes = require("./data.routes");
const postsRoutes = require("./posts.routes");
const signalsRoutes = require("./signals.routes");

// Define routes
router.use("/data", dataRoutes);
router.use("/posts", postsRoutes);
router.use("/signals", signalsRoutes);

// Health check endpoint
router.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

module.exports = router;
