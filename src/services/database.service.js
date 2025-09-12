const { PrismaClient } = require("../../generated/client");

class DatabaseService {
  constructor() {
    this.prisma = new PrismaClient();
    this.initialize();
  }

  async initialize() {
    try {
      await this.prisma.$connect();
      console.log("Database service initialized successfully");
    } catch (error) {
      console.error("Database service initialization error:", error);
      throw error;
    }
  }

  // User operations
  async getUser(username) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { username },
        include: {
          blockedUsers: {
            include: {
              blocked: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  imageUrl: true,
                  hasPremium: true,
                  score: true,
                },
              },
            },
          },
        },
      });

      if (!user) return null;

      // Get followers: people who follow THIS user
      // Query Follow records where followingId = user.id (people following this user)
      const followers = await this.prisma.follow.findMany({
        where: { followingId: user.id },
        include: {
          follower: {
            select: {
              id: true,
              name: true,
              username: true,
              imageUrl: true,
              hasPremium: true,
              score: true,
            },
          },
        },
      });

      // Get followings: people THIS user follows
      // Query Follow records where followerId = user.id (people this user follows)
      const followings = await this.prisma.follow.findMany({
        where: { followerId: user.id },
        include: {
          following: {
            select: {
              id: true,
              name: true,
              username: true,
              imageUrl: true,
              hasPremium: true,
              score: true,
            },
          },
        },
      });

      // Get user bookmarks
      const bookmarks = await this.getUserBookmarks(user.id);

      // Transform to match expected data structure
      return {
        ...user,
        followers: followers.map((f) => f.follower), // People who follow this user
        followings: followings.map((f) => f.following), // People this user follows
        blockedUsers: user.blockedUsers.map((b) => b.blocked),
        bookmarks: bookmarks,
      };
    } catch (error) {
      console.error(`Error getting user ${username}:`, error);
      throw error;
    }
  }

  async getUserByEmail(email) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email },
        include: {
          blockedUsers: {
            include: {
              blocked: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  imageUrl: true,
                  hasPremium: true,
                  score: true,
                },
              },
            },
          },
        },
      });

      if (!user) return null;

      // Get followers: people who follow THIS user
      // Query Follow records where followingId = user.id (people following this user)
      const followers = await this.prisma.follow.findMany({
        where: { followingId: user.id },
        include: {
          follower: {
            select: {
              id: true,
              name: true,
              username: true,
              imageUrl: true,
              hasPremium: true,
              score: true,
            },
          },
        },
      });

      // Get followings: people THIS user follows
      // Query Follow records where followerId = user.id (people this user follows)
      const followings = await this.prisma.follow.findMany({
        where: { followerId: user.id },
        include: {
          following: {
            select: {
              id: true,
              name: true,
              username: true,
              imageUrl: true,
              hasPremium: true,
              score: true,
            },
          },
        },
      });

      // Get user bookmarks
      const bookmarks = await this.getUserBookmarks(user.id);

      // Transform to match expected data structure
      return {
        ...user,
        followers: followers.map((f) => f.follower), // People who follow this user
        followings: followings.map((f) => f.following), // People this user follows
        blockedUsers: user.blockedUsers.map((b) => b.blocked),
        bookmarks: bookmarks,
      };
    } catch (error) {
      console.error(`Error getting user by email ${email}:`, error);
      throw error;
    }
  }

  async getAllUsers() {
    try {
      const users = await this.prisma.user.findMany({
        include: {
          blockedUsers: {
            include: {
              blocked: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  imageUrl: true,
                  hasPremium: true,
                  score: true,
                },
              },
            },
          },
        },
      });

      // For getAllUsers, we'll use a simpler approach since we don't need the complex follow relationships
      // Just return the users with their blocked users
      return users.map((user) => ({
        ...user,
        blockedUsers: user.blockedUsers.map((b) => b.blocked),
      }));
    } catch (error) {
      console.error("Error getting all users:", error);
      throw error;
    }
  }

  async createUser(userData) {
    try {
      const user = await this.prisma.user.create({
        data: userData,
      });
      return user;
    } catch (error) {
      console.error("Error creating user:", error);
      throw error;
    }
  }

  async updateUser(username, userData) {
    try {
      // Filter out only the fields that should be updated
      const allowedFields = [
        "name",
        "email",
        "password",
        "imageUrl",
        "bio",
        "score",
        "hasPremium",
      ];

      const updateData = {};
      for (const field of allowedFields) {
        if (userData[field] !== undefined) {
          updateData[field] = userData[field];
        }
      }

      const user = await this.prisma.user.update({
        where: { username },
        data: updateData,
      });
      return user;
    } catch (error) {
      console.error(`Error updating user ${username}:`, error);
      throw error;
    }
  }

  async deleteUser(username) {
    try {
      await this.prisma.user.delete({
        where: { username },
      });
      return true;
    } catch (error) {
      console.error(`Error deleting user ${username}:`, error);
      throw error;
    }
  }

  // Follow operations
  async followUser(followerUsername, followingUsername) {
    try {
      // Check if already following
      const existingFollow = await this.prisma.follow.findFirst({
        where: {
          follower: { username: followerUsername },
          following: { username: followingUsername },
        },
      });

      if (existingFollow) {
        throw new Error("Already following this user");
      }

      // Create the follow relationship
      const follow = await this.prisma.follow.create({
        data: {
          follower: { connect: { username: followerUsername } },
          following: { connect: { username: followingUsername } },
        },
        include: {
          follower: {
            select: {
              id: true,
              name: true,
              username: true,
              imageUrl: true,
              hasPremium: true,
              score: true,
            },
          },
          following: {
            select: {
              id: true,
              name: true,
              username: true,
              imageUrl: true,
              hasPremium: true,
              score: true,
            },
          },
        },
      });

      return follow;
    } catch (error) {
      console.error(
        `Error following user ${followerUsername} -> ${followingUsername}:`,
        error
      );
      throw error;
    }
  }

  async unfollowUser(followerUsername, followingUsername) {
    try {
      // Find and delete the follow relationship
      const follow = await this.prisma.follow.findFirst({
        where: {
          follower: { username: followerUsername },
          following: { username: followingUsername },
        },
      });

      if (!follow) {
        throw new Error("Not following this user");
      }

      await this.prisma.follow.delete({
        where: { id: follow.id },
      });

      return true;
    } catch (error) {
      console.error(
        `Error unfollowing user ${followerUsername} -> ${followingUsername}:`,
        error
      );
      throw error;
    }
  }

  // Post operations
  async getPost(postId) {
    try {
      const post = await this.prisma.post.findUnique({
        where: { id: postId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              imageUrl: true,
              hasPremium: true,
            },
          },
          likes: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  imageUrl: true,
                },
              },
            },
          },
          comments: {
            include: {
              publisher: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  imageUrl: true,
                },
              },
              likes: {
                include: {
                  user: {
                    select: {
                      id: true,
                      name: true,
                      username: true,
                      imageUrl: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!post) return null;

      // Transform to match Redis data structure
      return {
        ...post,
        username: post.user.username,
        userId: post.user.id,
        likes: post.likes.map((like) => ({
          name: like.user.name,
          username: like.user.username,
          imageUrl: like.user.imageUrl,
        })),
        comments: post.comments.map((comment) => ({
          ...comment,
          commentId: comment.commentId, // Ensure commentId is always present
          publisher: {
            name: comment.publisher.name,
            username: comment.publisher.username,
            imageUrl: comment.publisher.imageUrl,
          },
          likes: comment.likes.map((like) => ({
            name: like.user.name,
            username: like.user.username,
            imageUrl: like.user.imageUrl,
          })),
        })),
      };
    } catch (error) {
      console.error(`Error getting post ${postId}:`, error);
      throw error;
    }
  }

  async getAllPosts() {
    try {
      const posts = await this.prisma.post.findMany({
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              imageUrl: true,
              hasPremium: true,
            },
          },
          likes: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  imageUrl: true,
                },
              },
            },
          },
          comments: {
            include: {
              publisher: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  imageUrl: true,
                },
              },
              likes: {
                include: {
                  user: {
                    select: {
                      id: true,
                      name: true,
                      username: true,
                      imageUrl: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { date: "desc" },
      });

      return posts.map((post) => ({
        ...post,
        username: post.user.username,
        userId: post.user.id,
        likes: post.likes.map((like) => ({
          name: like.user.name,
          username: like.user.username,
          imageUrl: like.user.imageUrl,
        })),
        comments: post.comments.map((comment) => ({
          ...comment,
          commentId: comment.commentId, // Ensure commentId is always present
          publisher: {
            name: comment.publisher.name,
            username: comment.publisher.username,
            imageUrl: comment.publisher.imageUrl,
          },
          likes: comment.likes.map((like) => ({
            name: like.user.name,
            username: like.user.username,
            imageUrl: like.user.imageUrl,
          })),
        })),
      }));
    } catch (error) {
      console.error("Error getting all posts:", error);
      throw error;
    }
  }

  async createPost(postData) {
    try {
      // Transform old Redis format to new PostgreSQL format
      const transformedData = {};

      // Handle content
      if (postData.content !== undefined) {
        transformedData.content = postData.content;
      }

      // Handle postImageHref
      if (postData.postImageHref !== undefined) {
        transformedData.postImageHref = postData.postImageHref;
      }

      // Handle date
      if (postData.date !== undefined) {
        transformedData.date = BigInt(postData.date);
      }

      // Handle isPremium
      if (postData.isPremium !== undefined) {
        transformedData.isPremium = postData.isPremium;
      }

      // Handle user relationship if publisher is provided
      if (postData.user && postData.user.username) {
        // Find the user by username and connect the post
        const user = await this.prisma.user.findUnique({
          where: { username: postData.user.username },
        });
        if (user) {
          transformedData.user = {
            connect: { id: user.id },
          };
        }
      }

      const post = await this.prisma.post.create({
        data: transformedData,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              imageUrl: true,
              hasPremium: true,
            },
          },
        },
      });

      return {
        ...post,
        username: post.user.username,
        userId: post.user.id,
      };
    } catch (error) {
      console.error("Error creating post:", error);
      throw error;
    }
  }

  async updatePost(postId, postData) {
    try {
      // Transform old Redis format to new PostgreSQL format
      const transformedData = {};

      // Handle content
      if (postData.content !== undefined) {
        transformedData.content = postData.content;
      }

      // Handle postImageHref
      if (postData.postImageHref !== undefined) {
        transformedData.postImageHref = postData.postImageHref;
      }

      // Handle date
      if (postData.date !== undefined) {
        transformedData.date = BigInt(postData.date);
      }

      // Handle isPremium
      if (postData.isPremium !== undefined) {
        transformedData.isPremium = postData.isPremium;
      }

      // Handle user relationship if publisher is provided
      if (postData.publisher && postData.publisher.username) {
        // Find the user by username and connect the post
        const user = await this.prisma.user.findUnique({
          where: { username: postData.publisher.username },
        });
        if (user) {
          transformedData.user = {
            connect: { id: user.id },
          };
        }
      }

      // Note: likes and comments are handled separately through their own endpoints
      // We don't update them here to avoid Prisma validation errors

      const post = await this.prisma.post.update({
        where: { id: postId },
        data: transformedData,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              imageUrl: true,
              hasPremium: true,
            },
          },
          likes: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  imageUrl: true,
                },
              },
            },
          },
          comments: {
            include: {
              publisher: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  imageUrl: true,
                },
              },
              likes: {
                include: {
                  user: {
                    select: {
                      id: true,
                      name: true,
                      username: true,
                      imageUrl: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      // Transform to match the expected format
      return {
        ...post,
        username: post.user.username,
        userId: post.user.id,
        likes: post.likes.map((like) => ({
          name: like.user.name,
          username: like.user.username,
          imageUrl: like.user.imageUrl,
        })),
        comments: post.comments.map((comment) => ({
          ...comment,
          publisher: {
            name: comment.publisher.name,
            username: comment.publisher.username,
            imageUrl: comment.publisher.imageUrl,
          },
          likes: comment.likes.map((like) => ({
            name: like.user.name,
            username: like.user.username,
            imageUrl: like.user.imageUrl,
          })),
        })),
      };
    } catch (error) {
      console.error(`Error updating post ${postId}:`, error);
      throw error;
    }
  }

  async deletePost(postId) {
    try {
      await this.prisma.post.delete({
        where: { id: postId },
      });
      return true;
    } catch (error) {
      console.error(`Error deleting post ${postId}:`, error);
      throw error;
    }
  }

  // Signal operations
  async getSignal(signalId) {
    try {
      const signal = await this.prisma.signal.findUnique({
        where: { id: signalId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              imageUrl: true,
              hasPremium: true,
              score: true,
            },
          },
          targets: true,
          likes: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  imageUrl: true,
                },
              },
            },
          },
        },
      });

      if (!signal) return null;

      return {
        ...signal,
        username: signal.user.username,
        userId: signal.user.id,
        market: {
          name: signal.marketName,
          uuid: signal.marketUuid,
          quoteAsset: signal.quoteAsset,
        },
        entry: signal.entry,
        stoploss: signal.stoploss,
        targets: signal.targets.map((target) => ({
          id: target.id,
          value: target.value,
          touched: target.touched,
        })),
        openTime: signal.openTime,
        closeTime: signal.closeTime,
        likes: signal.likes.map((like) => ({
          name: like.user.name,
          username: like.user.username,
          imageUrl: like.user.imageUrl,
        })),
      };
    } catch (error) {
      console.error(`Error getting signal ${signalId}:`, error);
      throw error;
    }
  }

  async getAllSignals() {
    try {
      const signals = await this.prisma.signal.findMany({
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              imageUrl: true,
              hasPremium: true,
              score: true,
            },
          },
          targets: true,
          likes: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  imageUrl: true,
                },
              },
            },
          },
        },
        orderBy: { date: "desc" },
      });

      return signals.map((signal) => ({
        ...signal,
        username: signal.user.username,
        userId: signal.user.id,
        market: {
          name: signal.marketName,
          uuid: signal.marketUuid,
          quoteAsset: signal.quoteAsset,
        },
        entry: signal.entry,
        stoploss: signal.stoploss,
        targets: signal.targets.map((target) => ({
          id: target.id,
          value: target.value,
          touched: target.touched,
        })),
        openTime: signal.openTime,
        closeTime: signal.closeTime,
        likes: signal.likes.map((like) => ({
          name: like.user.name,
          username: like.user.username,
          imageUrl: like.user.imageUrl,
        })),
      }));
    } catch (error) {
      console.error("Error getting all signals:", error);
      throw error;
    }
  }

  async createSignal(signalData) {
    try {
      // Transform old Redis format to new PostgreSQL format
      const transformedData = {};

      // Handle market-related fields
      if (signalData.marketName !== undefined) {
        transformedData.marketName = signalData.marketName;
      }
      if (signalData.marketUuid !== undefined) {
        transformedData.marketUuid = signalData.marketUuid;
      }
      if (signalData.quoteAsset !== undefined) {
        transformedData.quoteAsset = signalData.quoteAsset;
      }

      // Handle trading fields
      if (signalData.entry !== undefined) {
        transformedData.entry = signalData.entry;
      }
      if (signalData.stoploss !== undefined) {
        transformedData.stoploss = signalData.stoploss;
      }

      // Handle dates
      if (signalData.openTime !== undefined) {
        transformedData.openTime = BigInt(signalData.openTime);
      }
      if (signalData.closeTime !== undefined) {
        transformedData.closeTime = BigInt(signalData.closeTime);
      }
      if (signalData.date !== undefined) {
        transformedData.date = BigInt(signalData.date);
      }

      // Handle other fields
      if (signalData.status !== undefined) {
        transformedData.status = signalData.status;
      }
      if (signalData.description !== undefined) {
        transformedData.description = signalData.description;
      }
      if (signalData.chartImageHref !== undefined) {
        transformedData.chartImageHref = signalData.chartImageHref;
      }
      if (signalData.isPremium !== undefined) {
        transformedData.isPremium = signalData.isPremium;
      }
      if (signalData.score !== undefined) {
        transformedData.score = signalData.score;
      }

      // Handle user relationship if publisher is provided
      if (signalData.user && signalData.user.username) {
        // Find the user by username and connect the signal
        const user = await this.prisma.user.findUnique({
          where: { username: signalData.user.username },
        });
        if (user) {
          transformedData.user = {
            connect: { id: user.id },
          };
        }
      }

      // Handle targets if provided
      if (signalData.targets && Array.isArray(signalData.targets)) {
        transformedData.targets = {
          create: signalData.targets.map((target) => ({
            value: target.value,
            touched: target.touched || false,
          })),
        };
      }

      const signal = await this.prisma.signal.create({
        data: transformedData,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              imageUrl: true,
              hasPremium: true,
              score: true,
            },
          },
          targets: true,
          likes: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  imageUrl: true,
                  hasPremium: true,
                  score: true,
                },
              },
            },
          },
        },
      });

      // Transform the response to match frontend expectations
      return {
        ...signal,
        username: signal.user.username,
        userId: signal.user.id,
        // Initialize likes as empty array if no likes exist
        likes:
          signal.likes.map((like) => ({
            id: like.user.id,
            name: like.user.name,
            username: like.user.username,
            imageUrl: like.user.imageUrl,
            hasPremium: like.user.hasPremium,
            score: like.user.score,
          })) || [],
        // Transform market data to match frontend expectations
        market: {
          name: signal.marketName,
          uuid: signal.marketUuid,
          quoteAsset: signal.quoteAsset,
        },
      };
    } catch (error) {
      console.error("Error creating signal:", error);
      throw error;
    }
  }

  async updateSignal(signalId, signalData) {
    try {
      // Transform old Redis format to new PostgreSQL format
      const transformedData = {};

      // Handle market-related fields
      if (signalData.marketName !== undefined) {
        transformedData.marketName = signalData.marketName;
      }
      if (signalData.marketUuid !== undefined) {
        transformedData.marketUuid = signalData.marketUuid;
      }
      if (signalData.quoteAsset !== undefined) {
        transformedData.quoteAsset = signalData.quoteAsset;
      }

      // Handle trading fields
      if (signalData.entry !== undefined) {
        transformedData.entry = signalData.entry;
      }
      if (signalData.stoploss !== undefined) {
        transformedData.stoploss = signalData.stoploss;
      }

      // Handle dates
      if (signalData.openTime !== undefined) {
        transformedData.openTime = BigInt(signalData.openTime);
      }
      if (signalData.closeTime !== undefined) {
        transformedData.closeTime = BigInt(signalData.closeTime);
      }
      if (signalData.date !== undefined) {
        transformedData.date = BigInt(signalData.date);
      }

      // Handle other fields
      if (signalData.status !== undefined) {
        transformedData.status = signalData.status;
      }
      if (signalData.chartImageHref !== undefined) {
        transformedData.chartImageHref = signalData.chartImageHref;
      }
      if (signalData.isPremium !== undefined) {
        transformedData.isPremium = signalData.isPremium;
      }
      if (signalData.score !== undefined) {
        transformedData.score = signalData.score;
      }

      // Handle user relationship if publisher is provided
      if (signalData.publisher && signalData.publisher.username) {
        // Find the user by username and connect the signal
        const user = await this.prisma.user.findUnique({
          where: { username: signalData.publisher.username },
        });
        if (user) {
          transformedData.user = {
            connect: { id: user.id },
          };
        }
      }

      // Note: likes and targets are handled separately through their own endpoints
      // We don't update them here to avoid Prisma validation errors

      const signal = await this.prisma.signal.update({
        where: { id: signalId },
        data: transformedData,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              imageUrl: true,
              hasPremium: true,
              score: true,
            },
          },
        },
      });

      return {
        ...signal,
        username: signal.user.username,
        userId: signal.user.id,
        // Transform market data to match frontend expectations
        market: {
          name: signal.marketName,
          uuid: signal.marketUuid,
          quoteAsset: signal.quoteAsset,
        },
      };
    } catch (error) {
      console.error(`Error updating signal ${signalId}:`, error);
      throw error;
    }
  }

  // Update signal targets (for target touch status)
  async updateSignalTargets(signalId, targets) {
    try {
      // Update each target individually
      for (const target of targets) {
        await this.prisma.signalTarget.update({
          where: { id: target.id },
          data: {
            value: target.value,
            touched: target.touched,
          },
        });
      }

      // Return the updated signal
      return await this.getSignal(signalId);
    } catch (error) {
      console.error(`Error updating signal targets ${signalId}:`, error);
      throw error;
    }
  }

  // Update user score
  async updateUserScore(username, scoreChange) {
    try {
      const user = await this.prisma.user.update({
        where: { username },
        data: {
          score: {
            increment: scoreChange,
          },
        },
        select: {
          id: true,
          name: true,
          username: true,
          imageUrl: true,
          hasPremium: true,
          score: true,
        },
      });

      return user;
    } catch (error) {
      console.error(`Error updating user score for ${username}:`, error);
      throw error;
    }
  }

  async deleteSignal(signalId) {
    try {
      await this.prisma.signal.delete({
        where: { id: signalId },
      });
      return true;
    } catch (error) {
      console.error(`Error deleting signal ${signalId}:`, error);
      throw error;
    }
  }

  // Message operations
  async getMessages(roomId) {
    try {
      const messages = await this.prisma.message.findMany({
        where: { roomId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              imageUrl: true,
            },
          },
        },
        orderBy: { date: "asc" },
      });

      return messages.map((message) => ({
        ...message,
        username: message.user.username,
        userId: message.user.id,
        sender: {
          name: message.user.name,
          username: message.user.username,
          imageUrl: message.user.imageUrl,
        },
      }));
    } catch (error) {
      console.error(`Error getting messages for room ${roomId}:`, error);
      throw error;
    }
  }

  async createMessage(messageData) {
    try {
      const message = await this.prisma.message.create({
        data: messageData,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              imageUrl: true,
            },
          },
        },
      });

      return {
        ...message,
        username: message.user.username,
        userId: message.user.id,
        sender: {
          name: message.user.name,
          username: message.user.username,
          imageUrl: message.user.imageUrl,
        },
      };
    } catch (error) {
      console.error("Error creating message:", error);
      throw error;
    }
  }

  async createMessageRoom(roomData) {
    try {
      const room = await this.prisma.messageRoom.create({
        data: roomData,
      });
      return room;
    } catch (error) {
      console.error("Error creating message room:", error);
      throw error;
    }
  }

  async addUserToRoom(roomId, userId) {
    try {
      const participant = await this.prisma.messageRoomParticipant.create({
        data: {
          roomId,
          userId,
        },
      });
      return participant;
    } catch (error) {
      console.error(`Error adding user ${userId} to room ${roomId}:`, error);
      throw error;
    }
  }

  // Post like operations
  async likePost(postId, userId) {
    try {
      // Check if like already exists
      const existingLike = await this.prisma.postLike.findUnique({
        where: {
          postId_userId: {
            postId: postId,
            userId: userId,
          },
        },
      });

      if (existingLike) {
        return { alreadyLiked: true };
      }

      // Create new like
      const like = await this.prisma.postLike.create({
        data: {
          postId: postId,
          userId: userId,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              imageUrl: true,
            },
          },
        },
      });

      return {
        alreadyLiked: false,
        like: {
          name: like.user.name,
          username: like.user.username,
          imageUrl: like.user.imageUrl,
        },
      };
    } catch (error) {
      console.error(`Error liking post ${postId}:`, error);
      throw error;
    }
  }

  async unlikePost(postId, userId) {
    try {
      // Check if like exists
      const existingLike = await this.prisma.postLike.findUnique({
        where: {
          postId_userId: {
            postId: postId,
            userId: userId,
          },
        },
      });

      if (!existingLike) {
        return { alreadyUnliked: true };
      }

      // Remove like
      await this.prisma.postLike.delete({
        where: {
          postId_userId: {
            postId: postId,
            userId: userId,
          },
        },
      });

      return { alreadyUnliked: false };
    } catch (error) {
      console.error(`Error unliking post ${postId}:`, error);
      throw error;
    }
  }

  // Comment operations
  async createComment(postId, commentData) {
    try {
      // Get the user ID from the username
      const user = await this.prisma.user.findUnique({
        where: { username: commentData.publisher.username },
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Create the comment
      const comment = await this.prisma.comment.create({
        data: {
          commentId: commentData.commentId,
          postId: postId,
          body: commentData.body,
          date: BigInt(commentData.date),
          publisherId: user.id,
        },
        include: {
          publisher: {
            select: {
              id: true,
              name: true,
              username: true,
              imageUrl: true,
            },
          },
        },
      });

      return {
        ...comment,
        commentId: comment.commentId, // Keep the custom commentId for frontend compatibility
        publisher: {
          name: comment.publisher.name,
          username: comment.publisher.username,
          imageUrl: comment.publisher.imageUrl,
        },
        likes: [],
      };
    } catch (error) {
      console.error(`Error creating comment for post ${postId}:`, error);
      throw error;
    }
  }

  async deleteComment(postId, commentId) {
    try {
      const comment = await this.prisma.comment.findUnique({
        where: { commentId: commentId },
      });

      if (!comment) {
        return { notFound: true };
      }

      if (comment.postId !== postId) {
        return { unauthorized: true };
      }

      await this.prisma.comment.delete({
        where: { id: comment.id }, // Use the actual comment ID, not commentId
      });

      return { success: true };
    } catch (error) {
      console.error(`Error deleting comment ${commentId}:`, error);
      throw error;
    }
  }

  async likeComment(commentId, userId) {
    try {
      // First, find the comment by commentId to get its actual ID
      const comment = await this.prisma.comment.findUnique({
        where: { commentId: commentId },
      });

      if (!comment) {
        throw new Error("Comment not found");
      }

      // Check if like already exists
      const existingLike = await this.prisma.commentLike.findUnique({
        where: {
          commentId_userId: {
            commentId: comment.id, // Use the actual comment ID, not commentId
            userId: userId,
          },
        },
      });

      if (existingLike) {
        return { alreadyLiked: true };
      }

      // Create new like
      const like = await this.prisma.commentLike.create({
        data: {
          commentId: comment.id, // Use the actual comment ID, not commentId
          userId: userId,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              imageUrl: true,
            },
          },
        },
      });

      return {
        alreadyLiked: false,
        like: {
          name: like.user.name,
          username: like.user.username,
          imageUrl: like.user.imageUrl,
        },
      };
    } catch (error) {
      console.error(`Error liking comment ${commentId}:`, error);
      throw error;
    }
  }

  async unlikeComment(commentId, userId) {
    try {
      // First, find the comment by commentId to get its actual ID
      const comment = await this.prisma.comment.findUnique({
        where: { commentId: commentId },
      });

      if (!comment) {
        throw new Error("Comment not found");
      }

      // Check if like exists
      const existingLike = await this.prisma.commentLike.findUnique({
        where: {
          commentId_userId: {
            commentId: comment.id, // Use the actual comment ID, not commentId
            userId: userId,
          },
        },
      });

      if (!existingLike) {
        return { alreadyUnliked: true };
      }

      // Remove like
      await this.prisma.commentLike.delete({
        where: {
          commentId_userId: {
            commentId: comment.id, // Use the actual comment ID, not commentId
            userId: userId,
          },
        },
      });

      return { alreadyUnliked: false };
    } catch (error) {
      console.error(`Error unliking comment ${commentId}:`, error);
      throw error;
    }
  }

  // Bookmark operations
  async addPostBookmark(postId, userId) {
    try {
      // Check if bookmark already exists
      const existingBookmark = await this.prisma.postBookmark.findUnique({
        where: {
          postId_userId: {
            postId: postId,
            userId: userId,
          },
        },
      });

      if (existingBookmark) {
        return { alreadyBookmarked: true };
      }

      // Create new bookmark
      const bookmark = await this.prisma.postBookmark.create({
        data: {
          postId: postId,
          userId: userId,
        },
      });

      return { alreadyBookmarked: false, bookmark };
    } catch (error) {
      console.error(`Error adding post bookmark ${postId}:`, error);
      throw error;
    }
  }

  async removePostBookmark(postId, userId) {
    try {
      // Check if bookmark exists
      const existingBookmark = await this.prisma.postBookmark.findUnique({
        where: {
          postId_userId: {
            postId: postId,
            userId: userId,
          },
        },
      });

      if (!existingBookmark) {
        return { alreadyRemoved: true };
      }

      // Remove bookmark
      await this.prisma.postBookmark.delete({
        where: {
          postId_userId: {
            postId: postId,
            userId: userId,
          },
        },
      });

      return { alreadyRemoved: false };
    } catch (error) {
      console.error(`Error removing post bookmark ${postId}:`, error);
      throw error;
    }
  }

  async addSignalBookmark(signalId, userId) {
    try {
      // Check if bookmark already exists
      const existingBookmark = await this.prisma.signalBookmark.findUnique({
        where: {
          signalId_userId: {
            signalId: signalId,
            userId: userId,
          },
        },
      });

      if (existingBookmark) {
        return { alreadyBookmarked: true };
      }

      // Create new bookmark
      const bookmark = await this.prisma.signalBookmark.create({
        data: {
          signalId: signalId,
          userId: userId,
        },
      });

      return { alreadyBookmarked: false, bookmark };
    } catch (error) {
      console.error(`Error adding signal bookmark ${signalId}:`, error);
      throw error;
    }
  }

  async removeSignalBookmark(signalId, userId) {
    try {
      // Check if bookmark exists
      const existingBookmark = await this.prisma.signalBookmark.findUnique({
        where: {
          signalId_userId: {
            signalId: signalId,
            userId: userId,
          },
        },
      });

      if (!existingBookmark) {
        return { alreadyRemoved: true };
      }

      // Remove bookmark
      await this.prisma.signalBookmark.delete({
        where: {
          signalId_userId: {
            signalId: signalId,
            userId: userId,
          },
        },
      });

      return { alreadyRemoved: false };
    } catch (error) {
      console.error(`Error removing signal bookmark ${signalId}:`, error);
      throw error;
    }
  }

  async getUserBookmarks(userId) {
    try {
      const [postBookmarks, signalBookmarks] = await Promise.all([
        this.prisma.postBookmark.findMany({
          where: { userId },
          include: {
            post: {
              select: {
                id: true,
              },
            },
          },
        }),
        this.prisma.signalBookmark.findMany({
          where: { userId },
          include: {
            signal: {
              select: {
                id: true,
              },
            },
          },
        }),
      ]);

      return {
        posts: postBookmarks.map((bookmark) => bookmark.post.id),
        signals: signalBookmarks.map((bookmark) => bookmark.signal.id),
      };
    } catch (error) {
      console.error(`Error getting user bookmarks for user ${userId}:`, error);
      throw error;
    }
  }

  // Generic operations for backward compatibility
  async get(key) {
    // This method maintains Redis-like interface for backward compatibility
    if (key.startsWith("user:")) {
      const username = key.replace("user:", "");
      return await this.getUser(username);
    } else if (key.startsWith("post:")) {
      const postId = key.replace("post:", "");
      return await this.getPost(postId);
    } else if (key.startsWith("signal:")) {
      const signalId = key.replace("signal:", "");
      return await this.getSignal(signalId);
    } else if (key.startsWith("message:")) {
      const roomId = key.replace("message:", "");
      return await this.getMessages(roomId);
    }
    return null;
  }

  // Block user operations
  async blockUser(blockerUsername, blockedUsername) {
    try {
      // Find both users
      const blocker = await this.prisma.user.findUnique({
        where: { username: blockerUsername },
        include: {
          blockedUsers: {
            include: {
              blocked: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  imageUrl: true,
                  hasPremium: true,
                  score: true,
                },
              },
            },
          },
          followers: {
            include: {
              follower: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  imageUrl: true,
                },
              },
            },
          },
          followings: {
            include: {
              following: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  imageUrl: true,
                },
              },
            },
          },
        },
      });

      const blocked = await this.prisma.user.findUnique({
        where: { username: blockedUsername },
        include: {
          followers: {
            include: {
              follower: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  imageUrl: true,
                },
              },
            },
          },
          followings: {
            include: {
              following: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  imageUrl: true,
                },
              },
            },
          },
        },
      });

      if (!blocker || !blocked) {
        return {
          success: false,
          message: "One or both users not found",
        };
      }

      // Check if already blocked
      const isAlreadyBlocked = blocker.blockedUsers.some(
        (block) => block.blocked.username === blockedUsername
      );

      if (isAlreadyBlocked) {
        return {
          success: false,
          message: "User is already blocked",
        };
      }

      // Create block relationship
      await this.prisma.block.create({
        data: {
          blockerId: blocker.id,
          blockedId: blocked.id,
        },
      });

      // Remove follow relationships in both directions
      // Remove blocked user from blocker's followings
      await this.prisma.follow.deleteMany({
        where: {
          followerId: blocker.id,
          followingId: blocked.id,
        },
      });

      // Remove blocker from blocked user's followings
      await this.prisma.follow.deleteMany({
        where: {
          followerId: blocked.id,
          followingId: blocker.id,
        },
      });

      // Get updated user data
      const updatedBlocker = await this.getUser(blockerUsername);

      return {
        success: true,
        user: updatedBlocker,
        message: "User blocked successfully",
      };
    } catch (error) {
      console.error("Error blocking user:", error);
      return {
        success: false,
        message: "Error blocking user",
      };
    }
  }

  async unblockUser(blockerUsername, blockedUsername) {
    try {
      // Find the blocker user
      const blocker = await this.prisma.user.findUnique({
        where: { username: blockerUsername },
        include: {
          blockedUsers: {
            include: {
              blocked: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  imageUrl: true,
                  hasPremium: true,
                  score: true,
                },
              },
            },
          },
        },
      });

      if (!blocker) {
        return {
          success: false,
          message: "Blocker user not found",
        };
      }

      // Find the blocked user
      const blocked = await this.prisma.user.findUnique({
        where: { username: blockedUsername },
      });

      if (!blocked) {
        return {
          success: false,
          message: "Blocked user not found",
        };
      }

      // Check if user is actually blocked
      const isBlocked = blocker.blockedUsers.some(
        (block) => block.blocked.username === blockedUsername
      );

      if (!isBlocked) {
        return {
          success: false,
          message: "User is not blocked",
        };
      }

      // Remove block relationship
      await this.prisma.block.deleteMany({
        where: {
          blockerId: blocker.id,
          blockedId: blocked.id,
        },
      });

      // Get updated user data
      const updatedBlocker = await this.getUser(blockerUsername);

      return {
        success: true,
        user: updatedBlocker,
        message: "User unblocked successfully",
      };
    } catch (error) {
      console.error("Error unblocking user:", error);
      return {
        success: false,
        message: "Error unblocking user",
      };
    }
  }

  async set(key, value) {
    // This method maintains Redis-like interface for backward compatibility
    if (key.startsWith("user:")) {
      const username = key.replace("user:", "");
      if (typeof value === "string") {
        value = JSON.parse(value);
      }
      return await this.updateUser(username, value);
    } else if (key.startsWith("post:")) {
      const postId = key.replace("post:", "");
      if (typeof value === "string") {
        value = JSON.parse(value);
      }

      // Check if post exists to decide whether to create or update
      const existingPost = await this.getPost(postId);
      if (existingPost) {
        return await this.updatePost(postId, value);
      } else {
        return await this.createPost(value);
      }
    } else if (key.startsWith("signal:")) {
      const signalId = key.replace("signal:", "");
      if (typeof value === "string") {
        value = JSON.parse(value);
      }

      // Check if signal exists to decide whether to create or update
      const existingSignal = await this.getSignal(signalId);
      if (existingSignal) {
        return await this.updateSignal(signalId, value);
      } else {
        return await this.createSignal(value);
      }
    }
    return null;
  }

  async delete(key) {
    // This method maintains Redis-like interface for backward compatibility
    if (key.startsWith("user:")) {
      const username = key.replace("user:", "");
      return await this.deleteUser(username);
    } else if (key.startsWith("post:")) {
      const postId = key.replace("post:", "");
      return await this.deletePost(postId);
    } else if (key.startsWith("signal:")) {
      const signalId = key.replace("signal:", "");
      return await this.deleteSignal(signalId);
    }
    return false;
  }

  async exists(key) {
    try {
      const result = await this.get(key);
      return result ? 1 : 0;
    } catch (error) {
      return 0;
    }
  }

  async keys(pattern) {
    // This method maintains Redis-like interface for backward compatibility
    if (pattern === "user:*") {
      const users = await this.getAllUsers();
      return users.map((user) => `user:${user.username}`);
    } else if (pattern === "post:*") {
      const posts = await this.getAllPosts();
      return posts.map((post) => `post:${post.id}`);
    } else if (pattern === "signal:*") {
      const signals = await this.getAllSignals();
      return signals.map((signal) => `signal:${signal.id}`);
    } else if (pattern === "message:*") {
      // For messages, we need to get all message rooms
      const rooms = await this.prisma.messageRoom.findMany();
      return rooms.map((room) => `message:${room.id}`);
    }
    return [];
  }

  async disconnect() {
    try {
      await this.prisma.$disconnect();
      console.log("Database service disconnected");
    } catch (error) {
      console.error("Error disconnecting database service:", error);
    }
  }
}

// Create and export a singleton instance
const databaseService = new DatabaseService();
module.exports = databaseService;
