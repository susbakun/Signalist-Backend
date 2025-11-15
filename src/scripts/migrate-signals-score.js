const databaseService = require("../services/database.service");

async function migrateSignalsScore() {
  try {
    console.log("Starting signal score migration...");

    // Wait a bit for Redis service to initialize
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check if using in-memory mode
    if (databaseService.useInMemory) {
      console.log("⚠️  Using in-memory Redis mode.");
      console.log(
        "Note: In-memory mode means data is not persistent and may not contain your actual signals."
      );
      console.log("To migrate actual Redis data, please:");
      console.log("1. Start your Redis server");
      console.log("2. Set the correct REDIS_URL environment variable");
      console.log("3. Run this script again");
      console.log("");
    }

    // Get all signal keys from Redis
    const signalKeys = await databaseService.keys("signal:*");
    console.log(`Found ${signalKeys.length} signals to migrate`);

    if (signalKeys.length === 0) {
      console.log("No signals found. This could mean:");
      console.log("- No signals exist in your database");
      console.log("- Redis is not running or not connected");
      console.log("- Environment variables are not set correctly");
      return;
    }

    let migratedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const key of signalKeys) {
      try {
        // Get the signal data
        const signalData = await databaseService.get(key);

        // Handle both string and already parsed JSON
        const signal =
          typeof signalData === "string" ? JSON.parse(signalData) : signalData;

        // Check if signal already has a score field
        if (signal.score !== undefined) {
          console.log(
            `Signal ${signal.id} already has score field (${signal.score}), skipping`
          );
          skippedCount++;
          continue;
        }

        // Calculate score based on touched targets
        const touchedTargets = signal.targets
          ? signal.targets.filter((target) => target.touched).length
          : 0;
        signal.score = touchedTargets;

        // Save the updated signal back to Redis
        await databaseService.set(key, signal);

        console.log(
          `✅ Migrated signal ${signal.id}: added score = ${signal.score}`
        );
        migratedCount++;
      } catch (error) {
        console.error(`❌ Error migrating signal with key ${key}:`, error);
        failedCount++;
      }
    }

    console.log("\n=== Migration Complete ===");
    console.log(`Total signals found: ${signalKeys.length}`);
    console.log(`✅ Successfully migrated: ${migratedCount}`);
    console.log(`⏭️  Skipped (already had score): ${skippedCount}`);
    console.log(`❌ Failed: ${failedCount}`);

    if (migratedCount > 0) {
      console.log(
        "\n🎉 Migration successful! All existing signals now have score fields."
      );
    }
  } catch (error) {
    console.error("Migration failed:", error);
  }
}

// Run the migration if this script is executed directly
if (require.main === module) {
  migrateSignalsScore()
    .then(() => {
      console.log("Migration script completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration script failed:", error);
      process.exit(1);
    });
}

module.exports = migrateSignalsScore;
