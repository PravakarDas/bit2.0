-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "breakDuration" TEXT NOT NULL DEFAULT '01:00',
ADD COLUMN     "checkInTime" TEXT NOT NULL DEFAULT '09:00',
ADD COLUMN     "checkOutTime" TEXT NOT NULL DEFAULT '18:00',
ADD COLUMN     "weeklyOffDays" TEXT[] DEFAULT ARRAY['SUNDAY']::TEXT[];

-- CreateTable
CREATE TABLE "DailyTimeRecord" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "requiredCheckIn" TIMESTAMP(3),
    "requiredCheckOut" TIMESTAMP(3),
    "requiredBreakTime" TEXT,
    "actualCheckIn" TIMESTAMP(3),
    "actualCheckOut" TIMESTAMP(3),
    "actualBreakTime" TEXT,
    "requiredActiveTime" TEXT,
    "actualActiveTime" TEXT,
    "overtimeUndertime" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyTimeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyTimeRecord_userId_date_key" ON "DailyTimeRecord"("userId", "date");

-- AddForeignKey
ALTER TABLE "DailyTimeRecord" ADD CONSTRAINT "DailyTimeRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
