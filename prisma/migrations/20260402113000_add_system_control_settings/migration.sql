-- CreateTable
CREATE TABLE "SystemControlSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "appTimezone" TEXT NOT NULL DEFAULT 'Asia/Dhaka',
    "timelineCronEnabled" BOOLEAN NOT NULL DEFAULT true,
    "timelineCronHour" INTEGER NOT NULL DEFAULT 1,
    "timelineCronMinute" INTEGER NOT NULL DEFAULT 24,
    "zktecoCronEnabled" BOOLEAN NOT NULL DEFAULT true,
    "zktecoCronHour" INTEGER NOT NULL DEFAULT 11,
    "zktecoCronMinute" INTEGER NOT NULL DEFAULT 0,
    "leaveAutomationCronEnabled" BOOLEAN NOT NULL DEFAULT true,
    "leaveAutomationCronHour" INTEGER NOT NULL DEFAULT 23,
    "leaveAutomationCronMinute" INTEGER NOT NULL DEFAULT 43,
    "zktecoBaseUrl" TEXT NOT NULL DEFAULT '',
    "zktecoUsername" TEXT NOT NULL DEFAULT '',
    "zktecoPassword" TEXT NOT NULL DEFAULT '',
    "updatedById" TEXT,
    "updatedByEmail" TEXT,
    "updatedByRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SystemControlSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemControlChangeLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorEmail" TEXT,
    "actorRole" TEXT NOT NULL,
    "actorIsManager" BOOLEAN NOT NULL DEFAULT false,
    "changedFields" TEXT[],
    "previousValues" JSONB,
    "newValues" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SystemControlChangeLog_pkey" PRIMARY KEY ("id")
);

-- Seed single global settings row if absent
INSERT INTO "SystemControlSettings" ("id")
VALUES ('global')
ON CONFLICT ("id") DO NOTHING;
