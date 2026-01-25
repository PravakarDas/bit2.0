-- AlterTable
ALTER TABLE "MedicalClaim" ADD COLUMN     "attachmentUrl" TEXT;

-- CreateTable
CREATE TABLE "MedicalEntitlement" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "totalLimit" DOUBLE PRECISION NOT NULL,
    "remainingBalance" DOUBLE PRECISION NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MedicalEntitlement_userId_year_key" ON "MedicalEntitlement"("userId", "year");

-- AddForeignKey
ALTER TABLE "MedicalEntitlement" ADD CONSTRAINT "MedicalEntitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
