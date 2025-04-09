const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const redisService = require("../services/redis.service");

// Set up S3 client for Liara Object Storage
const s3Client = new S3Client({
  region: "default",
  endpoint: process.env.LIARA_ENDPOINT,
  credentials: {
    accessKeyId: process.env.LIARA_ACCESS_KEY,
    secretAccessKey: process.env.LIARA_SECRET_KEY,
  },
});

// Helper to find user by username from Redis
const findUserByUsername = async (username) => {
  try {
    const userJson = await redisService.get(`user:${username}`);
    return userJson ? JSON.parse(userJson) : null;
  } catch (error) {
    console.error(`Error finding user ${username}:`, error);
    return null;
  }
};

// Helper to find user by email from Redis
const findUserByEmail = async (email) => {
  try {
    const usersKeys = await redisService.keys("user:*");
    for (const key of usersKeys) {
      const userJson = await redisService.get(key);
      const user = JSON.parse(userJson);
      if (user.email === email) {
        return user;
      }
    }
    return null;
  } catch (error) {
    console.error(`Error finding user with email ${email}:`, error);
    return null;
  }
};

// Get all users
exports.getAllUsers = async (req, res) => {
  try {
    const userKeys = await redisService.keys("user:*");
    const users = [];

    for (const key of userKeys) {
      const userJson = await redisService.get(key);
      if (userJson) {
        const user = JSON.parse(userJson);
        // Remove sensitive information
        const { password, ...safeUser } = user;
        users.push(safeUser);
      }
    }

    res.json(users);
  } catch (error) {
    console.error("Error getting all users:", error);
    res.status(500).json({ message: "Error retrieving users" });
  }
};

// Get user by username
exports.getUserByUsername = async (req, res) => {
  try {
    const user = await findUserByUsername(req.params.username);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Return user without password
    const { password, ...safeUser } = user;
    res.json(safeUser);
  } catch (error) {
    console.error("Error getting user:", error);
    res.status(500).json({ message: "Error retrieving user" });
  }
};

// Register new user
exports.registerUser = async (req, res) => {
  const { name, username, email, password, imageUrl, bio } = req.body;

  // Validation
  if (!name || !username || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "Name, username, email, and password are required",
    });
  }

  try {
    // Check if user already exists
    const existingUser = await findUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Username already taken",
      });
    }

    const existingEmail = await findUserByEmail(email);
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: "Email already registered",
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const newUser = {
      name,
      username,
      email,
      password: hashedPassword,
      imageUrl: imageUrl || "",
      bio: bio || "",
      score: 0,
      hasPremium: false,
      followers: [],
      followings: [],
      bookmarks: { signals: [], posts: [] },
      blockedAccounts: [],
      subscribers: [],
      subscriptionPlan: [],
    };

    // Save to Redis
    await redisService.set(`user:${username}`, JSON.stringify(newUser));

    // Create token
    const token = jwt.sign(
      { id: username },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "1d" }
    );

    // Return user without password
    const { password: _, ...safeUser } = newUser;
    res.status(201).json({
      success: true,
      user: safeUser,
      token,
    });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({
      success: false,
      message: "Error creating user",
    });
  }
};

// Login user
exports.loginUser = async (req, res) => {
  const { email, password } = req.body;

  // Validation
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required",
    });
  }

  try {
    // Find user
    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid password",
      });
    }

    // Create token
    const token = jwt.sign(
      { id: user.username },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "1d" }
    );

    // Return user without password
    const { password: _, ...safeUser } = user;
    res.json({
      success: true,
      user: safeUser,
      token,
    });
  } catch (error) {
    console.error("Error logging in user:", error);
    res.status(500).json({
      success: false,
      message: "Error logging in",
    });
  }
};

// Follow user
exports.followUser = async (req, res) => {
  const { followerUsername } = req.params;
  const { followingUsername } = req.body;

  // Validation
  if (!followerUsername || !followingUsername) {
    return res.status(400).json({
      success: false,
      message: "Follower and following usernames are required",
    });
  }

  try {
    // Find users
    const follower = await findUserByUsername(followerUsername);
    const following = await findUserByUsername(followingUsername);

    if (!follower || !following) {
      return res.status(404).json({
        success: false,
        message: "One or both users not found",
      });
    }

    // Check if already following
    const isAlreadyFollowing = follower.followings.some(
      (user) => user.username === followingUsername
    );

    if (isAlreadyFollowing) {
      return res.status(400).json({
        success: false,
        message: "Already following this user",
      });
    }

    // Add following to follower
    follower.followings.push({
      name: following.name,
      username: following.username,
      imageUrl: following.imageUrl,
    });

    // Add follower to following
    following.followers.push({
      name: follower.name,
      username: follower.username,
      imageUrl: follower.imageUrl,
    });

    // Save updated users to Redis
    await redisService.set(
      `user:${followerUsername}`,
      JSON.stringify(follower)
    );
    await redisService.set(
      `user:${followingUsername}`,
      JSON.stringify(following)
    );

    // Return updated follower
    const { password: _, ...safeUser } = follower;
    res.json(safeUser);
  } catch (error) {
    console.error("Error following user:", error);
    res.status(500).json({
      success: false,
      message: "Error following user",
    });
  }
};

// Unfollow user
exports.unfollowUser = async (req, res) => {
  const { followerUsername } = req.params;
  const { followingUsername } = req.body;

  // Validation
  if (!followerUsername || !followingUsername) {
    return res.status(400).json({
      success: false,
      message: "Follower and following usernames are required",
    });
  }

  try {
    // Find users
    const follower = await findUserByUsername(followerUsername);
    const following = await findUserByUsername(followingUsername);

    if (!follower || !following) {
      return res.status(404).json({
        success: false,
        message: "One or both users not found",
      });
    }

    // Check if following
    const followingIndex = follower.followings.findIndex(
      (user) => user.username === followingUsername
    );

    if (followingIndex === -1) {
      return res.status(400).json({
        success: false,
        message: "Not following this user",
      });
    }

    // Remove following from follower
    follower.followings.splice(followingIndex, 1);

    // Remove follower from following
    const followerIndex = following.followers.findIndex(
      (user) => user.username === followerUsername
    );
    following.followers.splice(followerIndex, 1);

    // Save updated users to Redis
    await redisService.set(
      `user:${followerUsername}`,
      JSON.stringify(follower)
    );
    await redisService.set(
      `user:${followingUsername}`,
      JSON.stringify(following)
    );

    // Return updated follower
    const { password: _, ...safeUser } = follower;
    res.json(safeUser);
  } catch (error) {
    console.error("Error unfollowing user:", error);
    res.status(500).json({
      success: false,
      message: "Error unfollowing user",
    });
  }
};

// Block user
exports.blockUser = async (req, res) => {
  const { blockerUsername } = req.params;
  const { blockedUsername } = req.body;

  // Validation
  if (!blockerUsername || !blockedUsername) {
    return res.status(400).json({
      success: false,
      message: "Blocker and blocked usernames are required",
    });
  }

  try {
    // Find users
    const blocker = await findUserByUsername(blockerUsername);
    const blocked = await findUserByUsername(blockedUsername);

    if (!blocker || !blocked) {
      return res.status(404).json({
        success: false,
        message: "One or both users not found",
      });
    }

    // Check if already blocked
    const isAlreadyBlocked = blocker.blockedAccounts.some(
      (user) => user.username === blockedUsername
    );

    if (isAlreadyBlocked) {
      return res.status(400).json({
        success: false,
        message: "User is already blocked",
      });
    }

    // Add to blocked accounts
    blocker.blockedAccounts.push({
      name: blocked.name,
      username: blocked.username,
      imageUrl: blocked.imageUrl,
    });

    // Save updated user to Redis
    await redisService.set(`user:${blockerUsername}`, JSON.stringify(blocker));

    // Return updated user
    const { password: _, ...safeUser } = blocker;
    res.json(safeUser);
  } catch (error) {
    console.error("Error blocking user:", error);
    res.status(500).json({
      success: false,
      message: "Error blocking user",
    });
  }
};

// Update bookmarks
exports.updateBookmarks = async (req, res) => {
  const { username } = req.params;
  const { bookmarks } = req.body;

  // Validation
  if (!username || !bookmarks) {
    return res.status(400).json({
      success: false,
      message: "Username and bookmarks are required",
    });
  }

  try {
    // Find user
    const user = await findUserByUsername(username);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Update bookmarks
    user.bookmarks = bookmarks;

    // Save updated user to Redis
    await redisService.set(`user:${username}`, JSON.stringify(user));

    // Return updated user
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
  } catch (error) {
    console.error("Error updating bookmarks:", error);
    res.status(500).json({
      success: false,
      message: "Error updating bookmarks",
    });
  }
};

// Update profile
exports.updateProfile = async (req, res) => {
  const { username } = req.params;
  const updates = req.body;

  // Validation
  if (!username) {
    return res.status(400).json({
      success: false,
      message: "Username is required",
    });
  }

  try {
    // Find user
    const user = await findUserByUsername(username);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Update only allowed fields
    if (updates.name) user.name = updates.name;
    if (updates.bio) user.bio = updates.bio;
    if (updates.imageUrl) user.imageUrl = updates.imageUrl;

    // Save updated user to Redis
    await redisService.set(`user:${username}`, JSON.stringify(user));

    // Return updated user
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({
      success: false,
      message: "Error updating profile",
    });
  }
};

// Upload image to Liara Object Storage
exports.uploadImage = async (req, res) => {
  try {
    const file = req.file;
    const params = {
      Bucket: "profiles",
      Key: `${uuidv4()}-${file.originalname}`,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    await s3Client.send(new PutObjectCommand(params));

    const imageUrl = `${process.env.LIARA_ENDPOINT}/profiles/${params.Key}`;
    res.status(200).json({ url: imageUrl });
  } catch (error) {
    console.error("Error uploading profile image:", error);
    res.status(500).json({ message: "Error uploading profile image" });
  }
};
