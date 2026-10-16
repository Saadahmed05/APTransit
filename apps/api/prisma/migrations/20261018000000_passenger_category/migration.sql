-- D-048: travellers are counted by category. Ages and gender are no longer asked.
CREATE TYPE "PassengerCategory" AS ENUM ('ADULT', 'CHILD', 'SENIOR');

ALTER TABLE "booking_passengers" ADD COLUMN "category" "PassengerCategory" NOT NULL DEFAULT 'ADULT';

-- Existing passengers keep the category their age gave them (child under 12, senior 60 and over)
UPDATE "booking_passengers"
SET "category" = CASE
  WHEN "age" < 12 THEN 'CHILD'::"PassengerCategory"
  WHEN "age" >= 60 THEN 'SENIOR'::"PassengerCategory"
  ELSE 'ADULT'::"PassengerCategory"
END;

ALTER TABLE "booking_passengers" ALTER COLUMN "age" DROP NOT NULL;
ALTER TABLE "booking_passengers" ALTER COLUMN "gender" SET DEFAULT 'X';
