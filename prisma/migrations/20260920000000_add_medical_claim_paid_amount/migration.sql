-- AlterTable (nullable: existing claims are unchanged; history falls back to `amount`)
ALTER TABLE "MedicalClaim" ADD COLUMN     "paidAmount" DOUBLE PRECISION,
ADD COLUMN     "payrollMonth" TEXT;
