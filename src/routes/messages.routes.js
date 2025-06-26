const express = require("express");
const router = express.Router();
const messagesController = require("../controllers/messages.controller");
const multer = require("multer");
const upload = multer();

// Get all conversations for a user
router.get("/user/:username", messagesController.getUserConversations);

// Get messages for a specific conversation
router.get("/conversation/:roomId", messagesController.getConversationMessages);

// Send a message to a conversation
router.post("/conversation/:roomId", messagesController.sendMessage);

// Create a new direct message conversation
router.post("/dm", messagesController.createDMConversation);

// Create a new group conversation
router.post("/group", messagesController.createGroupConversation);

// Upload image for a message
router.post("/upload", upload.single("file"), messagesController.uploadImage);

module.exports = router;
