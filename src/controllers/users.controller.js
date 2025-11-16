const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const databaseService = require("../services/database.service");

// Set up S3 client for Liara Object Storage
const s3Client = new S3Client({
  region: "default",
  endpoint: process.env.LIARA_ENDPOINT,
  credentials: {
    accessKeyId: process.env.LIARA_BUCKET_ACCESS_KEY,
    secretAccessKey: process.env.LIARA_SECRET_KEY,
  },
});

// Helper to find user by username from database
const findUserByUsername = async (username) => {
  try {
    return await databaseService.getUser(username);
  } catch (error) {
    console.error(`Error finding user ${username}:`, error);
    return null;
  }
};

// Helper to find user by email from database
const findUserByEmail = async (email) => {
  try {
    return await databaseService.getUserByEmail(email);
  } catch (error) {
    console.error(`Error finding user with email ${email}:`, error);
    return null;
  }
};

// Get all users
exports.getAllUsers = async (req, res) => {
  try {
    const users = await databaseService.getAllUsers();
    // Remove sensitive information
    const safeUsers = users.map((user) => {
      const { password, ...safeUser } = user;
      return safeUser;
    });
    res.json(safeUsers);
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
    await databaseService.set(`user:${username}`, newUser);

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

    // Check if this is a cross-origin request by comparing with allowed origins
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : ["https://signalisttech.com", "http://localhost:5173"];

    const isCrossOrigin =
      req.headers.origin &&
      allowedOrigins.includes(req.headers.origin) &&
      req.headers.origin !== `${req.protocol}://${req.headers.host}`;

    // For cross-origin requests, we need secure=true and sameSite=none
    // But for localhost development, we use secure=false and sameSite=lax
    const isLocalhost =
      req.headers.host && req.headers.host.includes("localhost");
    const needsSecureCookie =
      isCrossOrigin &&
      !isLocalhost &&
      (req.headers["x-forwarded-proto"] === "https" ||
        req.headers.host.includes("liara.run"));

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === "true",
      sameSite: "none", // چون دامنه جداست
      maxAge: 7 * 24 * 60 * 60 * 1000, // 1 هفته
      path: "/",
    };

    console.log("🍪 [REGISTER] Setting cookie with options:", cookieOptions);
    console.log("🌍 [REGISTER] Is cross-origin request:", isCrossOrigin);
    console.log(
      "🔐 [REGISTER] Cookie sameSite setting:",
      cookieOptions.sameSite
    );
    console.log("🔒 [REGISTER] Cookie secure setting:", cookieOptions.secure);
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

    // Check if this is a cross-origin request by comparing with allowed origins
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : ["https://signalisttech.com", "http://localhost:5173"];

    const isCrossOrigin =
      req.headers.origin &&
      allowedOrigins.includes(req.headers.origin) &&
      req.headers.origin !== `${req.protocol}://${req.headers.host}`;

    // For cross-origin requests, we need secure=true and sameSite=none
    // But for localhost development, we use secure=false and sameSite=lax
    const isLocalhost =
      req.headers.host && req.headers.host.includes("localhost");
    const needsSecureCookie =
      isCrossOrigin &&
      !isLocalhost &&
      (req.headers["x-forwarded-proto"] === "https" ||
        req.headers.host.includes("liara.run"));

    res.clearCookie("authToken", {
      httpOnly: true,
      secure: isSecure || needsSecureCookie,
      sameSite: isCrossOrigin ? "none" : "lax",
      path: "/",
    });

    console.log(
      "🗑️ [LOGOUT] Clearing cookie with sameSite:",
      isCrossOrigin ? "none" : "lax"
    );
    console.log(
      "🔒 [LOGOUT] Cookie secure setting:",
      isSecure || needsSecureCookie
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

    // Check if this is a cross-origin request by comparing with allowed origins
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : ["https://signalisttech.com", "http://localhost:5173"];

    const isCrossOrigin =
      req.headers.origin &&
      allowedOrigins.includes(req.headers.origin) &&
      req.headers.origin !== `${req.protocol}://${req.headers.host}`;

    // For cross-origin requests, we need secure=true and sameSite=none
    // But for localhost development, we use secure=false and sameSite=lax
    const isLocalhost =
      req.headers.host && req.headers.host.includes("localhost");
    const needsSecureCookie =
      isCrossOrigin &&
      !isLocalhost &&
      (req.headers["x-forwarded-proto"] === "https" ||
        req.headers.host.includes("liara.run"));

    const cookieOptions = {
      httpOnly: true,
      secure: isSecure || needsSecureCookie, // Force secure for cross-origin on Liara, but not for localhost
      sameSite: isCrossOrigin && !isLocalhost ? "none" : "lax", // Use "lax" for localhost, "none" for production cross-origin
      maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week in milliseconds
      path: "/",
    };

    console.log("🌍 Is cross-origin request:", isCrossOrigin);
    console.log("🔐 Cookie sameSite setting:", cookieOptions.sameSite);
    console.log("🔒 Cookie secure setting:", cookieOptions.secure);

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
    // Use the new database service method
    const follow = await databaseService.followUser(
      followerUsername,
      followingUsername
    );

    // Get the updated follower user with relationships
    const updatedFollower = await databaseService.getUser(followerUsername);

    // Return updated follower
    const { password: _, ...safeUser } = updatedFollower;
    res.json(safeUser);
  } catch (error) {
    console.error("Error following user:", error);

    if (error.message === "Already following this user") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

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
    // Use the new database service method
    await databaseService.unfollowUser(followerUsername, followingUsername);

    // Get the updated follower user with relationships
    const updatedFollower = await databaseService.getUser(followerUsername);

    // Return updated follower
    const { password: _, ...safeUser } = updatedFollower;
    res.json(safeUser);
  } catch (error) {
    console.error("Error unfollowing user:", error);

    if (error.message === "Not following this user") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

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
    // Use the new PostgreSQL database service
    const result = await databaseService.blockUser(
      blockerUsername,
      blockedUsername
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    // Return updated user
    const { password: _, ...safeUser } = result.user;
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
    // Use the new PostgreSQL database service
    const result = await databaseService.unblockUser(
      blockerUsername,
      blockedUsername
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    // Return updated user
    const { password: _, ...safeUser } = result.user;
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

    // Get current bookmarks from database
    const currentBookmarks = await databaseService.getUserBookmarks(user.id);

    // Handle post bookmarks
    if (bookmarks.posts) {
      // Add new post bookmarks
      for (const postId of bookmarks.posts) {
        if (!currentBookmarks.posts.includes(postId)) {
          await databaseService.addPostBookmark(postId, user.id);
        }
      }

      // Remove bookmarks that are no longer in the list
      for (const postId of currentBookmarks.posts) {
        if (!bookmarks.posts.includes(postId)) {
          await databaseService.removePostBookmark(postId, user.id);
        }
      }
    }

    // Handle signal bookmarks
    if (bookmarks.signals) {
      // Add new signal bookmarks
      for (const signalId of bookmarks.signals) {
        if (!currentBookmarks.signals.includes(signalId)) {
          await databaseService.addSignalBookmark(signalId, user.id);
        }
      }

      // Remove bookmarks that are no longer in the list
      for (const signalId of currentBookmarks.signals) {
        if (!bookmarks.signals.includes(signalId)) {
          await databaseService.removeSignalBookmark(signalId, user.id);
        }
      }
    }

    // Get updated user with new bookmarks
    const updatedUser = await databaseService.getUser(username);

    // Return updated user
    const { password: _, ...safeUser } = updatedUser;
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
    // Find user using the new database service
    const user = await databaseService.getUser(username);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Handle email update - check if it's already in use
    if (updates.email && updates.email !== user.email) {
      const existingUser = await databaseService.prisma.user.findUnique({
        where: { email: updates.email },
      });
      if (existingUser && existingUser.username !== username) {
        return res.status(400).json({
          success: false,
          message: "Email already registered by another user",
        });
      }
    }

    // Handle username update - check if it's already in use
    let needUsernameUpdate = false;
    const oldUsername = username; // Store old username for reference updates
    if (updates.username && updates.username !== user.username) {
      const existingUser = await databaseService.getUser(updates.username);
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Username already taken",
        });
      }
      needUsernameUpdate = true;
    }

    // Prepare update data
    const updateData = {};
    if (updates.name) updateData.name = updates.name;
    if (updates.email) updateData.email = updates.email;
    if (updates.bio !== undefined) updateData.bio = updates.bio;
    if (updates.imageUrl) updateData.imageUrl = updates.imageUrl;
    if (updates.username) updateData.username = updates.username;

    // Update user using the new database service
    const updatedUser = await databaseService.updateUser(username, updateData);

    // If username changed, we need to update references in other tables
    // Note: The user ID stays the same, so we don't need to update foreign key references
    // The username change is handled by the database service updateUser method
    if (needUsernameUpdate) {
      try {
        // The username change is already handled by the updateUser method
        // All foreign key relationships remain intact since the user ID doesn't change
        console.log(
          `Username updated from ${oldUsername} to ${updates.username}`
        );
      } catch (syncError) {
        console.error("Error syncing user data:", syncError);
        // Continue execution even if synchronization fails
      }
    }

    // Return updated user
    const { password: _, ...safeUser } = updatedUser;
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
    const postKeys = await databaseService.keys("post:*");

    for (const key of postKeys) {
      const postData = await databaseService.get(key);
      if (!postData) continue;

      let post = typeof postData === "string" ? JSON.parse(postData) : postData;
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
        await databaseService.set(key, post);
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
    const signalKeys = await databaseService.keys("signal:*");

    for (const key of signalKeys) {
      const signalData = await databaseService.get(key);
      if (!signalData) continue;

      let signal =
        typeof signalData === "string" ? JSON.parse(signalData) : signalData;
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
        await databaseService.set(key, signal);
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
    const messageKeys = await databaseService.keys(`message:*`);

    for (const key of messageKeys) {
      const messagesData = await databaseService.get(key);
      if (!messagesData) continue;

      let messages =
        typeof messagesData === "string"
          ? JSON.parse(messagesData)
          : messagesData;
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
        await databaseService.set(key, messages);
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
          await databaseService.set(`user:${username}`, user);
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

// Get signals count for a specific user
exports.getUserSignalsCount = async (req, res) => {
  try {
    const { username } = req.params;

    // Find user to verify existence
    const user = await findUserByUsername(username);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get all signals and filter by username
    const signalKeys = await databaseService.keys("signal:*");
    let userSignalsCount = 0;

    for (const key of signalKeys) {
      const signalData = await databaseService.get(key);
      if (signalData) {
        const signal =
          typeof signalData === "string" ? JSON.parse(signalData) : signalData;
        if (signal.publisher && signal.publisher.username === username) {
          userSignalsCount++;
        }
      }
    }

    res.json({
      count: userSignalsCount,
    });
  } catch (error) {
    console.error("Error fetching user signals count:", error);
    res.status(500).json({ message: "Error fetching user signals count" });
  }
};
