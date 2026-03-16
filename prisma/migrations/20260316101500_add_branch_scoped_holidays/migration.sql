-- AlterTable
ALTER TABLE "public_holidays"
ADD COLUMN "appliesToAllBranches" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "applicableBranchIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- DropIndex
DROP INDEX IF EXISTS "public_holidays_date_key";