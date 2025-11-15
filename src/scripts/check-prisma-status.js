const { PrismaClient } = require("@prisma/client");

async function checkPrismaStatus() {
  console.log("🔍 Checking Prisma Client status...");

  try {
    // Check if Prisma client is available
    console.log("✅ Prisma Client imported successfully");

    // Try to create a new instance
    const prisma = new PrismaClient();
    console.log("✅ Prisma Client instance created successfully");

    // Try to connect to database
    await prisma.$connect();
    console.log("✅ Database connection successful");

    // Test a simple query
    const userCount = await prisma.user.count();
    console.log(`✅ Database query successful - Users count: ${userCount}`);

    // Disconnect
    await prisma.$disconnect();
    console.log("✅ Database disconnected successfully");

    console.log("🎉 All Prisma checks passed!");
  } catch (error) {
    console.error("❌ Prisma check failed:", error.message);
    console.error("Full error:", error);
    process.exit(1);
  }
}

// Run the check
checkPrismaStatus();
