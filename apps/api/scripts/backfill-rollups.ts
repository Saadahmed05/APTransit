/* eslint-disable no-console */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { PrismaService } from "../src/prisma/prisma.service";
import { RollupsService } from "../src/modules/rollups/rollups.service";

try {
  process.loadEnvFile(".env");
} catch {
  // Ignored if missing
}

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) {
  console.log("No DATABASE_URL or DIRECT_URL found, skipping rollups backfill.");
  process.exit(0);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const args = process.argv.slice(2);
  let days = 14;
  const daysIdx = args.indexOf("--days");
  if (daysIdx !== -1 && args[daysIdx + 1]) {
    days = parseInt(args[daysIdx + 1]!, 10) || 14;
  }

  console.log(`Starting rollups backfill for the past ${days} days...`);
  const service = new RollupsService(prisma as unknown as PrismaService);
  const count = await service.backfill(days);
  console.log(`Rollups backfill completed! Created/updated ${count} daily_stats rows.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("Backfill failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
