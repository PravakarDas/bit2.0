-- CreateEnum
CREATE TYPE "LoanMode" AS ENUM ('AUTO', 'MANUAL');

-- AlterTable
ALTER TABLE "SystemControlSettings" ADD COLUMN     "loanMode" "LoanMode" NOT NULL DEFAULT 'AUTO';
