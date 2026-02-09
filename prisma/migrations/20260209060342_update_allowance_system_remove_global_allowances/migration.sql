/*
  Warnings:

  - You are about to drop the column `type` on the `AllowanceType` table. All the data in the column will be lost.
  - You are about to drop the column `foodAllowance` on the `SystemSettings` table. All the data in the column will be lost.
  - You are about to drop the column `mobileAllowance` on the `SystemSettings` table. All the data in the column will be lost.
  - You are about to drop the `_AllowanceTypeToBranch` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `scope` to the `AllowanceType` table without a default value. This is not possible if the table is not empty.
  - Added the required column `valueType` to the `AllowanceType` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AllowanceScope" AS ENUM ('FIXED', 'FULL_BRANCH', 'CUSTOM');

-- DropForeignKey
ALTER TABLE "_AllowanceTypeToBranch" DROP CONSTRAINT "_AllowanceTypeToBranch_A_fkey";

-- DropForeignKey
ALTER TABLE "_AllowanceTypeToBranch" DROP CONSTRAINT "_AllowanceTypeToBranch_B_fkey";

-- AlterTable
ALTER TABLE "AllowanceType" DROP COLUMN "type",
ADD COLUMN     "scope" "AllowanceScope" NOT NULL,
ADD COLUMN     "targetBranchIds" TEXT[],
ADD COLUMN     "valueType" "ValueType" NOT NULL;

-- AlterTable
ALTER TABLE "SystemSettings" DROP COLUMN "foodAllowance",
DROP COLUMN "mobileAllowance";

-- DropTable
DROP TABLE "_AllowanceTypeToBranch";

-- CreateTable
CREATE TABLE "EmployeeAllowance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "allowanceId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeAllowance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollAllowanceOverride" (
    "id" TEXT NOT NULL,
    "payrollMonth" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "allowanceId" TEXT NOT NULL,
    "isIncluded" BOOLEAN NOT NULL,
    "customAmount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollAllowanceOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeAllowance_userId_allowanceId_key" ON "EmployeeAllowance"("userId", "allowanceId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollAllowanceOverride_payrollMonth_userId_allowanceId_key" ON "PayrollAllowanceOverride"("payrollMonth", "userId", "allowanceId");

-- AddForeignKey
ALTER TABLE "EmployeeAllowance" ADD CONSTRAINT "EmployeeAllowance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAllowance" ADD CONSTRAINT "EmployeeAllowance_allowanceId_fkey" FOREIGN KEY ("allowanceId") REFERENCES "AllowanceType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAllowanceOverride" ADD CONSTRAINT "PayrollAllowanceOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAllowanceOverride" ADD CONSTRAINT "PayrollAllowanceOverride_allowanceId_fkey" FOREIGN KEY ("allowanceId") REFERENCES "AllowanceType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
