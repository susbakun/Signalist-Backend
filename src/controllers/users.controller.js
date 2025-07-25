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
    accessKeyId: process.env.LIARA_BUCKET_ACCESS_KEY,
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
      return res.status(409).json({
        success: false,
        message: "Username already taken",
        field: "username",
      });
    }

    const existingEmail = await findUserByEmail(email);
    if (existingEmail) {
      return res.status(409).json({
        success: false,
        message: "Email already registered",
        field: "email",
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
      { expiresIn: "7d" }
    );

    // Set token as HTTP-only cookie
    // In production, check if we're behind a proxy (common in cloud deployments)
    const isSecure =
      process.env.NODE_ENV === "production" &&
      (req.secure || req.headers["x-forwarded-proto"] === "https");

    // For cross-origin requests (frontend on different domain), we need SameSite=None
    const isProduction = process.env.NODE_ENV === "production";
    const isCrossOrigin =
      req.headers.origin &&
      req.headers.origin !== `${req.protocol}://${req.headers.host}`;

    const cookieOptions = {
      httpOnly: true,
      secure: isSecure, // Required for SameSite=None
      sameSite: isProduction && isCrossOrigin ? "none" : "lax", // Use "none" for cross-origin in production
      maxAge: 24 * 60 * 60 * 1000, // 1 day in milliseconds
      path: "/",
    };

    console.log("🍪 [REGISTER] Setting cookie with options:", cookieOptions);
    console.log("🌍 [REGISTER] Is cross-origin request:", isCrossOrigin);
    console.log(
      "🔐 [REGISTER] Cookie sameSite setting:",
      cookieOptions.sameSite
    );
    res.cookie("authToken", token, cookieOptions);

    // Return user without password and token
    const { password: _, ...safeUser } = newUser;
    res.status(201).json({
      success: true,
      user: safeUser,
    });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({
      success: false,
      message: `Error creating user: ${error.message || "Unknown error"}`,
    });
  }
};

// Logout user
exports.logoutUser = async (req, res) => {
  try {
    // Clear the authentication cookie
    const isSecure =
      process.env.NODE_ENV === "production" &&
      (req.secure || req.headers["x-forwarded-proto"] === "https");

    // For cross-origin requests, we need to match the original cookie settings
    const isProduction = process.env.NODE_ENV === "production";
    const isCrossOrigin =
      req.headers.origin &&
      req.headers.origin !== `${req.protocol}://${req.headers.host}`;

    res.clearCookie("authToken", {
      httpOnly: true,
      secure: isSecure,
      sameSite: isProduction && isCrossOrigin ? "none" : "lax",
      path: "/",
    });

    console.log(
      "🗑️ [LOGOUT] Clearing cookie with sameSite:",
      isProduction && isCrossOrigin ? "none" : "lax"
    );

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Error logging out user:", error);
    res.status(500).json({
      success: false,
      message: "Error logging out",
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
    const token = jwt.sign({ id: user.username }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // Set token as HTTP-only cookie
    // In production, check if we're behind a proxy (common in cloud deployments)
    const isSecure =
      process.env.NODE_ENV === "production" &&
      (req.secure || req.headers["x-forwarded-proto"] === "https");

    // For cross-origin requests (frontend on different domain), we need SameSite=None
    const isProduction = process.env.NODE_ENV === "production";
    const isCrossOrigin =
      req.headers.origin &&
      req.headers.origin !== `${req.protocol}://${req.headers.host}`;

    const cookieOptions = {
      httpOnly: true,
      secure: isSecure, // Required for SameSite=None
      sameSite: isProduction && isCrossOrigin ? "none" : "lax", // Use "none" for cross-origin in production
      maxAge: 24 * 60 * 60 * 1000, // 1 day in milliseconds
      path: "/",
    };

    console.log("🌍 Is cross-origin request:", isCrossOrigin);
    console.log("🔐 Cookie sameSite setting:", cookieOptions.sameSite);

    // If in production but not secure, add warning
    if (process.env.NODE_ENV === "production" && !isSecure) {
      console.log(
        "⚠️  WARNING: Production mode but connection not secure - cookie may not work properly"
      );
    }

    console.log("🍪 Setting cookie with options:", cookieOptions);
    console.log("🎫 Token being set:", token.substring(0, 20) + "...");
    console.log("🌐 Request host:", req.headers.host);
    console.log("🌐 Request protocol:", req.protocol);
    console.log("🌐 Request secure:", req.secure);
    console.log("🌐 Request origin:", req.headers.origin);
    console.log("🌐 Request referer:", req.headers.referer);
    console.log("🌐 Environment:", process.env.NODE_ENV);

    res.cookie("authToken", token, cookieOptions);

    // Return user without password and token
    const { password: _, ...safeUser } = user;
    console.log("✅ Login successful for user:", safeUser.username);
    res.json({
      success: true,
      user: safeUser,
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

    // Remove blocked user from blocker's followings
    blocker.followings = blocker.followings.filter(
      (user) => user.username !== blockedUsername
    );

    // Remove blocked user from blocker's followers
    blocker.followers = blocker.followers.filter(
      (user) => user.username !== blockedUsername
    );

    // Remove blocker from blocked user's followings
    blocked.followings = blocked.followings.filter(
      (user) => user.username !== blockerUsername
    );

    // Remove blocker from blocked user's followers
    blocked.followers = blocked.followers.filter(
      (user) => user.username !== blockerUsername
    );

    // Save updated users to Redis
    await redisService.set(`user:${blockerUsername}`, JSON.stringify(blocker));
    await redisService.set(`user:${blockedUsername}`, JSON.stringify(blocked));

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

// Unblock user
exports.unblockUser = async (req, res) => {
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
    // Find blocker user
    const blocker = await findUserByUsername(blockerUsername);

    if (!blocker) {
      return res.status(404).json({
        success: false,
        message: "Blocker user not found",
      });
    }

    // Check if user is actually blocked
    const isBlocked = blocker.blockedAccounts.some(
      (user) => user.username === blockedUsername
    );

    if (!isBlocked) {
      return res.status(400).json({
        success: false,
        message: "User is not blocked",
      });
    }

    // Remove from blocked accounts
    blocker.blockedAccounts = blocker.blockedAccounts.filter(
      (user) => user.username !== blockedUsername
    );

    // Save updated user to Redis
    await redisService.set(`user:${blockerUsername}`, JSON.stringify(blocker));

    // Return updated user
    const { password: _, ...safeUser } = blocker;
    res.json(safeUser);
  } catch (error) {
    console.error("Error unblocking user:", error);
    res.status(500).json({
      success: false,
      message: "Error unblocking user",
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

    // Handle email update - check if it's already in use
    if (updates.email && updates.email !== user.email) {
      const existingEmail = await findUserByEmail(updates.email);
      if (existingEmail && existingEmail.username !== username) {
        return res.status(400).json({
          success: false,
          message: "Email already registered by another user",
        });
      }
      user.email = updates.email;
    }

    // Handle username update - check if it's already in use
    let needUsernameUpdate = false;
    const oldUsername = username; // Store old username for reference updates
    if (updates.username && updates.username !== user.username) {
      const existingUser = await findUserByUsername(updates.username);
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Username already taken",
        });
      }
      needUsernameUpdate = true;
      user.username = updates.username;
    }

    // Update other allowed fields
    if (updates.name) user.name = updates.name;
    if (updates.bio !== undefined) user.bio = updates.bio;
    if (updates.imageUrl) user.imageUrl = updates.imageUrl;

    // If username is changing, we need to update the key in Redis
    if (needUsernameUpdate) {
      // Delete the old user record
      await redisService.del(`user:${oldUsername}`);

      // Save with the new username
      await redisService.set(`user:${user.username}`, JSON.stringify(user));
    } else {
      // Just update the existing record
      await redisService.set(`user:${username}`, JSON.stringify(user));
    }

    // Create simplified user data for updating references
    const simplifiedUserData = {
      username: user.username,
      name: user.name,
      imageUrl: user.imageUrl || "",
    };

    // Update user references in other collections
    try {
      // 1. Update posts and comments
      await updateUserInPosts(oldUsername, simplifiedUserData);

      // 2. Update signals
      await updateUserInSignals(oldUsername, {
        ...simplifiedUserData,
        score: user.score || 0,
      });

      // 3. Update messages in the new messaging system
      await updateUserInMessages(oldUsername, simplifiedUserData);
    } catch (syncError) {
      console.error("Error syncing user data:", syncError);
      // Continue execution even if synchronization fails
    }

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

// Helper function to update user references in posts and comments
async function updateUserInPosts(username, userData) {
  try {
    // Get all posts
    const postKeys = await redisService.keys("post:*");

    for (const key of postKeys) {
      const postData = await redisService.get(key);
      if (!postData) continue;

      let post = JSON.parse(postData);
      let modified = false;

      // Update post publisher
      if (post.publisher && post.publisher.username === username) {
        post.publisher = {
          ...post.publisher,
          username: userData.username,
          name: userData.name,
          imageUrl: userData.imageUrl,
        };
        modified = true;
      }

      // Update comment publishers
      if (post.comments && post.comments.length > 0) {
        let commentsModified = false;

        post.comments = post.comments.map((comment) => {
          if (comment.publisher && comment.publisher.username === username) {
            commentsModified = true;
            return {
              ...comment,
              publisher: {
                ...comment.publisher,
                username: userData.username,
                name: userData.name,
                imageUrl: userData.imageUrl,
              },
            };
          }
          return comment;
        });

        if (commentsModified) {
          modified = true;
        }
      }

      // Save updated post if modified
      if (modified) {
        await redisService.set(key, JSON.stringify(post));
      }
    }
  } catch (error) {
    console.error("Error updating user in posts:", error);
    throw error;
  }
}

// Helper function to update user references in signals
async function updateUserInSignals(username, userData) {
  try {
    // Get all signals
    const signalKeys = await redisService.keys("signal:*");

    for (const key of signalKeys) {
      const signalData = await redisService.get(key);
      if (!signalData) continue;

      let signal = JSON.parse(signalData);
      let modified = false;

      // Update signal publisher
      if (signal.publisher && signal.publisher.username === username) {
        signal.publisher = {
          ...signal.publisher,
          username: userData.username,
          name: userData.name,
          imageUrl: userData.imageUrl,
          // Keep the original score from the userData
          score: userData.score,
        };
        modified = true;
      }

      // Save updated signal if modified
      if (modified) {
        await redisService.set(key, JSON.stringify(signal));
      }
    }
  } catch (error) {
    console.error("Error updating user in signals:", error);
    throw error;
  }
}

// Helper function to update user references in messages with the new messaging system
async function updateUserInMessages(username, userData) {
  try {
    // Get all message conversations that might involve this user
    const messageKeys = await redisService.keys(`message:*`);

    for (const key of messageKeys) {
      const messagesData = await redisService.get(key);
      if (!messagesData) continue;

      let messages = JSON.parse(messagesData);
      let modified = false;

      // Update sender information in messages
      messages = messages.map((message) => {
        if (message.sender && message.sender.username === username) {
          modified = true;
          return {
            ...message,
            sender: {
              ...message.sender,
              username: userData.username,
              name: userData.name,
              imageUrl: userData.imageUrl,
            },
          };
        }
        return message;
      });

      // Save updated messages if modified
      if (modified) {
        await redisService.set(key, JSON.stringify(messages));
        console.log(`Updated user references in message conversation: ${key}`);
      }
    }
  } catch (error) {
    console.error("Error updating user in messages:", error);
    // Don't throw the error to prevent profile update from failing
    // Just log it so we're aware of the issue
  }
}

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

// Update user score based on signal targets
exports.updateUserScore = async (req, res) => {
  const { username } = req.params;
  const { signal } = req.body;

  if (!username || !signal) {
    return res.status(400).json({
      success: false,
      message: "Username and signal data are required",
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

    // Only update scores for publishers of the signal
    if (user.username === signal.publisher.username) {
      const currentTime = new Date().getTime();

      // Check if the signal was recently closed (within the last 70 seconds)
      const isSignalRecentlyClosed =
        currentTime - signal.closeTime >= 0 &&
        currentTime - signal.closeTime <= 70000;

      if (isSignalRecentlyClosed && signal.status === "closed") {
        // Count touched targets and update score
        let scoreIncrease = 0;

        signal.targets.forEach((target) => {
          if (target.touched) {
            scoreIncrease += 1;
          }
        });

        if (scoreIncrease > 0) {
          user.score += scoreIncrease;
          console.log(
            `Updated user ${username} score by +${scoreIncrease} to ${user.score}`
          );

          // Save updated user to Redis
          await redisService.set(`user:${username}`, JSON.stringify(user));
        }
      }
    }

    // Return updated user
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
  } catch (error) {
    console.error("Error updating user score:", error);
    res.status(500).json({
      success: false,
      message: "Error updating user score",
    });
  }
};

// Check authentication status and return current user
exports.getCurrentUser = async (req, res) => {
  try {
    // req.user is set by the auth middleware
    const username = req.user.id;
    const user = await findUserByUsername(username);
    console.log(
      "👤 User found:",
      !!user,
      user ? `User: ${user.username}` : "No user"
    );

    if (!user) {
      console.log("❌ User not found in database");
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Return user without password
    const { password: _, ...safeUser } = user;
    console.log("✅ Returning user data for:", safeUser.username);
    res.json({
      success: true,
      user: safeUser,
    });
  } catch (error) {
    console.error("❌ Error getting current user:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving current user",
    });
  }
};
