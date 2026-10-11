-- D-036 step 1: new pass kinds and the STUDENT scheme in their own migration, before anything uses them.

-- AlterEnum
ALTER TYPE "PassKind" ADD VALUE 'DAY';
ALTER TYPE "PassKind" ADD VALUE 'FAMILY';
ALTER TYPE "PassKind" ADD VALUE 'SCHOOL';
ALTER TYPE "PassKind" ADD VALUE 'ANNUAL';

-- AlterEnum
ALTER TYPE "EligibilityScheme" ADD VALUE 'STUDENT';
