-- Notification Engine — database foundation (see NotificationEngineDesign.md).
--
-- IMPORTANT: this migration was applied to the database via `prisma db execute`,
-- NOT via `prisma migrate dev`/`deploy`, because the live database already had
-- pre-existing drift from prisma/migrations/ (two applied migrations with no local
-- folder: 20260401230630_y and 20260622000000_time_balance_leave, plus other drift —
-- see DatabaseImplementationReport.md). This file is committed for historical record
-- and so the SQL is available for the eventual drift reconciliation, but it is NOT
-- registered in the `_prisma_migrations` table. Until that reconciliation happens,
-- `prisma migrate dev`/`deploy` will not recognize this migration as applied.
--
-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP', 'PUSH', 'SLACK', 'TEAMS', 'IN_APP_ADMIN', 'IN_APP_EMPLOYEE');

-- CreateEnum
CREATE TYPE "NotificationJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'RETRY_SCHEDULED', 'FAILED', 'DEAD_LETTER', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AttemptOutcome" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateEnum
CREATE TYPE "NotificationProviderHealthStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'DOWN');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING_GENERATION', 'GENERATED_LOCAL', 'UPLOADING', 'UPLOADED', 'GENERATION_FAILED', 'UPLOAD_FAILED');

-- CreateTable
CREATE TABLE "NotificationEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "payload" JSONB,
    "sourceDomain" TEXT NOT NULL,
    "triggeredByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationJob" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "recipientUserId" TEXT,
    "recipientAddress" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "NotificationJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "providerId" TEXT,
    "attemptNumber" INTEGER NOT NULL,
    "outcome" "AttemptOutcome" NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "subjectTemplate" TEXT,
    "bodyTemplateHtml" TEXT,
    "bodyTemplateText" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationProvider" (
    "id" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "configEncrypted" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "healthStatus" "NotificationProviderHealthStatus" NOT NULL DEFAULT 'HEALTHY',
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastFailureAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notificationType" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "workerPollIntervalSeconds" INTEGER NOT NULL DEFAULT 10,
    "workerBatchSize" INTEGER NOT NULL DEFAULT 20,
    "retryBaseDelaySeconds" INTEGER NOT NULL DEFAULT 30,
    "retryMaxDelaySeconds" INTEGER NOT NULL DEFAULT 3600,
    "retryMaxAttempts" INTEGER NOT NULL DEFAULT 5,
    "retryJitterRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "completedRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "deadLetterRetentionDays" INTEGER NOT NULL DEFAULT 180,
    "emailChannelEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsChannelEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappChannelEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pushChannelEnabled" BOOLEAN NOT NULL DEFAULT false,
    "slackChannelEnabled" BOOLEAN NOT NULL DEFAULT false,
    "teamsChannelEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "updatedByEmail" TEXT,
    "updatedByRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sourceEntityId" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING_GENERATION',
    "localTempPath" TEXT,
    "driveFileId" TEXT,
    "driveFileUrl" TEXT,
    "generatedAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentUploadAttempt" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "outcome" "AttemptOutcome" NOT NULL,
    "errorMessage" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentUploadAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationEvent_dedupeKey_key" ON "NotificationEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "NotificationEvent_eventType_idx" ON "NotificationEvent"("eventType");

-- CreateIndex
CREATE INDEX "NotificationEvent_createdAt_idx" ON "NotificationEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationJob_idempotencyKey_key" ON "NotificationJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "NotificationJob_status_nextAttemptAt_idx" ON "NotificationJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "NotificationJob_status_lockedAt_idx" ON "NotificationJob"("status", "lockedAt");

-- CreateIndex
CREATE INDEX "NotificationJob_eventId_idx" ON "NotificationJob"("eventId");

-- CreateIndex
CREATE INDEX "NotificationJob_recipientUserId_idx" ON "NotificationJob"("recipientUserId");

-- CreateIndex
CREATE INDEX "NotificationJob_channel_status_idx" ON "NotificationJob"("channel", "status");

-- CreateIndex
CREATE INDEX "NotificationJob_createdAt_idx" ON "NotificationJob"("createdAt");

-- CreateIndex
CREATE INDEX "NotificationDeliveryAttempt_jobId_attemptNumber_idx" ON "NotificationDeliveryAttempt"("jobId", "attemptNumber");

-- CreateIndex
CREATE INDEX "NotificationDeliveryAttempt_providerId_idx" ON "NotificationDeliveryAttempt"("providerId");

-- CreateIndex
CREATE INDEX "NotificationTemplate_key_channel_isActive_idx" ON "NotificationTemplate"("key", "channel", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_key_channel_version_key" ON "NotificationTemplate"("key", "channel", "version");

-- CreateIndex
CREATE INDEX "NotificationProvider_channel_priority_idx" ON "NotificationProvider"("channel", "priority");

-- CreateIndex
CREATE INDEX "NotificationProvider_channel_healthStatus_idx" ON "NotificationProvider"("channel", "healthStatus");

-- CreateIndex
CREATE INDEX "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_notificationType_channel_key" ON "NotificationPreference"("userId", "notificationType", "channel");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE INDEX "Document_sourceEntityId_idx" ON "Document"("sourceEntityId");

-- CreateIndex
CREATE INDEX "Document_type_status_idx" ON "Document"("type", "status");

-- CreateIndex
CREATE INDEX "DocumentUploadAttempt_documentId_attemptNumber_idx" ON "DocumentUploadAttempt"("documentId", "attemptNumber");

-- AddForeignKey
ALTER TABLE "NotificationJob" ADD CONSTRAINT "NotificationJob_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NotificationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationJob" ADD CONSTRAINT "NotificationJob_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationJob" ADD CONSTRAINT "NotificationJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDeliveryAttempt" ADD CONSTRAINT "NotificationDeliveryAttempt_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "NotificationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDeliveryAttempt" ADD CONSTRAINT "NotificationDeliveryAttempt_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "NotificationProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentUploadAttempt" ADD CONSTRAINT "DocumentUploadAttempt_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

