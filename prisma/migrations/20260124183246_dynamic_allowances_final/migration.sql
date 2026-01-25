/*
  Warnings:

  - You are about to drop the `Settings` table. If the table is not empty, all the data it contains will be lost.
  - Changed the type of `type` on the `BonusType` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `totalAllowances` to the `SalaryPayment` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ValueType" AS ENUM ('FIXED', 'PERCENTAGE');

-- AlterTable
ALTER TABLE "BonusType" DROP COLUMN "type",
ADD COLUMN     "type" "ValueType" NOT NULL;

-- AlterTable
ALTER TABLE "MedicalClaim" ADD COLUMN     "medicalEntitlementId" TEXT;

-- AlterTable
ALTER TABLE "SalaryPayment" ADD COLUMN     "totalAllowances" DOUBLE PRECISION NOT NULL;

-- DropTable
DROP TABLE "Settings";

-- DropEnum
DROP TYPE "BonusValueType";

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "medicalClaimLimit" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "foodAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mobileAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllowanceType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" "ValueType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllowanceType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AllowanceTypeToBranch" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AllowanceTypeToBranch_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_BonusTypeToBranch" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_BonusTypeToBranch_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_AllowanceTypeToBranch_B_index" ON "_AllowanceTypeToBranch"("B");

-- CreateIndex
CREATE INDEX "_BonusTypeToBranch_B_index" ON "_BonusTypeToBranch"("B");

-- AddForeignKey
ALTER TABLE "MedicalClaim" ADD CONSTRAINT "MedicalClaim_medicalEntitlementId_fkey" FOREIGN KEY ("medicalEntitlementId") REFERENCES "MedicalEntitlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AllowanceTypeToBranch" ADD CONSTRAINT "_AllowanceTypeToBranch_A_fkey" FOREIGN KEY ("A") REFERENCES "AllowanceType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AllowanceTypeToBranch" ADD CONSTRAINT "_AllowanceTypeToBranch_B_fkey" FOREIGN KEY ("B") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BonusTypeToBranch" ADD CONSTRAINT "_BonusTypeToBranch_A_fkey" FOREIGN KEY ("A") REFERENCES "BonusType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BonusTypeToBranch" ADD CONSTRAINT "_BonusTypeToBranch_B_fkey" FOREIGN KEY ("B") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
