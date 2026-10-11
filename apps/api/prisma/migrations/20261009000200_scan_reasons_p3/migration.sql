-- D-035 step 1: new scan reasons in their own migration, before anything uses them.

-- AlterEnum
ALTER TYPE "ScanReason" ADD VALUE 'PAST_DESTINATION';
ALTER TYPE "ScanReason" ADD VALUE 'BEFORE_BOARDING_STOP';
ALTER TYPE "ScanReason" ADD VALUE 'NOT_YET_VALID';
ALTER TYPE "ScanReason" ADD VALUE 'ROUTE_NOT_COVERED';
