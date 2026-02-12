-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'LEAVE_APPLICATION_PENDING';
ALTER TYPE "NotificationType" ADD VALUE 'INCREMENT_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'WALLET_REQUEST_PENDING';
ALTER TYPE "NotificationType" ADD VALUE 'LOAN_APPLICATION_PENDING';
ALTER TYPE "NotificationType" ADD VALUE 'EMPLOYEE_REGISTRATION_PENDING';
ALTER TYPE "NotificationType" ADD VALUE 'PAYROLL_NOTIFICATION';
ALTER TYPE "NotificationType" ADD VALUE 'SYSTEM_ALERT';
ALTER TYPE "NotificationType" ADD VALUE 'DEADLINE_REMINDER';
