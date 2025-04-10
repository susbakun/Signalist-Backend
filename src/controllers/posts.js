const { v4: uuidv4 } = require("uuid");
const { redisClient } = require("../services/redis");

// Helper function to get post by ID
async function getPostFromRedis(postId) {
  const post = await redisClient.get(`post:${postId}`);
  return post ? JSON.parse(post) : null;
}

// Get all posts
exports.getPosts = async (req, res) => {
  try {
    const postKeys = await redisClient.keys("post:*");
    const posts = await Promise.all(
      postKeys.map(async (key) => {
        const post = await redisClient.get(key);
        return JSON.parse(post);
      })
    );
    res.json({ data: posts });
  } catch (error) {
    res.status(500).json({ message: "Error fetching posts" });
  }
};

// Get a single post by ID
exports.getPostById = async (req, res) => {
  try {
    const post = await getPostFromRedis(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }
    res.json({ data: post });
  } catch (error) {
    res.status(500).json({ message: "Error fetching post" });
  }
};

// Create a new post
exports.createPost = async (req, res) => {
  try {
    const { content, isPremium, publisher, postImageHref } = req.body;
    const newPost = {
      id: uuidv4(),
      content,
      isPremium,
      publisher,
      postImageHref,
      date: new Date().toISOString(),
      likes: [],
      dislikes: [],
      comments: [],
    };
    await redisClient.set(`post:${newPost.id}`, JSON.stringify(newPost));
    res.status(201).json({ data: newPost });
  } catch (error) {
    res.status(500).json({ message: "Error creating post" });
  }
};

// Update a post
exports.updatePost = async (req, res) => {
  try {
    const post = await getPostFromRedis(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const { content, postImageHref, removePostImage } = req.body;
    post.content = content;

    if (removePostImage) {
      delete post.postImageHref;
    } else if (postImageHref) {
      post.postImageHref = postImageHref;
    }

    await redisClient.set(`post:${post.id}`, JSON.stringify(post));
    res.json({ data: post });
  } catch (error) {
    res.status(500).json({ message: "Error updating post" });
  }
};

// Delete a post
exports.deletePost = async (req, res) => {
  try {
    const exists = await redisClient.exists(`post:${req.params.id}`);
    if (!exists) {
      return res.status(404).json({ message: "Post not found" });
    }
    await redisClient.del(`post:${req.params.id}`);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: "Error deleting post" });
  }
};

// Like a post
exports.likePost = async (req, res) => {
  try {
    const post = await getPostFromRedis(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const { user } = req.body;
    const userIndex = post.likes.findIndex((u) => u.username === user.username);

    if (userIndex === -1) {
      post.likes.push(user);
      // Remove from dislikes if present
      post.dislikes = post.dislikes.filter((u) => u.username !== user.username);
    }

    await redisClient.set(`post:${post.id}`, JSON.stringify(post));
    res.json({ data: post });
  } catch (error) {
    res.status(500).json({ message: "Error liking post" });
  }
};

// Dislike a post
exports.dislikePost = async (req, res) => {
  try {
    const post = await getPostFromRedis(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const { user } = req.body;
    const userIndex = post.dislikes.findIndex(
      (u) => u.username === user.username
    );

    if (userIndex === -1) {
      post.dislikes.push(user);
      // Remove from likes if present
      post.likes = post.likes.filter((u) => u.username !== user.username);
    }

    await redisClient.set(`post:${post.id}`, JSON.stringify(post));
    res.json({ data: post });
  } catch (error) {
    res.status(500).json({ message: "Error disliking post" });
  }
};

// Add a comment to a post
exports.addComment = async (req, res) => {
  try {
    const post = await getPostFromRedis(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const { body, publisher } = req.body;
    const newComment = {
      commentId: uuidv4(),
      body,
      publisher,
      date: new Date().toISOString(),
      likes: [],
      dislikes: [],
    };

    post.comments.push(newComment);
    await redisClient.set(`post:${post.id}`, JSON.stringify(post));
    res.status(201).json({ data: newComment });
  } catch (error) {
    res.status(500).json({ message: "Error adding comment" });
  }
};

// Delete a comment
exports.deleteComment = async (req, res) => {
  try {
    const post = await getPostFromRedis(req.params.postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const commentIndex = post.comments.findIndex(
      (c) => c.commentId === req.params.commentId
    );
    if (commentIndex === -1) {
      return res.status(404).json({ message: "Comment not found" });
    }

    post.comments.splice(commentIndex, 1);
    await redisClient.set(`post:${post.id}`, JSON.stringify(post));
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: "Error deleting comment" });
  }
};

// Like a comment
exports.likeComment = async (req, res) => {
  try {
    const post = await getPostFromRedis(req.params.postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const comment = post.comments.find(
      (c) => c.commentId === req.params.commentId
    );
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const { user } = req.body;
    const userIndex = comment.likes.findIndex(
      (u) => u.username === user.username
    );

    if (userIndex === -1) {
      comment.likes.push(user);
      // Remove from dislikes if present
      comment.dislikes = comment.dislikes.filter(
        (u) => u.username !== user.username
      );
    }

    await redisClient.set(`post:${post.id}`, JSON.stringify(post));
    res.json({ data: comment });
  } catch (error) {
    res.status(500).json({ message: "Error liking comment" });
  }
};

// Dislike a comment
exports.dislikeComment = async (req, res) => {
  try {
    const post = await getPostFromRedis(req.params.postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const comment = post.comments.find(
      (c) => c.commentId === req.params.commentId
    );
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const { user } = req.body;
    const userIndex = comment.dislikes.findIndex(
      (u) => u.username === user.username
    );

    if (userIndex === -1) {
      comment.dislikes.push(user);
      // Remove from likes if present
      comment.likes = comment.likes.filter((u) => u.username !== user.username);
    }

    await redisClient.set(`post:${post.id}`, JSON.stringify(post));
    res.json({ data: comment });
  } catch (error) {
    res.status(500).json({ message: "Error disliking comment" });
  }
};
