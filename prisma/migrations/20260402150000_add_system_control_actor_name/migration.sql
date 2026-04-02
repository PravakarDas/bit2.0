-- AlterTable
ALTER TABLE "SystemControlChangeLog" ADD COLUMN IF NOT EXISTS "actorName" TEXT NOT NULL DEFAULT 'Unknown';

-- AlterTable
ALTER TABLE "SystemControlSettings" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
