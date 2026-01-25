-- CreateEnum
CREATE TYPE "SalaryChangeReason" AS ENUM ('JOINING', 'PROMOTION', 'INCREMENT', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "BaseSalary" (
    "id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "reason" "SalaryChangeReason" NOT NULL DEFAULT 'JOINING',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BaseSalary_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BaseSalary" ADD CONSTRAINT "BaseSalary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
