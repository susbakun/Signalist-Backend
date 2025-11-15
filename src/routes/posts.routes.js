const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const databaseService = require("../services/database.service");
const auth = require("../middleware/auth");

// Helper function to get post by ID
async function getPostById(id) {
  const post = await databaseService.get(`post:${id}`);
  return post || null;
}

// Get all posts
router.get("/", async (req, res) => {
  try {
    const postKeys = await databaseService.keys("post:*");
    const posts = [];

    for (const key of postKeys) {
      const postJson = await databaseService.get(key);
      if (postJson) {
        posts.push(postJson);
      }
    }

    // Sort posts by date (newest first)
    posts.sort((a, b) => Number(b.date) - Number(a.date));

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

// Create a new post (requires authentication)
router.post("/", auth, async (req, res) => {
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
      user: publisher,
      isPremium: isPremium || false,
      likes: [],
      comments: [],
      date: new Date().getTime(),
    };

    if (postImageHref) {
      newPost.postImageHref = postImageHref;
    }

    // Save post with its own key
    await databaseService.set(`post:${newPost.id}`, JSON.stringify(newPost));

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

// Edit a post (requires authentication)
router.put("/:id", auth, async (req, res) => {
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

    // Use the proper database update method instead of the old Redis approach
    const updatedPost = await databaseService.updatePost(id, post);

    return res.status(200).json({
      success: true,
      message: "Post updated successfully",
      data: updatedPost,
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

// Remove a post (requires authentication)
router.delete("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const exists = await databaseService.exists(`post:${id}`);

    if (!exists) {
      return res.status(404).json({
        success: false,
        message: `Post with ID ${id} not found`,
      });
    }

    await databaseService.del(`post:${id}`);

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

// Like a post (requires authentication)
router.post("/:id/like", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req.body;

    if (!user || !user.username) {
      return res.status(400).json({
        success: false,
        message: "User information is required",
      });
    }

    // Get the user ID from the username
    const userRecord = await databaseService.getUser(user.username);
    if (!userRecord) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Use the new likePost method
    const result = await databaseService.likePost(id, userRecord.id);

    if (result.alreadyLiked) {
      return res.status(400).json({
        success: false,
        message: "Post already liked",
      });
    }

    // Get the updated post to return
    const updatedPost = await getPostById(id);

    return res.status(200).json({
      success: true,
      message: "Post liked successfully",
      data: updatedPost,
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

// Dislike a post (requires authentication)
router.post("/:id/dislike", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req.body;

    if (!user || !user.username) {
      return res.status(400).json({
        success: false,
        message: "User information is required",
      });
    }

    // Get the user ID from the username
    const userRecord = await databaseService.getUser(user.username);
    if (!userRecord) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Use the new unlikePost method
    const result = await databaseService.unlikePost(id, userRecord.id);

    if (result.alreadyUnliked) {
      return res.status(400).json({
        success: false,
        message: "Post not liked",
      });
    }

    // Get the updated post to return
    const updatedPost = await getPostById(id);

    return res.status(200).json({
      success: true,
      message: "Post disliked successfully",
      data: updatedPost,
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

// Add a comment to a post (requires authentication)
router.post("/:id/comments", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { body, publisher } = req.body;

    if (!body || !publisher) {
      return res.status(400).json({
        success: false,
        message: "Comment body and publisher are required",
      });
    }

    // Check if post exists
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

    // Use the new createComment method
    const createdComment = await databaseService.createComment(id, newComment);

    return res.status(201).json({
      success: true,
      message: "Comment added successfully",
      data: createdComment,
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

// Delete a comment (requires authentication)
router.delete("/:id/comments/:commentId", auth, async (req, res) => {
  try {
    const { id, commentId } = req.params;

    // Use the new deleteComment method
    const result = await databaseService.deleteComment(id, commentId);

    if (result.notFound) {
      return res.status(404).json({
        success: false,
        message: "Comment not found",
      });
    }

    if (result.unauthorized) {
      return res.status(403).json({
        success: false,
        message: "Comment does not belong to this post",
      });
    }

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

// Like a comment (requires authentication)
router.post("/:id/comments/:commentId/like", auth, async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const { user } = req.body;

    if (!user || !user.username) {
      return res.status(400).json({
        success: false,
        message: "User information is required",
      });
    }

    // Get the user ID from the username
    const userRecord = await databaseService.getUser(user.username);
    if (!userRecord) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Use the new likeComment method
    const result = await databaseService.likeComment(commentId, userRecord.id);

    if (result.alreadyLiked) {
      return res.status(400).json({
        success: false,
        message: "Comment already liked",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Comment liked successfully",
      data: result.like,
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

// Dislike a comment (requires authentication)
router.post("/:id/comments/:commentId/dislike", auth, async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const { user } = req.body;

    if (!user || !user.username) {
      return res.status(400).json({
        success: false,
        message: "User information is required",
      });
    }

    // Get the user ID from the username
    const userRecord = await databaseService.getUser(user.username);
    if (!userRecord) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Use the new unlikeComment method
    const result = await databaseService.unlikeComment(
      commentId,
      userRecord.id
    );

    if (result.alreadyUnliked) {
      return res.status(400).json({
        success: false,
        message: "Comment not liked",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Comment disliked successfully",
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
