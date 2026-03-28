-- database: :memory:
-- database: :memory:
-- CreateEnum
CREATE TYPE "TimelineModificationRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "TimelineModificationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestedDate" TIMESTAMP(3) NOT NULL,
    "requestedCheckIn" TIMESTAMP(3),
    "requestedCheckOut" TIMESTAMP(3),
    "requestedBreakTime" TEXT,
    "reason" TEXT,
    "status" "TimelineModificationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewerNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimelineModificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineModificationActionLog" (
    "id" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "actionDetails" TEXT NOT NULL,
    "metadata" JSONB,
    "actorId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "requestId" TEXT,
    "dailyTimeRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineModificationActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimelineModificationRequest_userId_requestedDate_idx" ON "TimelineModificationRequest"("userId", "requestedDate");

-- CreateIndex
CREATE INDEX "TimelineModificationRequest_status_idx" ON "TimelineModificationRequest"("status");

-- CreateIndex
CREATE INDEX "TimelineModificationActionLog_actorId_createdAt_idx" ON "TimelineModificationActionLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "TimelineModificationActionLog_targetUserId_createdAt_idx" ON "TimelineModificationActionLog"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "TimelineModificationActionLog_requestId_idx" ON "TimelineModificationActionLog"("requestId");

-- AddForeignKey
ALTER TABLE "TimelineModificationRequest" ADD CONSTRAINT "TimelineModificationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineModificationRequest" ADD CONSTRAINT "TimelineModificationRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineModificationActionLog" ADD CONSTRAINT "TimelineModificationActionLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineModificationActionLog" ADD CONSTRAINT "TimelineModificationActionLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineModificationActionLog" ADD CONSTRAINT "TimelineModificationActionLog_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "TimelineModificationRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;