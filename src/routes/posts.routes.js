const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const redisService = require("../services/redis.service");

// Helper function to get post by ID
async function getPostById(id) {
  const post = await redisService.get(`post:${id}`);
  return post ? JSON.parse(post) : null;
}

// Get all posts
router.get("/", async (req, res) => {
  try {
    const postKeys = await redisService.keys("post:*");
    const posts = [];

    for (const key of postKeys) {
      const postJson = await redisService.get(key);
      if (postJson) {
        posts.push(JSON.parse(postJson));
      }
    }

    // Sort posts by date (newest first)
    posts.sort((a, b) => b.date - a.date);

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
    const post = await getPostById(id);

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
    const { content, publisher, isPremium, postImageHref } = req.body;

    if (!content || !publisher) {
      return res.status(400).json({
        success: false,
        message: "Content and publisher are required",
      });
    }

    const newPost = {
      id: uuidv4(),
      content,
      publisher,
      isPremium: isPremium || false,
      likes: [],
      comments: [],
      date: new Date().getTime(),
    };

    if (postImageHref) {
      newPost.postImageHref = postImageHref;
    }

    // Save post with its own key
    await redisService.set(`post:${newPost.id}`, JSON.stringify(newPost));

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
    const { content, postImageHref, removePostImage } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        message: "Content is required",
      });
    }

    const post = await getPostById(id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: `Post with ID ${id} not found`,
      });
    }

    // Update the post
    post.content = content;
    post.date = new Date().getTime(); // Update timestamp

    if (postImageHref) {
      post.postImageHref = postImageHref;
    }

    if (removePostImage) {
      delete post.postImageHref;
    }

    await redisService.set(`post:${id}`, JSON.stringify(post));

    return res.status(200).json({
      success: true,
      message: "Post updated successfully",
      data: post,
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
    const exists = await redisService.exists(`post:${id}`);

    if (!exists) {
      return res.status(404).json({
        success: false,
        message: `Post with ID ${id} not found`,
      });
    }

    await redisService.del(`post:${id}`);

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

    const post = await getPostById(id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: `Post with ID ${id} not found`,
      });
    }

    // Check if already liked
    const alreadyLiked = post.likes.some(
      (like) => like.username === user.username
    );

    if (!alreadyLiked) {
      post.likes.push(user);
    }

    await redisService.set(`post:${id}`, JSON.stringify(post));

    return res.status(200).json({
      success: true,
      message: "Post liked successfully",
      data: post,
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

    const post = await getPostById(id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: `Post with ID ${id} not found`,
      });
    }

    // Remove user from likes
    post.likes = post.likes.filter((u) => u.username !== user.username);
    await redisService.set(`post:${id}`, JSON.stringify(post));

    return res.status(200).json({
      success: true,
      message: "Post disliked successfully",
      data: post,
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

    const post = await getPostById(id);

    if (!post) {
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

    post.comments.push(newComment);
    await redisService.set(`post:${id}`, JSON.stringify(post));

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

    const post = await getPostById(id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: `Post with ID ${id} not found`,
      });
    }

    const commentIndex = post.comments.findIndex(
      (c) => c.commentId === commentId
    );

    if (commentIndex === -1) {
      return res.status(404).json({
        success: false,
        message: `Comment with ID ${commentId} not found`,
      });
    }

    // Remove the comment
    post.comments = post.comments.filter((c) => c.commentId !== commentId);
    await redisService.set(`post:${id}`, JSON.stringify(post));

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

    const post = await getPostById(id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: `Post with ID ${id} not found`,
      });
    }

    const commentIndex = post.comments.findIndex(
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
      post.comments[commentIndex].likes.some(
        (u) => u.username === user.username
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "User already liked this comment",
      });
    }

    // Add user to comment likes
    post.comments[commentIndex].likes.push(user);
    await redisService.set(`post:${id}`, JSON.stringify(post));

    return res.status(200).json({
      success: true,
      message: "Comment liked successfully",
      data: post.comments[commentIndex],
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

    const post = await getPostById(id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: `Post with ID ${id} not found`,
      });
    }

    const commentIndex = post.comments.findIndex(
      (c) => c.commentId === commentId
    );

    if (commentIndex === -1) {
      return res.status(404).json({
        success: false,
        message: `Comment with ID ${commentId} not found`,
      });
    }

    // Remove user from comment likes
    post.comments[commentIndex].likes = post.comments[
      commentIndex
    ].likes.filter((u) => u.username !== user.username);
    await redisService.set(`post:${id}`, JSON.stringify(post));

    return res.status(200).json({
      success: true,
      message: "Comment disliked successfully",
      data: post.comments[commentIndex],
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
