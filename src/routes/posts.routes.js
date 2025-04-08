const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const redisService = require("../services/redis.service");

// Redis key for posts collection
const POSTS_KEY = "posts";

// Helper function to get all posts
async function getAllPosts() {
  const posts = await redisService.get(POSTS_KEY);
  return posts || [];
}

// Helper function to save all posts
async function savePosts(posts) {
  return await redisService.set(POSTS_KEY, posts);
}

// Get all posts
router.get("/", async (req, res) => {
  try {
    const posts = await getAllPosts();
    return res.status(200).json({
      success: true,
      data: posts,
    });
  } catch (error) {
    console.error("Error fetching posts:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch posts",
      error: error.message,
    });
  }
});

// Get a single post by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const posts = await getAllPosts();
    const post = posts.find((p) => p.id === id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: `Post with ID ${id} not found`,
      });
    }

    return res.status(200).json({
      success: true,
      data: post,
    });
  } catch (error) {
    console.error("Error fetching post:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch post",
      error: error.message,
    });
  }
});

// Create a new post
router.post("/", async (req, res) => {
  try {
    const { content, publisher, isPremium, postImageId } = req.body;

    if (!content || !publisher) {
      return res.status(400).json({
        success: false,
        message: "Content and publisher are required",
      });
    }

    const posts = await getAllPosts();

    const newPost = {
      id: uuidv4(),
      content,
      publisher,
      isPremium: isPremium || false,
      likes: [],
      comments: [],
      date: new Date().getTime(),
    };

    if (postImageId) {
      newPost.postImageId = postImageId;
    }

    posts.push(newPost);
    await savePosts(posts);

    return res.status(201).json({
      success: true,
      message: "Post created successfully",
      data: newPost,
    });
  } catch (error) {
    console.error("Error creating post:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create post",
      error: error.message,
    });
  }
});

// Edit a post
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { content, postImageId, removePostImage } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        message: "Content is required",
      });
    }

    const posts = await getAllPosts();
    const postIndex = posts.findIndex((p) => p.id === id);

    if (postIndex === -1) {
      return res.status(404).json({
        success: false,
        message: `Post with ID ${id} not found`,
      });
    }

    // Update the post
    posts[postIndex] = {
      ...posts[postIndex],
      content,
      date: new Date().getTime(),
    };

    if (postImageId) {
      posts[postIndex].postImageId = postImageId;
    }

    if (removePostImage) {
      posts[postIndex].postImageId = "";
    }

    await savePosts(posts);

    return res.status(200).json({
      success: true,
      message: "Post updated successfully",
      data: posts[postIndex],
    });
  } catch (error) {
    console.error("Error updating post:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update post",
      error: error.message,
    });
  }
});

// Remove a post
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const posts = await getAllPosts();
    const filteredPosts = posts.filter((p) => p.id !== id);

    if (posts.length === filteredPosts.length) {
      return res.status(404).json({
        success: false,
        message: `Post with ID ${id} not found`,
      });
    }

    await savePosts(filteredPosts);

    return res.status(200).json({
      success: true,
      message: "Post removed successfully",
    });
  } catch (error) {
    console.error("Error removing post:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to remove post",
      error: error.message,
    });
  }
});

// Like a post
router.post("/:id/like", async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req.body;

    if (!user || !user.username) {
      return res.status(400).json({
        success: false,
        message: "User information is required",
      });
    }

    const posts = await getAllPosts();
    const postIndex = posts.findIndex((p) => p.id === id);

    if (postIndex === -1) {
      return res.status(404).json({
        success: false,
        message: `Post with ID ${id} not found`,
      });
    }

    // Check if user already liked the post
    if (posts[postIndex].likes.some((u) => u.username === user.username)) {
      return res.status(400).json({
        success: false,
        message: "User already liked this post",
      });
    }

    // Add user to likes
    posts[postIndex].likes.push(user);
    await savePosts(posts);

    return res.status(200).json({
      success: true,
      message: "Post liked successfully",
      data: posts[postIndex],
    });
  } catch (error) {
    console.error("Error liking post:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to like post",
      error: error.message,
    });
  }
});

// Dislike a post
router.post("/:id/dislike", async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req.body;

    if (!user || !user.username) {
      return res.status(400).json({
        success: false,
        message: "User information is required",
      });
    }

    const posts = await getAllPosts();
    const postIndex = posts.findIndex((p) => p.id === id);

    if (postIndex === -1) {
      return res.status(404).json({
        success: false,
        message: `Post with ID ${id} not found`,
      });
    }

    // Remove user from likes
    posts[postIndex].likes = posts[postIndex].likes.filter(
      (u) => u.username !== user.username
    );
    await savePosts(posts);

    return res.status(200).json({
      success: true,
      message: "Post disliked successfully",
      data: posts[postIndex],
    });
  } catch (error) {
    console.error("Error disliking post:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to dislike post",
      error: error.message,
    });
  }
});

// Add a comment to a post
router.post("/:id/comments", async (req, res) => {
  try {
    const { id } = req.params;
    const { body, publisher } = req.body;

    if (!body || !publisher) {
      return res.status(400).json({
        success: false,
        message: "Comment body and publisher are required",
      });
    }

    const posts = await getAllPosts();
    const postIndex = posts.findIndex((p) => p.id === id);

    if (postIndex === -1) {
      return res.status(404).json({
        success: false,
        message: `Post with ID ${id} not found`,
      });
    }

    const newComment = {
      commentId: uuidv4(),
      postId: id,
      body,
      publisher,
      date: new Date().getTime(),
      likes: [],
    };

    posts[postIndex].comments.push(newComment);
    await savePosts(posts);

    return res.status(201).json({
      success: true,
      message: "Comment added successfully",
      data: newComment,
    });
  } catch (error) {
    console.error("Error adding comment:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add comment",
      error: error.message,
    });
  }
});

// Delete a comment
router.delete("/:id/comments/:commentId", async (req, res) => {
  try {
    const { id, commentId } = req.params;

    const posts = await getAllPosts();
    const postIndex = posts.findIndex((p) => p.id === id);

    if (postIndex === -1) {
      return res.status(404).json({
        success: false,
        message: `Post with ID ${id} not found`,
      });
    }

    const commentIndex = posts[postIndex].comments.findIndex(
      (c) => c.commentId === commentId
    );

    if (commentIndex === -1) {
      return res.status(404).json({
        success: false,
        message: `Comment with ID ${commentId} not found`,
      });
    }

    // Remove the comment
    posts[postIndex].comments = posts[postIndex].comments.filter(
      (c) => c.commentId !== commentId
    );
    await savePosts(posts);

    return res.status(200).json({
      success: true,
      message: "Comment deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting comment:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete comment",
      error: error.message,
    });
  }
});

// Like a comment
router.post("/:id/comments/:commentId/like", async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const { user } = req.body;

    if (!user || !user.username) {
      return res.status(400).json({
        success: false,
        message: "User information is required",
      });
    }

    const posts = await getAllPosts();
    const postIndex = posts.findIndex((p) => p.id === id);

    if (postIndex === -1) {
      return res.status(404).json({
        success: false,
        message: `Post with ID ${id} not found`,
      });
    }

    const commentIndex = posts[postIndex].comments.findIndex(
      (c) => c.commentId === commentId
    );

    if (commentIndex === -1) {
      return res.status(404).json({
        success: false,
        message: `Comment with ID ${commentId} not found`,
      });
    }

    // Check if user already liked the comment
    if (
      posts[postIndex].comments[commentIndex].likes.some(
        (u) => u.username === user.username
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "User already liked this comment",
      });
    }

    // Add user to comment likes
    posts[postIndex].comments[commentIndex].likes.push(user);
    await savePosts(posts);

    return res.status(200).json({
      success: true,
      message: "Comment liked successfully",
      data: posts[postIndex].comments[commentIndex],
    });
  } catch (error) {
    console.error("Error liking comment:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to like comment",
      error: error.message,
    });
  }
});

// Dislike a comment
router.post("/:id/comments/:commentId/dislike", async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const { user } = req.body;

    if (!user || !user.username) {
      return res.status(400).json({
        success: false,
        message: "User information is required",
      });
    }

    const posts = await getAllPosts();
    const postIndex = posts.findIndex((p) => p.id === id);

    if (postIndex === -1) {
      return res.status(404).json({
        success: false,
        message: `Post with ID ${id} not found`,
      });
    }

    const commentIndex = posts[postIndex].comments.findIndex(
      (c) => c.commentId === commentId
    );

    if (commentIndex === -1) {
      return res.status(404).json({
        success: false,
        message: `Comment with ID ${commentId} not found`,
      });
    }

    // Remove user from comment likes
    posts[postIndex].comments[commentIndex].likes = posts[postIndex].comments[
      commentIndex
    ].likes.filter((u) => u.username !== user.username);
    await savePosts(posts);

    return res.status(200).json({
      success: true,
      message: "Comment disliked successfully",
      data: posts[postIndex].comments[commentIndex],
    });
  } catch (error) {
    console.error("Error disliking comment:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to dislike comment",
      error: error.message,
    });
  }
});

module.exports = router;
