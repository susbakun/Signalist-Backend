const databaseService = require("../services/database.service");

async function checkRedisStatus() {
  try {
    console.log("🔍 Checking Redis connection status...\n");

    // Wait for Redis service to initialize
    await new Promise((resolve) => setTimeout(resolve, 2000));

    if (databaseService.useInMemory) {
      console.log(
        "❌ Redis Status: Using in-memory mode (Redis not connected)"
      );
      console.log("\nTo connect to Redis:");
      console.log(
        "1. Install Redis: brew install redis (on macOS) or sudo apt-get install redis-server (on Ubuntu)"
      );
      console.log("2. Start Redis: redis-server or brew services start redis");
      console.log(
        "3. Set environment variable: export REDIS_URL=redis://localhost:6379"
      );
      console.log("4. Restart your application\n");
    } else {
      console.log("✅ Redis Status: Connected successfully");
    }

    // Try to get signal keys
    const signalKeys = await databaseService.keys("signal:*");
    console.log(`📊 Found ${signalKeys.length} signals in database`);

    if (signalKeys.length > 0) {
      console.log("\n🔍 Checking first few signals for score field:");

      for (let i = 0; i < Math.min(3, signalKeys.length); i++) {
        const key = signalKeys[i];
        try {
          const signalData = await databaseService.get(key);
          const signal =
            typeof signalData === "string"
              ? JSON.parse(signalData)
              : signalData;

          const hasScore = signal.score !== undefined;
          const scoreValue = hasScore ? signal.score : "missing";
          const status = hasScore ? "✅" : "❌";

          console.log(`  ${status} Signal ${signal.id}: score = ${scoreValue}`);
        } catch (error) {
          console.log(`  ❌ Error reading signal ${key}: ${error.message}`);
        }
      }

      if (signalKeys.length > 3) {
        console.log(`  ... and ${signalKeys.length - 3} more signals`);
      }
    }

    // Check other data types
    const userKeys = await databaseService.keys("user:*");
    const postKeys = await databaseService.keys("post:*");
    const messageKeys = await databaseService.keys("message:*");

    console.log(`\n📈 Database summary:`);
    console.log(`  Signals: ${signalKeys.length}`);
    console.log(`  Users: ${userKeys.length}`);
    console.log(`  Posts: ${postKeys.length}`);
    console.log(`  Messages: ${messageKeys.length}`);
  } catch (error) {
    console.error("❌ Error checking Redis status:", error);
  }
}

// Run the check if this script is executed directly
if (require.main === module) {
  checkRedisStatus()
    .then(() => {
      console.log("\n✅ Redis status check completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Redis status check failed:", error);
      process.exit(1);
    });
}

module.exports = checkRedisStatus;
