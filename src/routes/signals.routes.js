const express = require("express");
const router = express.Router();
const signalsController = require("../controllers/signals.controller");
const auth = require("../middleware/auth");
const multer = require("multer");
const upload = multer();

// Get all signals
router.get("/", signalsController.getSignals);

// Get a single signal by ID
router.get("/:id", signalsController.getSignalById);

// Create a new signal (requires authentication)
router.post("/", auth, signalsController.createSignal);

// Update signal status (requires authentication)
router.put("/:id/status", auth, signalsController.updateSignalStatus);

// Like a signal (requires authentication)
router.post("/:id/like", auth, signalsController.likeSignal);

// Dislike a signal (requires authentication)
router.post("/:id/dislike", auth, signalsController.dislikeSignal);

// Edit a signal (requires authentication)
router.put("/:id", auth, signalsController.updateSignal);

// Delete a signal (requires authentication)
router.delete("/:id", auth, signalsController.deleteSignal);

// Upload image (requires authentication)
router.post(
  "/upload",
  auth,
  upload.single("file"),
  signalsController.uploadImage
);

module.exports = router;
