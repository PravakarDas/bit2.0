-- Phase 12 (Notification Center) — adds ONE new, purely additive table.
-- No existing table (NotificationJob, NotificationEvent, User, or any other)
-- is altered by this migration — verify by reading this file in full: every
-- statement below targets "NotificationJobInboxState" only.
--
-- IMPORTANT — hand-authored, not machine-generated via `prisma migrate dev`:
-- this project's live database already has pre-existing drift from
-- prisma/migrations/ (see prisma/migrations/20260722000000_add_notification_engine_foundation/migration.sql's
-- own header — two migrations applied to the live DB with no matching local
-- history), which makes `prisma migrate dev` refuse to compute a diff
-- without first offering to reset (drop) the "public" schema. Per this
-- phase's explicit instruction, this migration was NOT applied — the SQL
-- below was written by hand (mirroring the exact style/conventions of every
-- other migration in this folder) and is committed for review. Apply it
-- yourself when ready, e.g. via `prisma migrate resolve --applied
-- 20260728120000_add_notification_job_inbox_state` followed by `prisma
-- migrate deploy`, or `prisma db execute --file <this file> --schema
-- prisma/schema.prisma` (the same mechanism the Phase 1 foundation migration
-- used) — see NotificationCenterReport.md's "Migration" section for the
-- full reasoning and the pre-existing drift this discovered.

-- CreateTable
CREATE TABLE "NotificationJobInboxState" (
    "id" TEXT NOT NULL,
    "notificationJobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationJobInboxState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationJobInboxState_notificationJobId_userId_key" ON "NotificationJobInboxState"("notificationJobId", "userId");

-- CreateIndex
CREATE INDEX "NotificationJobInboxState_userId_isRead_idx" ON "NotificationJobInboxState"("userId", "isRead");

-- CreateIndex
CREATE INDEX "NotificationJobInboxState_userId_isArchived_idx" ON "NotificationJobInboxState"("userId", "isArchived");

-- CreateIndex
CREATE INDEX "NotificationJobInboxState_userId_deletedAt_idx" ON "NotificationJobInboxState"("userId", "deletedAt");

-- AddForeignKey
ALTER TABLE "NotificationJobInboxState" ADD CONSTRAINT "NotificationJobInboxState_notificationJobId_fkey" FOREIGN KEY ("notificationJobId") REFERENCES "NotificationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationJobInboxState" ADD CONSTRAINT "NotificationJobInboxState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
