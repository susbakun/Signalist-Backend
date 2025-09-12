const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function setupDatabase() {
  console.log("Setting up PostgreSQL database...");

  try {
    // Test connection
    await prisma.$connect();
    console.log("✅ Database connection successful");

    // Push schema to database
    console.log("Creating database tables...");
    const { execSync } = require("child_process");

    try {
      execSync("npx prisma db push", { stdio: "inherit" });
      console.log("✅ Database tables created successfully");
    } catch (error) {
      console.error("❌ Error creating database tables:", error.message);
      throw error;
    }

    // Generate Prisma client
    console.log("Generating Prisma client...");
    try {
      execSync("npx prisma generate", { stdio: "inherit" });
      console.log("✅ Prisma client generated successfully");
    } catch (error) {
      console.error("❌ Error generating Prisma client:", error.message);
      throw error;
    }

    console.log("\n🎉 Database setup completed successfully!");
    console.log("\nNext steps:");
    console.log("1. Ensure your Redis server is running");
    console.log("2. Run: npm run migrate:redis-to-postgres");
    console.log("3. After successful migration, run: npm run remove:redis");
    console.log("4. Test your application with: npm run dev");
  } catch (error) {
    console.error("❌ Database setup failed:", error);
    console.log("\nTroubleshooting:");
    console.log("1. Check your PostgreSQL connection string in .env file");
    console.log("2. Ensure PostgreSQL server is running");
    console.log("3. Verify database credentials and permissions");
    console.log("4. Check firewall and network settings");
  } finally {
    await prisma.$disconnect();
  }
}

// Run setup if called directly
if (require.main === module) {
  setupDatabase();
}

module.exports = { setupDatabase };
