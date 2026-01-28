-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'PROBATION', 'RESIGNED', 'TERMINATED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "employeeStatus" "EmployeeStatus" DEFAULT 'ACTIVE',
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastName" TEXT;
