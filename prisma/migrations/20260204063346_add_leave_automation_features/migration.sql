-- CreateEnum
CREATE TYPE "LeaveResetPolicy" AS ENUM ('ROSTER_EVERY_YEAR', 'FIXED');

-- CreateEnum
CREATE TYPE "DailyRecordStatus" AS ENUM ('PRESENT', 'ABSENT', 'ON_LEAVE', 'WEEKLY_OFF');

-- AlterTable
ALTER TABLE "DailyTimeRecord" ADD COLUMN     "autoDeductedLeaveType" TEXT,
ADD COLUMN     "isProcessed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" "DailyRecordStatus" NOT NULL DEFAULT 'PRESENT';

-- AlterTable
ALTER TABLE "LeaveType" ADD COLUMN     "leaveResetPolicy" "LeaveResetPolicy" NOT NULL DEFAULT 'ROSTER_EVERY_YEAR';

-- CreateTable
CREATE TABLE "EmployeeNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "relatedDate" TIMESTAMP(3),
    "relatedEntityId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "affectedDate" TIMESTAMP(3) NOT NULL,
    "leaveTypeId" TEXT,
    "previousBalance" INTEGER,
    "newBalance" INTEGER,
    "deductedDays" INTEGER,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingSource" TEXT NOT NULL DEFAULT 'SYSTEM',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveAuditLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "EmployeeNotification" ADD CONSTRAINT "EmployeeNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveAuditLog" ADD CONSTRAINT "LeaveAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveAuditLog" ADD CONSTRAINT "LeaveAuditLog_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
