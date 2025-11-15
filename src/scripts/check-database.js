const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function checkDatabase() {
  console.log("Checking PostgreSQL database state...");

  try {
    // Test connection
    await prisma.$connect();
    console.log("✅ Database connection successful");

    // Check users
    const userCount = await prisma.user.count();
    console.log(`📊 Users in database: ${userCount}`);

    if (userCount > 0) {
      const sampleUser = await prisma.user.findFirst({
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          imageUrl: true,
          bio: true,
          hasPremium: true,
          score: true,
          createdAt: true,
        },
      });
      console.log("👤 Sample user:", sampleUser);
    }

    // Check posts
    const postCount = await prisma.post.count();
    console.log(`📝 Posts in database: ${postCount}`);

    // Check signals
    const signalCount = await prisma.signal.count();
    console.log(`📈 Signals in database: ${signalCount}`);

    // Check message rooms
    const roomCount = await prisma.messageRoom.count();
    console.log(`💬 Message rooms in database: ${roomCount}`);

    // Check follows
    const followCount = await prisma.follow.count();
    console.log(`👥 Follow relationships: ${followCount}`);

    // Check blocks
    const blockCount = await prisma.block.count();
    console.log(`🚫 Block relationships: ${blockCount}`);

    console.log("\n🎉 Database check completed successfully!");
    console.log("\nYour database is ready to use with the new schema!");
  } catch (error) {
    console.error("❌ Database check failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run check if called directly
if (require.main === module) {
  checkDatabase();
}

module.exports = { checkDatabase };
