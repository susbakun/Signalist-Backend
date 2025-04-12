const express = require("express");
const multer = require("multer");
const messagesController = require("../controllers/messages.controller");
const auth = require("../middleware/auth");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Apply authentication middleware
router.use(auth);

// Get all conversations for a user
router.get("/user/:username", messagesController.getUserConversations);

// Get messages for a specific conversation
router.get("/conversation/:roomId", messagesController.getConversationMessages);

// Send a message
router.post("/conversation/:roomId", messagesController.sendMessage);

// Create a direct message conversation
router.post("/dm", messagesController.createDMConversation);

// Create a group conversation
router.post("/group", messagesController.createGroupConversation);

// Upload image for a message
router.post("/upload", upload.single("file"), messagesController.uploadImage);

module.exports = router;
