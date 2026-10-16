-- D-048: profile completion (verified email and phone), notification preferences, saved routes.
ALTER TABLE "users" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN "notificationPrefs" JSONB,
ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

-- Every email and phone stored so far came from an OTP login, Google or the seed: count them as verified
UPDATE "users" SET "emailVerifiedAt" = "createdAt" WHERE "email" IS NOT NULL;
UPDATE "users" SET "phoneVerifiedAt" = "createdAt" WHERE "phone" IS NOT NULL;

CREATE TABLE "saved_routes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromStopId" TEXT NOT NULL,
    "toStopId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "saved_routes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "saved_routes_userId_fromStopId_toStopId_key" ON "saved_routes"("userId", "fromStopId", "toStopId");

ALTER TABLE "saved_routes" ADD CONSTRAINT "saved_routes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_routes" ADD CONSTRAINT "saved_routes_fromStopId_fkey" FOREIGN KEY ("fromStopId") REFERENCES "stops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "saved_routes" ADD CONSTRAINT "saved_routes_toStopId_fkey" FOREIGN KEY ("toStopId") REFERENCES "stops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
