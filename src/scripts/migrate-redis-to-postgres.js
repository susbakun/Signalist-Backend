const { PrismaClient } = require("@prisma/client");
const redisService = require("../services/redis.service");

const prisma = new PrismaClient();

async function migrateUsers() {
  console.log("Starting user migration...");

  try {
    const userKeys = await redisService.keys("user:*");
    console.log(`Found ${userKeys.length} users to migrate`);

    for (const key of userKeys) {
      const userData = await redisService.get(key);

      if (!userData) {
        console.log(`Skipping ${key} - no data found`);
        continue;
      }

      try {
        // Parse user data if it's a string
        const user =
          typeof userData === "string" ? JSON.parse(userData) : userData;

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
          where: { username: user.username },
        });

        if (existingUser) {
          console.log(`User ${user.username} already exists, updating...`);
          await prisma.user.update({
            where: { username: user.username },
            data: {
              name: user.name || user.firstName || user.username,
              email: user.email || `${user.username}@migrated.com`,
              password: user.password || "migrated_password_hash",
              imageUrl:
                user.imageUrl || user.profileImage || user.profile_image,
              bio: user.bio,
              hasPremium:
                user.hasPremium || user.isPremium || user.is_premium || false,
              score: user.score || 0,
            },
          });
        } else {
          console.log(`Creating new user: ${user.username}`);
          await prisma.user.create({
            data: {
              name: user.name || user.firstName || user.username,
              username: user.username,
              email: user.email || `${user.username}@migrated.com`,
              password: user.password || "migrated_password_hash",
              imageUrl:
                user.imageUrl || user.profileImage || user.profile_image,
              bio: user.bio,
              hasPremium:
                user.hasPremium || user.isPremium || user.is_premium || false,
              score: user.score || 0,
            },
          });
        }
      } catch (error) {
        console.error(`Error migrating user ${key}:`, error);
      }
    }

    console.log("User migration completed");
  } catch (error) {
    console.error("Error in user migration:", error);
  }
}

async function migratePosts() {
  console.log("Starting post migration...");

  try {
    const postKeys = await redisService.keys("post:*");
    console.log(`Found ${postKeys.length} posts to migrate`);

    for (const key of postKeys) {
      const postData = await redisService.get(key);

      if (!postData) {
        console.log(`Skipping ${key} - no data found`);
        continue;
      }

      try {
        const post =
          typeof postData === "string" ? JSON.parse(postData) : postData;

        // Find the user by username
        const user = await prisma.user.findUnique({
          where: {
            username: post.publisher?.username || post.username || post.userId,
          },
        });

        if (!user) {
          console.log(`User not found for post ${key}, skipping...`);
          continue;
        }

        // Check if post already exists
        const existingPost = await prisma.post.findFirst({
          where: {
            userId: user.id,
            content: post.content,
            date: BigInt(
              post.date || post.createdAt || post.created_at || Date.now()
            ),
          },
        });

        if (!existingPost) {
          console.log(`Creating new post for user: ${user.username}`);
          await prisma.post.create({
            data: {
              userId: user.id,
              content: post.content,
              postImageHref: post.postImageHref || post.media?.[0],
              date: BigInt(
                post.date || post.createdAt || post.created_at || Date.now()
              ),
              isPremium: post.isPremium || post.is_premium || false,
            },
          });
        }
      } catch (error) {
        console.error(`Error migrating post ${key}:`, error);
      }
    }

    console.log("Post migration completed");
  } catch (error) {
    console.error("Error in post migration:", error);
  }
}

async function migrateSignals() {
  console.log("Starting signal migration...");

  try {
    const signalKeys = await redisService.keys("signal:*");
    console.log(`Found ${signalKeys.length} signals to migrate`);

    for (const key of signalKeys) {
      const signalData = await redisService.get(key);

      if (!signalData) {
        console.log(`Skipping ${key} - no data found`);
        continue;
      }

      try {
        const signal =
          typeof signalData === "string" ? JSON.parse(signalData) : signalData;

        // Find the user by username
        const user = await prisma.user.findUnique({
          where: {
            username:
              signal.publisher?.username || signal.username || signal.userId,
          },
        });

        if (!user) {
          console.log(`User not found for signal ${key}, skipping...`);
          continue;
        }

        // Check if signal already exists
        const existingSignal = await prisma.signal.findFirst({
          where: {
            userId: user.id,
            marketName: signal.market?.name || signal.symbol || "Unknown",
            entry: signal.entry || signal.entryPrice || signal.entry_price || 0,
            date: BigInt(
              signal.date || signal.createdAt || signal.created_at || Date.now()
            ),
          },
        });

        if (!existingSignal) {
          console.log(`Creating new signal for user: ${user.username}`);
          const signalRecord = await prisma.signal.create({
            data: {
              userId: user.id,
              marketName: signal.market?.name || signal.symbol || "Unknown",
              marketUuid:
                signal.market?.uuid || signal.id || crypto.randomUUID(),
              quoteAsset: signal.market?.quoteAsset,
              entry:
                signal.entry || signal.entryPrice || signal.entry_price || 0,
              stoploss:
                signal.stoploss || signal.stopLoss || signal.stop_loss || 0,
              openTime: BigInt(
                signal.openTime || signal.open_time || Date.now()
              ),
              closeTime: BigInt(
                signal.closeTime || signal.close_time || Date.now()
              ),
              status: signal.status || "open",
              date: BigInt(
                signal.date ||
                  signal.createdAt ||
                  signal.created_at ||
                  Date.now()
              ),
              description: signal.description,
              chartImageHref: signal.chartImageHref,
              isPremium: signal.isPremium || signal.is_premium || false,
              score: signal.score || 0,
            },
          });

          // Create signal targets if they exist
          if (signal.targets && Array.isArray(signal.targets)) {
            for (const target of signal.targets) {
              await prisma.signalTarget.create({
                data: {
                  signalId: signalRecord.id,
                  value: target.value || target,
                  touched: target.touched || false,
                },
              });
            }
          }
        }
      } catch (error) {
        console.error(`Error migrating signal ${key}:`, error);
      }
    }

    console.log("Signal migration completed");
  } catch (error) {
    console.error("Error in signal migration:", error);
  }
}

async function migrateMessages() {
  console.log("Starting message migration...");

  try {
    const messageKeys = await redisService.keys("message:*");
    console.log(`Found ${messageKeys.length} message rooms to migrate`);

    for (const key of messageKeys) {
      const messageData = await redisService.get(key);

      if (!messageData) {
        console.log(`Skipping ${key} - no data found`);
        continue;
      }

      try {
        const messages =
          typeof messageData === "string"
            ? JSON.parse(messageData)
            : messageData;

        if (!Array.isArray(messages) || messages.length === 0) {
          console.log(`Skipping ${key} - no messages found`);
          continue;
        }

        // Extract room ID from key (e.g., "message:room123" -> "room123")
        const roomId = key.replace("message:", "");

        // Check if message room already exists
        let messageRoom = await prisma.messageRoom.findUnique({
          where: { id: roomId },
        });

        if (!messageRoom) {
          console.log(`Creating new message room: ${roomId}`);
          messageRoom = await prisma.messageRoom.create({
            data: {
              id: roomId,
              name: `Room ${roomId}`,
              isGroup: false,
            },
          });
        }

        // Migrate messages
        for (const message of messages) {
          if (!message.username && !message.userId) {
            console.log(`Skipping message without user info`);
            continue;
          }

          // Find user by username
          const user = await prisma.user.findUnique({
            where: { username: message.username || message.userId },
          });

          if (!user) {
            console.log(`User not found for message, skipping...`);
            continue;
          }

          // Check if message already exists
          const existingMessage = await prisma.message.findFirst({
            where: {
              roomId: messageRoom.id,
              userId: user.id,
              text: message.text || message.content,
              date: BigInt(
                message.date ||
                  message.createdAt ||
                  message.created_at ||
                  Date.now()
              ),
            },
          });

          if (!existingMessage) {
            console.log(`Creating new message for user: ${user.username}`);
            await prisma.message.create({
              data: {
                roomId: messageRoom.id,
                userId: user.id,
                text: message.text || message.content,
                messageImageHref: message.messageImageHref || message.media,
                date: BigInt(
                  message.date ||
                    message.createdAt ||
                    message.created_at ||
                    Date.now()
                ),
              },
            });
          }

          // Add user to room participants if not already there
          const existingParticipant =
            await prisma.messageRoomParticipant.findUnique({
              where: {
                roomId_userId: {
                  roomId: messageRoom.id,
                  userId: user.id,
                },
              },
            });

          if (!existingParticipant) {
            await prisma.messageRoomParticipant.create({
              data: {
                roomId: messageRoom.id,
                userId: user.id,
              },
            });
          }
        }
      } catch (error) {
        console.error(`Error migrating messages ${key}:`, error);
      }
    }

    console.log("Message migration completed");
  } catch (error) {
    console.error("Error in message migration:", error);
  }
}

async function migrateFollows() {
  console.log("Starting follow relationships migration...");

  try {
    const userKeys = await redisService.keys("user:*");
    console.log(`Processing ${userKeys.length} users for follow relationships`);

    for (const key of userKeys) {
      const userData = await redisService.get(key);

      if (!userData) continue;

      try {
        const user =
          typeof userData === "string" ? JSON.parse(userData) : userData;

        if (!user.followers || !Array.isArray(user.followers)) continue;

        const dbUser = await prisma.user.findUnique({
          where: { username: user.username },
        });

        if (!dbUser) continue;

        for (const followerData of user.followers) {
          let followerUsername;

          // Handle different follower data formats
          if (typeof followerData === "string") {
            followerUsername = followerData;
          } else if (
            followerData &&
            typeof followerData === "object" &&
            followerData.username
          ) {
            followerUsername = followerData.username;
          } else {
            continue;
          }

          const follower = await prisma.user.findUnique({
            where: { username: followerUsername },
          });

          if (!follower) continue;

          // Check if follow relationship already exists
          const existingFollow = await prisma.follow.findUnique({
            where: {
              followerId_followingId: {
                followerId: follower.id,
                followingId: dbUser.id,
              },
            },
          });

          if (!existingFollow) {
            console.log(
              `Creating follow relationship: ${followerUsername} -> ${user.username}`
            );
            await prisma.follow.create({
              data: {
                followerId: follower.id,
                followingId: dbUser.id,
              },
            });
          }
        }
      } catch (error) {
        console.error(`Error processing follows for ${key}:`, error);
      }
    }

    console.log("Follow relationships migration completed");
  } catch (error) {
    console.error("Error in follow relationships migration:", error);
  }
}

async function migrateBlocks() {
  console.log("Starting block relationships migration...");

  try {
    const userKeys = await redisService.keys("user:*");
    console.log(`Processing ${userKeys.length} users for block relationships`);

    for (const key of userKeys) {
      const userData = await redisService.get(key);

      if (!userData) continue;

      try {
        const user =
          typeof userData === "string" ? JSON.parse(userData) : userData;

        if (!user.blockedUsers || !Array.isArray(user.blockedUsers)) continue;

        const dbUser = await prisma.user.findUnique({
          where: { username: user.username },
        });

        if (!dbUser) continue;

        for (const blockedUsername of user.blockedUsers) {
          const blocked = await prisma.user.findUnique({
            where: { username: blockedUsername },
          });

          if (!blocked) continue;

          // Check if block relationship already exists
          const existingBlock = await prisma.block.findUnique({
            where: {
              blockerId_blockedId: {
                blockerId: dbUser.id,
                blockedId: blocked.id,
              },
            },
          });

          if (!existingBlock) {
            console.log(
              `Creating block relationship: ${user.username} -> ${blockedUsername}`
            );
            await prisma.block.create({
              data: {
                blockerId: dbUser.id,
                blockedId: blocked.id,
              },
            });
          }
        }
      } catch (error) {
        console.error(`Error processing blocks for ${key}:`, error);
      }
    }

    console.log("Block relationships migration completed");
  } catch (error) {
    console.error("Error in block relationships migration:", error);
  }
}

async function main() {
  console.log("Starting Redis to PostgreSQL migration...");

  try {
    // Test database connection
    await prisma.$connect();
    console.log("Database connection established");

    // Run migrations in order
    await migrateUsers();
    await migratePosts();
    await migrateSignals();
    await migrateMessages();
    await migrateFollows();
    await migrateBlocks();

    console.log("Migration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await prisma.$disconnect();
    await redisService.disconnect();
  }
}

// Run migration if called directly
if (require.main === module) {
  main();
}

module.exports = {
  migrateUsers,
  migratePosts,
  migrateSignals,
  migrateMessages,
  migrateFollows,
  migrateBlocks,
};
