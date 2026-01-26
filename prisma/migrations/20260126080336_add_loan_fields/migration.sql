-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "emiStartMonth" INTEGER,
ADD COLUMN     "emiStartYear" INTEGER,
ADD COLUMN     "reason" TEXT NOT NULL DEFAULT 'Personal';
