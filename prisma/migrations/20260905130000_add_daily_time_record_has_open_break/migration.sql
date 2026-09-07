-- AlterTable
ALTER TABLE "DailyTimeRecord" ADD COLUMN     "hasOpenBreak" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "DailyTimeRecordTemporary" ADD COLUMN     "hasOpenBreak" BOOLEAN NOT NULL DEFAULT false;
