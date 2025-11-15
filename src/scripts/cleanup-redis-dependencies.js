const fs = require("fs");
const path = require("path");

console.log("🧹 Starting Redis cleanup process...\n");

// Files to delete
const filesToDelete = [
  "src/services/redis.js",
  "src/services/redis.service.js",
  "src/scripts/migrate-signals-score.js",
  "src/scripts/check-redis-status.js",
  "src/scripts/test-redis-connection.js",
  "src/scripts/check-all-redis-dbs.js",
  "src/scripts/inspect-redis-data.js",
  "src/scripts/remove-redis-dependencies.js",
];

// Files to update (remove Redis-related scripts from package.json)
const packageJsonPath = path.join(__dirname, "../../package.json");

console.log("🗑️  Deleting Redis-related files...");
filesToDelete.forEach((file) => {
  const filePath = path.join(__dirname, "..", file);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`  ✅ Deleted: ${file}`);
  } else {
    console.log(`  ⚠️  Not found: ${file}`);
  }
});

console.log("\n📦 Updating package.json...");
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

  // Remove Redis-related scripts
  const scriptsToRemove = ["migrate:signals-score", "check:redis"];

  scriptsToRemove.forEach((script) => {
    if (packageJson.scripts[script]) {
      delete packageJson.scripts[script];
      console.log(`  ✅ Removed script: ${script}`);
    }
  });

  // Remove ioredis dependency
  if (packageJson.dependencies.ioredis) {
    delete packageJson.dependencies.ioredis;
    console.log("  ✅ Removed ioredis dependency");
  }

  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  console.log("  ✅ Updated package.json");
}

console.log("\n🔍 Checking for remaining Redis references...");
const searchDirs = [
  path.join(__dirname, "../controllers"),
  path.join(__dirname, "../services"),
  path.join(__dirname, "../routes"),
  path.join(__dirname, "../middleware"),
];

const redisPatterns = [
  /redisService/,
  /redis\./,
  /ioredis/,
  /REDIS_/,
  /redis:/,
];

let foundReferences = false;

function searchInFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");

    lines.forEach((line, index) => {
      redisPatterns.forEach((pattern) => {
        if (pattern.test(line)) {
          console.log(`  ⚠️  ${filePath}:${index + 1} - ${line.trim()}`);
          foundReferences = true;
        }
      });
    });
  } catch (error) {
    console.log(`  ❌ Error reading ${filePath}: ${error.message}`);
  }
}

function searchInDirectory(dir) {
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      searchInDirectory(filePath);
    } else if (file.endsWith(".js")) {
      searchInFile(filePath);
    }
  });
}

searchDirs.forEach((dir) => {
  searchInDirectory(dir);
});

if (!foundReferences) {
  console.log("  ✅ No remaining Redis references found");
}

console.log("\n🎉 Redis cleanup completed!");
console.log("\n📋 Summary:");
console.log("  - Deleted Redis service files");
console.log("  - Removed Redis-related scripts from package.json");
console.log("  - Removed ioredis dependency");
console.log("  - Checked for remaining Redis references");
console.log("\n💡 Next steps:");
console.log("  1. Run: npm install (to remove ioredis from node_modules)");
console.log("  2. Test your application to ensure everything works");
console.log("  3. Remove any Redis environment variables from your .env file");
console.log("  4. Stop and remove Redis server if no longer needed");
