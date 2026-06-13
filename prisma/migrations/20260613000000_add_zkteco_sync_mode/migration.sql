-- AlterTable
ALTER TABLE "SystemControlSettings" ADD COLUMN     "zktecoCronMode" TEXT NOT NULL DEFAULT 'DAILY';
ALTER TABLE "SystemControlSettings" ADD COLUMN     "zktecoIntervalMinutes" INTEGER NOT NULL DEFAULT 15;
