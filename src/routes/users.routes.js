const express = require("express");
const router = express.Router();
const usersController = require("../controllers/users.controller");
const auth = require("../middleware/auth");

// Get all users
router.get("/", usersController.getAllUsers);

// Get current authenticated user (requires authentication) - MUST come before /:username
router.get("/me", auth, usersController.getCurrentUser);

// Get user by username - MUST come after specific routes
router.get("/:username", usersController.getUserByUsername);

// Register new user
router.post("/register", usersController.registerUser);

// Login user
router.post("/login", usersController.loginUser);

// Logout user
router.post("/logout", usersController.logoutUser);

// Follow user (requires authentication)
router.post("/:followerUsername/follow", auth, usersController.followUser);

// Unfollow user (requires authentication)
router.post("/:followerUsername/unfollow", auth, usersController.unfollowUser);

// Block user (requires authentication)
router.post("/:blockerUsername/block", auth, usersController.blockUser);

// Unblock user (requires authentication)
router.post("/:blockerUsername/unblock", auth, usersController.unblockUser);

// Update bookmarks (requires authentication)
router.put("/:username/bookmarks", auth, usersController.updateBookmarks);

// Update profile (requires authentication)
router.put("/:username", auth, usersController.updateProfile);

// Update user score based on signal targets (requires authentication)
router.put("/:username/score", auth, usersController.updateUserScore);

module.exports = router;
