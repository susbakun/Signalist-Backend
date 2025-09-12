const { redisClient } = require("../services/redis");

async function inspectRedisData() {
  try {
    console.log("🔍 Inspecting Redis data structure...\n");

    // Check posts
    console.log("📝 POSTS STRUCTURE:");
    const postKeys = await redisClient.keys("post:*");
    if (postKeys.length > 0) {
      const samplePost = await redisClient.get(postKeys[0]);
      console.log("Sample post data:");
      console.log(JSON.stringify(JSON.parse(samplePost), null, 2));
    }
    console.log(`\nFound ${postKeys.length} posts\n`);

    // Check signals
    console.log("📈 SIGNALS STRUCTURE:");
    const signalKeys = await redisClient.keys("signal:*");
    if (signalKeys.length > 0) {
      const sampleSignal = await redisClient.get(signalKeys[0]);
      console.log("Sample signal data:");
      console.log(JSON.stringify(JSON.parse(sampleSignal), null, 2));
    }
    console.log(`\nFound ${signalKeys.length} signals\n`);

    // Check users
    console.log("👤 USERS STRUCTURE:");
    const userKeys = await redisClient.keys("user:*");
    if (userKeys.length > 0) {
      const sampleUser = await redisClient.get(userKeys[0]);
      console.log("Sample user data:");
      console.log(JSON.stringify(JSON.parse(sampleUser), null, 2));
    }
    console.log(`\nFound ${userKeys.length} users\n`);
  } catch (error) {
    console.error("Error inspecting Redis data:", error);
  } finally {
    await redisClient.disconnect();
  }
}

if (require.main === module) {
  inspectRedisData();
}

module.exports = { inspectRedisData };
