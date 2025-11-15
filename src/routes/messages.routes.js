const express = require("express");
const router = express.Router();
const messagesController = require("../controllers/messages.controller");
const auth = require("../middleware/auth");
const multer = require("multer");
const upload = multer();

// Get all conversations for a user (requires authentication)
router.get("/user/:username", auth, messagesController.getUserConversations);

// Get messages for a specific conversation (requires authentication)
router.get(
  "/conversation/:roomId",
  auth,
  messagesController.getConversationMessages
);

// Send a message to a conversation (requires authentication)
router.post("/conversation/:roomId", auth, messagesController.sendMessage);

// Create a new direct message conversation (requires authentication)
router.post("/dm", auth, messagesController.createDMConversation);

// Create a new group conversation (requires authentication)
router.post("/group", auth, messagesController.createGroupConversation);

// Upload image for a message (requires authentication)
router.post(
  "/upload",
  auth,
  upload.single("file"),
  messagesController.uploadImage
);

module.exports = router;
