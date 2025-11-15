const Redis = require("ioredis");

async function checkAllRedisDatabases() {
  try {
    console.log("🔍 Checking all Redis databases for your data...\n");

    // Check databases 0-15 (common range)
    for (let db = 0; db <= 15; db++) {
      try {
        const redisClient = new Redis(
          process.env.REDIS_URL.replace("/0", `/${db}`)
        );

        // Test connection
        await redisClient.ping();

        // Count keys
        const allKeys = await redisClient.keys("*");
        const userKeys = await redisClient.keys("user:*");
        const postKeys = await redisClient.keys("post:*");
        const signalKeys = await redisClient.keys("signal:*");

        if (allKeys.length > 0) {
          console.log(`📊 Database ${db}:`);
          console.log(`  Total keys: ${allKeys.length}`);
          console.log(`  Users: ${userKeys.length}`);
          console.log(`  Posts: ${postKeys.length}`);
          console.log(`  Signals: ${signalKeys.length}`);

          if (
            userKeys.length > 0 ||
            postKeys.length > 0 ||
            signalKeys.length > 0
          ) {
            console.log(`  🎯 FOUND DATA in database ${db}!`);

            // Show sample data
            if (userKeys.length > 0) {
              const sampleUser = await redisClient.get(userKeys[0]);
              console.log(`  Sample user key: ${userKeys[0]}`);
            }
            if (postKeys.length > 0) {
              const samplePost = await redisClient.get(postKeys[0]);
              console.log(`  Sample post key: ${postKeys[0]}`);
            }
            if (signalKeys.length > 0) {
              const sampleSignal = await redisClient.get(signalKeys[0]);
              console.log(`  Sample signal key: ${signalKeys[0]}`);
            }
          }
          console.log("");
        }

        await redisClient.disconnect();
      } catch (error) {
        // Skip databases that don't exist or can't connect
        continue;
      }
    }
  } catch (error) {
    console.error("Error checking Redis databases:", error);
  }
}

if (require.main === module) {
  checkAllRedisDatabases();
}

module.exports = { checkAllRedisDatabases };
