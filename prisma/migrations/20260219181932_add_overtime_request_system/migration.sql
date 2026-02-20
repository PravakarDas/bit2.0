-- CreateEnum
CREATE TYPE "OvertimeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'OVERTIME_REQUEST_PENDING';

-- AlterTable
ALTER TABLE "DailyTimeRecord" ADD COLUMN     "officialOvertimeundertime" TEXT,
ADD COLUMN     "requestedOvertime" TEXT;

-- CreateTable
CREATE TABLE "OvertimeRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "overtimeDate" TIMESTAMP(3) NOT NULL,
    "totalOvertime" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "taskNo" TEXT,
    "status" "OvertimeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statusUpdatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OvertimeRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "OvertimeRequest" ADD CONSTRAINT "OvertimeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
