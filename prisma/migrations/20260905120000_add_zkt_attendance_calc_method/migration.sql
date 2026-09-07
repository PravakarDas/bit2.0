-- AlterTable
ALTER TABLE "SystemControlSettings" ADD COLUMN     "attendanceCalculationMethod" TEXT NOT NULL DEFAULT 'ZKTECO_API',
ADD COLUMN     "zktAttendanceLastProcessedId" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "zktAttendancePollEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "zktAttendancePollIntervalSeconds" INTEGER NOT NULL DEFAULT 30;

-- CreateIndex
CREATE INDEX "User_attendanceId_idx" ON "User"("attendanceId");
