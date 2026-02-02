-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'YEARLY_OT_UT_ADJUSTMENT';

-- CreateTable
CREATE TABLE "OvertimePayout" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "baseSalary" DOUBLE PRECISION NOT NULL,
    "totalRequiredActiveTime" TEXT NOT NULL,
    "totalRequiredBreakTime" TEXT NOT NULL,
    "totalOvertimeUndertime" TEXT NOT NULL,
    "totalRequiredMinutes" INTEGER NOT NULL,
    "totalOvertimeMinutes" INTEGER NOT NULL,
    "calculatedAmount" INTEGER NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OvertimePayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OvertimePayout_userId_year_key" ON "OvertimePayout"("userId", "year");

-- AddForeignKey
ALTER TABLE "OvertimePayout" ADD CONSTRAINT "OvertimePayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
