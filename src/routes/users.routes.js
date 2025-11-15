const express = require("express");
const router = express.Router();
const usersController = require("../controllers/users.controller");
const auth = require("../middleware/auth");

// Get all users
router.get("/", usersController.getAllUsers);

// Debug endpoint to test cookies (no auth required)
router.get("/debug-cookies", (req, res) => {
  console.log("🐛 Debug cookies endpoint called");
  console.log("🍪 All cookies:", req.cookies);
  console.log("🍪 Headers:", req.headers.cookie);
  console.log("🌐 Origin:", req.headers.origin);
  console.log("🌐 Referer:", req.headers.referer);
  console.log("🌐 Host:", req.headers.host);

  const isCrossOrigin =
    req.headers.origin &&
    req.headers.origin !== `${req.protocol}://${req.headers.host}`;

  res.json({
    success: true,
    cookies: req.cookies,
    rawCookieHeader: req.headers.cookie,
    hasAuthToken: !!req.cookies.authToken,
    isCrossOrigin: isCrossOrigin,
    environment: process.env.NODE_ENV,
    origin: req.headers.origin,
    host: req.headers.host,
  });
});

// Get current authenticated user (requires authentication)
router.get("/me", auth, usersController.getCurrentUser);

// Get signals count for a specific user
router.get("/:username/signals/count", usersController.getUserSignalsCount);

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
