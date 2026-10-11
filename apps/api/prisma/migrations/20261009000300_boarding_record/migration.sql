-- D-035 step 2: every scan is a boarding record (bus, stop, time, location, validator).

-- CreateEnum
CREATE TYPE "ValidatorKind" AS ENUM ('CONDUCTOR', 'DOOR_SCANNER');

-- CreateEnum
CREATE TYPE "StopSource" AS ENUM ('BUS_GPS', 'DEVICE_GPS', 'NONE');

-- DropForeignKey
ALTER TABLE "ticket_scans" DROP CONSTRAINT "ticket_scans_conductorId_fkey";

-- AlterTable
ALTER TABLE "ticket_scans" ADD COLUMN     "busId" TEXT,
ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION,
ADD COLUMN     "stopId" TEXT,
ADD COLUMN     "stopSource" "StopSource" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "validatorKind" "ValidatorKind" NOT NULL DEFAULT 'CONDUCTOR',
ALTER COLUMN "conductorId" DROP NOT NULL;

-- Backfill: old scans were all made by conductors (the default above); the bus is the one assigned
-- to the trip at scan time, else the latest assignment that started before it, else any assignment.
UPDATE "ticket_scans" s
SET "busId" = COALESCE(
  (SELECT a."busId" FROM "trip_assignments" a
   WHERE a."tripId" = s."tripId" AND a."startedAt" <= s."scannedAt" AND (a."endedAt" IS NULL OR a."endedAt" > s."scannedAt")
   ORDER BY a."startedAt" DESC LIMIT 1),
  (SELECT a."busId" FROM "trip_assignments" a
   WHERE a."tripId" = s."tripId" AND a."startedAt" <= s."scannedAt"
   ORDER BY a."startedAt" DESC LIMIT 1),
  (SELECT a."busId" FROM "trip_assignments" a
   WHERE a."tripId" = s."tripId"
   ORDER BY a."startedAt" ASC LIMIT 1)
)
WHERE s."busId" IS NULL;

-- CreateIndex
CREATE INDEX "ticket_scans_stopId_scannedAt_idx" ON "ticket_scans"("stopId", "scannedAt");

-- CreateIndex
CREATE INDEX "ticket_scans_busId_scannedAt_idx" ON "ticket_scans"("busId", "scannedAt");

-- AddForeignKey
ALTER TABLE "ticket_scans" ADD CONSTRAINT "ticket_scans_conductorId_fkey" FOREIGN KEY ("conductorId") REFERENCES "conductors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_scans" ADD CONSTRAINT "ticket_scans_busId_fkey" FOREIGN KEY ("busId") REFERENCES "buses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_scans" ADD CONSTRAINT "ticket_scans_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "stops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_scans" ADD CONSTRAINT "ticket_scans_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
