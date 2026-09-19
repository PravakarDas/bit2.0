-- CreateEnum
CREATE TYPE "SalaryPaymentStatus" AS ENUM ('DRAFT', 'FINALIZED');

-- AlterTable (existing rows become FINALIZED via the default, so past payroll is unchanged)
ALTER TABLE "SalaryPayment" ADD COLUMN     "customBonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "customBonusNote" TEXT,
ADD COLUMN     "draftInputs" JSONB,
ADD COLUMN     "payslipSentAt" TIMESTAMP(3),
ADD COLUMN     "status" "SalaryPaymentStatus" NOT NULL DEFAULT 'FINALIZED';

-- CreateIndex
CREATE INDEX "SalaryPayment_month_status_idx" ON "SalaryPayment"("month", "status");
