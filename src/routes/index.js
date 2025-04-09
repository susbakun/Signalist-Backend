const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer();
const signalsController = require("../controllers/signals.controller");

// Import route modules
const dataRoutes = require("./data.routes");
const postsRoutes = require("./posts.routes");
const signalsRoutes = require("./signals.routes");

// Define routes
router.use("/data", dataRoutes);
router.use("/posts", postsRoutes);
router.use("/signals", signalsRoutes);

// Direct upload route at the root level
router.post("/upload", upload.single("file"), signalsController.uploadImage);

// Health check endpoint
router.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

module.exports = router;
