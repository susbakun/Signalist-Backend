const fs = require("fs");
const path = require("path");

// Files to update with their Redis service imports
const filesToUpdate = [
  "src/controllers/users.controller.js",
  "src/controllers/posts.controller.js",
  "src/controllers/signals.controller.js",
  "src/controllers/messages.controller.js",
  "src/controllers/news.controller.js",
  "src/routes/data.routes.js",
  "src/routes/posts.routes.js",
  "src/scripts/migrate-signals-score.js",
  "src/scripts/check-redis-status.js",
];

function updateFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`File not found: ${filePath}`);
      return;
    }

    let content = fs.readFileSync(filePath, "utf8");

    // Replace Redis service import with database service
    if (content.includes('require("../services/redis.service")')) {
      content = content.replace(
        'require("../services/redis.service")',
        'require("../services/database.service")'
      );
      console.log(`Updated imports in ${filePath}`);
    } else if (content.includes('require("../services/redis.service")')) {
      content = content.replace(
        'require("../services/redis.service")',
        'require("../services/database.service")'
      );
      console.log(`Updated imports in ${filePath}`);
    }

    // Replace redisService variable names with databaseService
    content = content.replace(/redisService\./g, "databaseService.");
    content = content.replace(/const redisService/g, "const databaseService");
    content = content.replace(/let redisService/g, "let databaseService");
    content = content.replace(/var redisService/g, "var databaseService");

    fs.writeFileSync(filePath, content, "utf8");
    console.log(`Updated ${filePath}`);
  } catch (error) {
    console.error(`Error updating ${filePath}:`, error);
  }
}

function removeRedisFiles() {
  const filesToRemove = [
    "src/services/redis.service.js",
    "src/services/redis.memory.service.js",
  ];

  filesToRemove.forEach((file) => {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        console.log(`Removed ${file}`);
      }
    } catch (error) {
      console.error(`Error removing ${file}:`, error);
    }
  });
}

function updatePackageJson() {
  try {
    const packagePath = "package.json";
    const packageContent = JSON.parse(fs.readFileSync(packagePath, "utf8"));

    // Remove Redis-related dependencies
    if (packageContent.dependencies && packageContent.dependencies.ioredis) {
      delete packageContent.dependencies.ioredis;
      console.log("Removed ioredis dependency from package.json");
    }

    // Remove Redis-related keywords
    if (packageContent.keywords) {
      packageContent.keywords = packageContent.keywords.filter(
        (keyword) => keyword !== "redis"
      );
      console.log("Removed redis keyword from package.json");
    }

    fs.writeFileSync(packagePath, JSON.stringify(packageContent, null, 2));
    console.log("Updated package.json");
  } catch (error) {
    console.error("Error updating package.json:", error);
  }
}

function main() {
  console.log("Starting Redis dependency removal...");

  // Update all files
  filesToUpdate.forEach(updateFile);

  // Remove Redis service files
  removeRedisFiles();

  // Update package.json
  updatePackageJson();

  console.log("Redis dependency removal completed!");
  console.log("\nNext steps:");
  console.log("1. Run: npm install");
  console.log("2. Run: npm run migrate:redis-to-postgres");
  console.log("3. Test your application");
  console.log("4. Remove Redis server if no longer needed");
}

if (require.main === module) {
  main();
}

module.exports = {
  updateFile,
  removeRedisFiles,
  updatePackageJson,
};
