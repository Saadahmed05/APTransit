-- D-036 step 2: pass type rules, and a purchase time copy of them on every pass.

-- CreateEnum
CREATE TYPE "PassValidityMode" AS ENUM ('ROLLING_DAYS', 'UNTIL_DAY_END');

-- AlterTable
ALTER TABLE "pass_types" ADD COLUMN     "groupSize" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "routeRestricted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "validityMode" "PassValidityMode" NOT NULL DEFAULT 'ROLLING_DAYS';

-- Existing types: weekly and monthly prices are demo values (docs/07 section 8, D-036)
UPDATE "pass_types" SET "isDemo" = true, "sortOrder" = 2 WHERE "kind" = 'WEEKLY';
UPDATE "pass_types" SET "isDemo" = true, "sortOrder" = 3 WHERE "kind" = 'MONTHLY';
UPDATE "pass_types" SET "sortOrder" = 7 WHERE "kind" = 'FREE_TRAVEL';

-- AlterTable: nullable first, filled from the pass type, then required
ALTER TABLE "passes" ADD COLUMN     "destStopId" TEXT,
ADD COLUMN     "durationDays" INTEGER,
ADD COLUMN     "eligibleServiceTypes" "ServiceType"[],
ADD COLUMN     "groupSize" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "homeStopId" TEXT,
ADD COLUMN     "pricePaise" INTEGER,
ADD COLUMN     "validityMode" "PassValidityMode" NOT NULL DEFAULT 'ROLLING_DAYS';

UPDATE "passes" p
SET "pricePaise" = t."pricePaise",
    "durationDays" = t."durationDays",
    "eligibleServiceTypes" = t."eligibleServiceTypes",
    "groupSize" = t."groupSize",
    "validityMode" = t."validityMode"
FROM "pass_types" t
WHERE t."id" = p."passTypeId";

ALTER TABLE "passes" ALTER COLUMN "pricePaise" SET NOT NULL,
ALTER COLUMN "durationDays" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "passes" ADD CONSTRAINT "passes_homeStopId_fkey" FOREIGN KEY ("homeStopId") REFERENCES "stops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passes" ADD CONSTRAINT "passes_destStopId_fkey" FOREIGN KEY ("destStopId") REFERENCES "stops"("id") ON DELETE SET NULL ON UPDATE CASCADE;
