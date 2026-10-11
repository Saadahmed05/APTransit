-- D-042: zone passes, child cards with a boarding message to the parent.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CHILD_BOARDED';

ALTER TABLE "pass_types" ADD COLUMN "zoneScoped" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "passes" ADD COLUMN "zoneDistrictId" TEXT;
ALTER TABLE "passes" ADD COLUMN "holderName" TEXT;
ALTER TABLE "passes" ADD COLUMN "holderAge" INTEGER;
