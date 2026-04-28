-- CreateEnum
CREATE TYPE "BreakingNoticeTargetType" AS ENUM ('ALL_EMPLOYEES', 'SINGLE_EMPLOYEE', 'SINGLE_BRANCH');

-- CreateTable
CREATE TABLE "BreakingNotice" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "targetType" "BreakingNoticeTargetType" NOT NULL,
    "senderId" TEXT NOT NULL,
    "targetUserId" TEXT,
    "targetBranchId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BreakingNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreakingNoticeRecipient" (
    "id" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT false,
    "seenAt" TIMESTAMP(3),
    "visibleUntil" TIMESTAMP(3),
    "noticeVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BreakingNoticeRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BreakingNotice_targetType_idx" ON "BreakingNotice"("targetType");

-- CreateIndex
CREATE INDEX "BreakingNotice_senderId_idx" ON "BreakingNotice"("senderId");

-- CreateIndex
CREATE INDEX "BreakingNotice_targetUserId_idx" ON "BreakingNotice"("targetUserId");

-- CreateIndex
CREATE INDEX "BreakingNotice_targetBranchId_idx" ON "BreakingNotice"("targetBranchId");

-- CreateIndex
CREATE INDEX "BreakingNoticeRecipient_userId_status_visibleUntil_idx" ON "BreakingNoticeRecipient"("userId", "status", "visibleUntil");

-- CreateIndex
CREATE UNIQUE INDEX "BreakingNoticeRecipient_noticeId_userId_key" ON "BreakingNoticeRecipient"("noticeId", "userId");

-- AddForeignKey
ALTER TABLE "BreakingNotice" ADD CONSTRAINT "BreakingNotice_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakingNotice" ADD CONSTRAINT "BreakingNotice_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakingNotice" ADD CONSTRAINT "BreakingNotice_targetBranchId_fkey" FOREIGN KEY ("targetBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakingNoticeRecipient" ADD CONSTRAINT "BreakingNoticeRecipient_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "BreakingNotice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakingNoticeRecipient" ADD CONSTRAINT "BreakingNoticeRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


