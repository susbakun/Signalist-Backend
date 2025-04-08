const express = require("express");
const router = express.Router();
const { body, param } = require("express-validator");
const { validateRequest } = require("../middleware/validateRequest");
const {
  getPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  likePost,
  dislikePost,
  addComment,
  deleteComment,
  likeComment,
  dislikeComment,
} = require("../controllers/posts");

// Get all posts
router.get("/", getPosts);

// Get a single post
router.get("/:id", param("id").isString(), validateRequest, getPostById);

// Create a new post
router.post(
  "/",
  [
    body("content").isString().notEmpty(),
    body("isPremium").isBoolean(),
    body("publisher").isObject(),
    body("publisher.username").isString(),
    body("publisher.name").isString(),
    body("publisher.imageUrl").isString(),
    body("postImageId").optional().isString(),
  ],
  validateRequest,
  createPost
);

// Update a post
router.put(
  "/:id",
  [
    param("id").isString(),
    body("content").isString().notEmpty(),
    body("postImageId").optional().isString(),
    body("removePostImage").optional().isBoolean(),
  ],
  validateRequest,
  updatePost
);

// Delete a post
router.delete("/:id", param("id").isString(), validateRequest, deletePost);

// Like a post
router.post(
  "/:id/like",
  [
    param("id").isString(),
    body("user").isObject(),
    body("user.username").isString(),
    body("user.name").isString(),
    body("user.imageUrl").isString(),
  ],
  validateRequest,
  likePost
);

// Dislike a post
router.post(
  "/:id/dislike",
  [
    param("id").isString(),
    body("user").isObject(),
    body("user.username").isString(),
    body("user.name").isString(),
    body("user.imageUrl").isString(),
  ],
  validateRequest,
  dislikePost
);

// Add a comment to a post
router.post(
  "/:id/comments",
  [
    param("id").isString(),
    body("body").isString().notEmpty(),
    body("publisher").isObject(),
    body("publisher.username").isString(),
    body("publisher.name").isString(),
    body("publisher.imageUrl").isString(),
  ],
  validateRequest,
  addComment
);

// Delete a comment
router.delete(
  "/:postId/comments/:commentId",
  [param("postId").isString(), param("commentId").isString()],
  validateRequest,
  deleteComment
);

// Like a comment
router.post(
  "/:postId/comments/:commentId/like",
  [
    param("postId").isString(),
    param("commentId").isString(),
    body("user").isObject(),
    body("user.username").isString(),
    body("user.name").isString(),
    body("user.imageUrl").isString(),
  ],
  validateRequest,
  likeComment
);

// Dislike a comment
router.post(
  "/:postId/comments/:commentId/dislike",
  [
    param("postId").isString(),
    param("commentId").isString(),
    body("user").isObject(),
    body("user.username").isString(),
    body("user.name").isString(),
    body("user.imageUrl").isString(),
  ],
  validateRequest,
  dislikeComment
);

module.exports = router;
