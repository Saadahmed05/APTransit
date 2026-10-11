-- D-034 step 2: Andhra Pradesh becomes a data row with a fixed id (seed-data.ts AP_STATE_ID).
-- Bounds [76.7, 12.6, 84.8, 19.95] (lng, lat), centre [78, 16]. Every existing row belongs to AP.

INSERT INTO "states" ("id", "code", "nameEn", "nameTe", "timezone", "codePrefix",
                      "minLat", "minLng", "maxLat", "maxLng", "centerLat", "centerLng",
                      "defaultZoom", "isActive", "createdAt", "updatedAt")
VALUES ('stateap000000000000000000', 'AP', 'Andhra Pradesh', 'ఆంధ్రప్రదేశ్', 'Asia/Kolkata', 'AP',
        12.6, 76.7, 19.95, 84.8, 16, 78,
        7, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

UPDATE "districts" SET "stateId" = (SELECT "id" FROM "states" WHERE "code" = 'AP') WHERE "stateId" IS NULL;

-- State roles are scoped to a state now; SUPER_ADMIN stays platform wide (stateId null)
UPDATE "user_roles" SET "stateId" = (SELECT "id" FROM "states" WHERE "code" = 'AP')
WHERE "stateId" IS NULL AND "role" IN ('STATE_ADMIN', 'TRANSPORT_OFFICER');

UPDATE "pass_types" SET "stateId" = (SELECT "id" FROM "states" WHERE "code" = 'AP') WHERE "stateId" IS NULL;

UPDATE "daily_stats" SET "stateId" = (SELECT "id" FROM "states" WHERE "code" = 'AP') WHERE "stateId" IS NULL;

-- AlterTable
ALTER TABLE "districts" ALTER COLUMN "stateId" SET NOT NULL;
