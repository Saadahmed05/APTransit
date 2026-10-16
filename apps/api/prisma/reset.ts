/* eslint-disable no-console */
import { execSync } from "child_process";

// Ensure .env is loaded
try {
  process.loadEnvFile(".env");
} catch {
  // Ignored if file does not exist
}

const dbUrl = process.env.DATABASE_URL || process.env.DIRECT_URL || "";

if (!dbUrl) {
  console.error("Error: Neither DATABASE_URL nor DIRECT_URL is set in environment.");
  process.exit(1);
}

// Safety check: refuse if DATABASE_URL points to main or production branch
if (
  dbUrl.includes("-main") ||
  dbUrl.includes("/main") ||
  dbUrl.includes("endpoint=main") ||
  dbUrl.includes("branch=main") ||
  dbUrl.includes("prod") ||
  process.env.APP_ENV === "production"
) {
  console.error("Refusing to reset database: DATABASE_URL points to main or production branch.");
  process.exit(1);
}

console.log("Resetting database for local/dev branch...");
try {
  execSync("prisma migrate reset --force", { stdio: "inherit" });
  execSync("tsx prisma/seed.ts", { stdio: "inherit" });
  console.log("Database reset and seeded successfully.");
} catch (error) {
  console.error("Failed to reset database:", error);
  process.exit(1);
}
