const { redisClient } = require("../services/redis");

async function testRedisConnection() {
  try {
    console.log("🔌 Testing Redis connection...\n");

    // Test basic connection
    await redisClient.ping();
    console.log("✅ Redis connection successful");

    // List all keys
    const allKeys = await redisClient.keys("*");
    console.log(`📋 Total keys in Redis: ${allKeys.length}`);

    if (allKeys.length > 0) {
      console.log("🔑 Sample keys:");
      allKeys.slice(0, 10).forEach((key) => console.log(`  - ${key}`));
    }

    // Check specific patterns
    const userKeys = await redisClient.keys("user:*");
    const postKeys = await redisClient.keys("post:*");
    const signalKeys = await redisClient.keys("signal:*");
    const messageKeys = await redisClient.keys("message:*");

    console.log(`\n📊 Key counts by pattern:`);
    console.log(`  Users: ${userKeys.length}`);
    console.log(`  Posts: ${postKeys.length}`);
    console.log(`  Signals: ${signalKeys.length}`);
    console.log(`  Messages: ${messageKeys.length}`);

    // Try to get a sample key
    if (allKeys.length > 0) {
      const sampleKey = allKeys[0];
      console.log(`\n🔍 Sample data from key: ${sampleKey}`);
      const sampleData = await redisClient.get(sampleKey);
      if (sampleData) {
        try {
          const parsed = JSON.parse(sampleData);
          console.log("Data structure:");
          console.log(JSON.stringify(parsed, null, 2));
        } catch (e) {
          console.log("Raw data (not JSON):", sampleData);
        }
      } else {
        console.log("No data found for this key");
      }
    }
  } catch (error) {
    console.error("❌ Redis connection error:", error);
  } finally {
    await redisClient.disconnect();
  }
}

if (require.main === module) {
  testRedisConnection();
}

module.exports = { testRedisConnection };
