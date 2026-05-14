/**
 * Employee Status Helper Utilities
 * Centralized logic for determining employee status types and archive eligibility
 */

import { EmployeeStatus } from "@prisma/client";

/**
 * Active type statuses - employees who should generate operational activity
 */
const ACTIVE_TYPE_STATUSES: EmployeeStatus[] = ["ACTIVE", "PROBATION"];

/**
 * Archived type statuses - employees who should NOT generate operational activity
 */
const ARCHIVED_TYPE_STATUSES: EmployeeStatus[] = [
  "RESIGNED",
  "TERMINATED",
  "LAYOFF",
  "RETIRED",
  "CONTRACT_ENDED",
  "SUSPENDED",
  "ABSCONDED",
];

/**
 * Check if a status is an active type (generates operational activity)
 */
export function isActiveStatus(status: EmployeeStatus | null | undefined): boolean {
  if (!status) return true; // Default to active if not set
  return ACTIVE_TYPE_STATUSES.includes(status);
}

/**
 * Check if a status is an archived type (does NOT generate operational activity)
 */
export function isArchivedStatus(status: EmployeeStatus | null | undefined): boolean {
  if (!status) return false;
  return ARCHIVED_TYPE_STATUSES.includes(status);
}

/**
 * Get all active type statuses
 */
export function getActiveTypeStatuses(): EmployeeStatus[] {
  return [...ACTIVE_TYPE_STATUSES];
}

/**
 * Get all archived type statuses
 */
export function getArchivedTypeStatuses(): EmployeeStatus[] {
  return [...ARCHIVED_TYPE_STATUSES];
}

/**
 * Check if status transition is archiving (going from active to archived)
 */
export function isArchivingTransition(
  currentStatus: EmployeeStatus | null | undefined,
  newStatus: EmployeeStatus
): boolean {
  return isActiveStatus(currentStatus) && isArchivedStatus(newStatus);
}

/**
 * Check if status transition is reactivating (going from archived to active)
 */
export function isReactivatingTransition(
  currentStatus: EmployeeStatus | null | undefined,
  newStatus: EmployeeStatus
): boolean {
  return isArchivedStatus(currentStatus) && isActiveStatus(newStatus);
}

/**
 * Get display label for employee status
 */
export function getStatusLabel(status: EmployeeStatus | null | undefined): string {
  if (!status) return "Active";

  const labels: Record<EmployeeStatus, string> = {
    ACTIVE: "Active",
    PROBATION: "Probation",
    RESIGNED: "Resigned",
    TERMINATED: "Terminated",
    LAYOFF: "Layoff",
    RETIRED: "Retired",
    CONTRACT_ENDED: "Contract Ended",
    SUSPENDED: "Suspended",
    ABSCONDED: "Absconded",
  };

  return labels[status] || status;
}

/**
 * Get status badge color/variant
 */
export function getStatusBadgeVariant(
  status: EmployeeStatus | null | undefined
): "default" | "secondary" | "destructive" | "outline" {
  if (!status) return "default";

  if (isActiveStatus(status)) {
    return status === "PROBATION" ? "secondary" : "default";
  }

  return "destructive";
}

/**
 * Check if employee should continue payroll generation
 * @param archivedAt - Timestamp when employee was archived
 * @param payrollContinuationMonths - Number of months to continue payroll
 * @param currentDate - Date to check against (defaults to now)
 */
export function shouldGeneratePayroll(
  archivedAt: Date | null | undefined,
  payrollContinuationMonths: number,
  currentDate: Date = new Date()
): boolean {
  // If not archived, always generate payroll
  if (!archivedAt) return true;

  // Calculate the cutoff date for payroll generation
  const cutoffDate = new Date(archivedAt);
  cutoffDate.setMonth(cutoffDate.getMonth() + payrollContinuationMonths);

  // Generate payroll if current date is before or on the cutoff date
  return currentDate <= cutoffDate;
}
