-- AlterTable
ALTER TABLE "DailyTimeRecord" ADD COLUMN     "lateCheckInMinutes" INTEGER DEFAULT 0,
ADD COLUMN     "lateCheckInPenalty" DOUBLE PRECISION DEFAULT 0;
