const express = require("express");
const router = express.Router();
const signalsController = require("../controllers/signals.controller");
const multer = require("multer");
const upload = multer();

// Get all signals
router.get("/", signalsController.getSignals);

// Get a single signal by ID
router.get("/:id", signalsController.getSignalById);

// Create a new signal
router.post("/", signalsController.createSignal);

// Update signal status
router.put("/:id/status", signalsController.updateSignalStatus);

// Like a signal
router.post("/:id/like", signalsController.likeSignal);

// Dislike a signal
router.post("/:id/dislike", signalsController.dislikeSignal);

// Delete a signal
router.delete("/:id", signalsController.deleteSignal);

// Upload image
router.post("/upload", upload.single("file"), signalsController.uploadImage);

module.exports = router;
