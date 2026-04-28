-- CreateTable
CREATE TABLE "DailyTimeRecordTemporary" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "DailyRecordStatus" NOT NULL DEFAULT 'PRESENT',
    "requiredCheckIn" TIMESTAMP(3),
    "requiredCheckOut" TIMESTAMP(3),
    "requiredBreakTime" TEXT,
    "actualCheckIn" TIMESTAMP(3),
    "actualCheckOut" TIMESTAMP(3),
    "actualBreakTime" TEXT,
    "requiredActiveTime" TEXT,
    "actualActiveTime" TEXT,
    "officialOvertimeundertime" TEXT,
    "requestedOvertime" TEXT,
    "requestedOTstart" TIMESTAMP(3),
    "requestedOTend" TIMESTAMP(3),
    "overtimeUndertime" TEXT,
    "lateCheckInMinutes" INTEGER DEFAULT 0,
    "lateCheckInPenalty" DOUBLE PRECISION DEFAULT 0,
    "autoDeductedLeaveType" TEXT,
    "isProcessed" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyTimeRecordTemporary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyTimeRecordTemporary_userId_date_key" ON "DailyTimeRecordTemporary"("userId", "date");

-- AddForeignKey
ALTER TABLE "DailyTimeRecordTemporary" ADD CONSTRAINT "DailyTimeRecordTemporary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
