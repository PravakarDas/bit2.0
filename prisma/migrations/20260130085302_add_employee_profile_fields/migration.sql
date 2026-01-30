-- CreateEnum
CREATE TYPE "ProfileUpdateStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PROFILE_UPDATE_REQUEST';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "attendanceId" TEXT,
ADD COLUMN     "bankAccountNumber" TEXT,
ADD COLUMN     "bloodGroup" TEXT,
ADD COLUMN     "currentCity" TEXT,
ADD COLUMN     "currentCountry" TEXT,
ADD COLUMN     "currentPostalCode" TEXT,
ADD COLUMN     "currentState" TEXT,
ADD COLUMN     "currentStreet" TEXT,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "dateOfJoining" TIMESTAMP(3),
ADD COLUMN     "department" TEXT,
ADD COLUMN     "designation" TEXT,
ADD COLUMN     "emergencyContactAddress" TEXT,
ADD COLUMN     "emergencyContactEmail" TEXT,
ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "emergencyContactRelationship" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "githubLink" TEXT,
ADD COLUMN     "linkedinLink" TEXT,
ADD COLUMN     "nidNumber" TEXT,
ADD COLUMN     "permanentCity" TEXT,
ADD COLUMN     "permanentCountry" TEXT,
ADD COLUMN     "permanentPostalCode" TEXT,
ADD COLUMN     "permanentState" TEXT,
ADD COLUMN     "permanentStreet" TEXT,
ADD COLUMN     "personalEmail" TEXT,
ADD COLUMN     "phoneNumber" TEXT,
ADD COLUMN     "portfolioLink" TEXT,
ADD COLUMN     "workEmail" TEXT;

-- CreateTable
CREATE TABLE "ProfileUpdateRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ProfileUpdateStatus" NOT NULL DEFAULT 'PENDING',
    "requestedChanges" JSONB NOT NULL,
    "previousValues" JSONB,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileUpdateRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ProfileUpdateRequest" ADD CONSTRAINT "ProfileUpdateRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
