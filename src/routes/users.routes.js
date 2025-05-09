const express = require("express");
const router = express.Router();
const usersController = require("../controllers/users.controller");

// Get all users
router.get("/", usersController.getAllUsers);

// Get user by username
router.get("/:username", usersController.getUserByUsername);

// Register new user
router.post("/register", usersController.registerUser);

// Login user
router.post("/login", usersController.loginUser);

// Follow user
router.post("/:followerUsername/follow", usersController.followUser);

// Unfollow user
router.post("/:followerUsername/unfollow", usersController.unfollowUser);

// Block user
router.post("/:blockerUsername/block", usersController.blockUser);

// Unblock user
router.post("/:blockerUsername/unblock", usersController.unblockUser);

// Update bookmarks
router.put("/:username/bookmarks", usersController.updateBookmarks);

// Update profile
router.put("/:username", usersController.updateProfile);

// Update user score based on signal targets
router.put("/:username/score", usersController.updateUserScore);

module.exports = router;
