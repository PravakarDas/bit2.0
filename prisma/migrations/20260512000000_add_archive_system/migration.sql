-- AlterEnum - Add new archived statuses
ALTER TYPE "EmployeeStatus" ADD VALUE 'LAYOFF' AFTER 'TERMINATED';
ALTER TYPE "EmployeeStatus" ADD VALUE 'RETIRED' AFTER 'LAYOFF';
ALTER TYPE "EmployeeStatus" ADD VALUE 'CONTRACT_ENDED' AFTER 'RETIRED';
ALTER TYPE "EmployeeStatus" ADD VALUE 'SUSPENDED' AFTER 'CONTRACT_ENDED';
ALTER TYPE "EmployeeStatus" ADD VALUE 'ABSCONDED' AFTER 'SUSPENDED';

-- AlterTable User - Add archive tracking fields
ALTER TABLE "User" ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "payrollContinuationMonths" INTEGER NOT NULL DEFAULT 2;

-- Create index for efficient archived employee queries
CREATE INDEX "idx_user_archived_at" ON "User"("archivedAt");
CREATE INDEX "idx_user_employee_status_archived" ON "User"("employeeStatus", "isArchived");
