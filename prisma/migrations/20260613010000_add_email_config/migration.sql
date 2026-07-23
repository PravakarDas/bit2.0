-- RECONSTRUCTED — see MigrationRecoveryReport.md ("EmailConfig had no migration at all").
--
-- The `EmailConfig` model was added to prisma/schema.prisma in commit 6feb58a
-- "(feat): nodemailer setup and test mail sending part added" but no corresponding
-- `prisma migrate dev` was ever run for it against this database — it has no entry
-- at all in `_prisma_migrations` (not even a failed one), and the table was created
-- directly by some other means.
--
-- The SQL below was generated with `prisma migrate diff` (from a copy of the current
-- schema.prisma with only the EmailConfig model removed, to the current schema.prisma),
-- so it is byte-for-byte what Prisma itself would generate for this model — it was not
-- hand-written. It was verified against the live database via `prisma db pull --print`
-- before being resolved as applied (the live EmailConfig table matches this exactly).
--
-- This migration is registered via `prisma migrate resolve --applied` (bookkeeping only)
-- because the table already exists in the database — this file is not executed.

-- CreateTable
CREATE TABLE "EmailConfig" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "provider" TEXT NOT NULL DEFAULT 'GMAIL',
    "smtpHost" TEXT NOT NULL DEFAULT 'smtp.gmail.com',
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "secure" BOOLEAN NOT NULL DEFAULT false,
    "senderEmail" TEXT NOT NULL DEFAULT '',
    "appPasswordEncrypted" TEXT NOT NULL DEFAULT '',
    "updatedById" TEXT,
    "updatedByEmail" TEXT,
    "updatedByRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailConfig_pkey" PRIMARY KEY ("id")
);
