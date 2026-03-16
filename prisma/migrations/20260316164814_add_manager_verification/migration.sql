-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LoanStatus" ADD VALUE 'MANAGER_VERIFIED';
ALTER TYPE "LoanStatus" ADD VALUE 'MANAGER_REJECTED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentType" ADD VALUE 'MANAGER_VERIFIED';
ALTER TYPE "PaymentType" ADD VALUE 'MANAGER_REJECTED';

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "adminDeclinedAt" TIMESTAMP(3),
ADD COLUMN     "adminDeclinedReason" TEXT,
ADD COLUMN     "managerComments" TEXT,
ADD COLUMN     "managerRejectionReason" TEXT,
ADD COLUMN     "managerVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "managerVerifiedById" TEXT;

-- AlterTable
ALTER TABLE "OvertimeRequest" ADD COLUMN     "adminDeclinedAt" TIMESTAMP(3),
ADD COLUMN     "adminDeclinedReason" TEXT,
ADD COLUMN     "managerComments" TEXT,
ADD COLUMN     "managerRejectionReason" TEXT,
ADD COLUMN     "managerVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "managerVerifiedById" TEXT;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_managerVerifiedById_fkey" FOREIGN KEY ("managerVerifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertimeRequest" ADD CONSTRAINT "OvertimeRequest_managerVerifiedById_fkey" FOREIGN KEY ("managerVerifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
