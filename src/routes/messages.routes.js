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

// Send a message to a conversation
router.post("/conversation/:roomId", messagesController.sendMessage);

// Create a new direct message (DM) conversation
router.post("/dm", messagesController.createDMConversation);

// Create a new group conversation
router.post("/group", messagesController.createGroupConversation);

// Upload image for a message
router.post("/upload", upload.single("image"), messagesController.uploadImage);

module.exports = router;
