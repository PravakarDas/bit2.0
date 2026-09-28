-- CreateTable
CREATE TABLE "GoogleDriveConfig" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "serviceAccountEmail" TEXT NOT NULL DEFAULT '',
    "privateKeyEncrypted" TEXT NOT NULL DEFAULT '',
    "sharedDriveId" TEXT,
    "rootFolderId" TEXT NOT NULL DEFAULT '',
    "rootFolderName" TEXT NOT NULL DEFAULT 'Payroll',
    "updatedById" TEXT,
    "updatedByEmail" TEXT,
    "updatedByRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleDriveConfig_pkey" PRIMARY KEY ("id")
);
