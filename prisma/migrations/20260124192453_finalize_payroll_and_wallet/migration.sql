-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_loanId_fkey";

-- AlterTable
ALTER TABLE "AuditLog" ALTER COLUMN "oldEmi" DROP NOT NULL,
ALTER COLUMN "newEmi" DROP NOT NULL,
ALTER COLUMN "loanId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "walletBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SystemAudit" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemAudit_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
