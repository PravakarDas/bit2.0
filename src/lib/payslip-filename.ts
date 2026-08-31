/**
 * Pure naming helpers for the payroll Google Drive archive
 * (`Payroll/{Month Year}/{Branch}/{filename}.pdf`) — no Prisma import, so
 * it's safely testable by the dependency-free `node --test` harness. See
 * `PayrollEmailImplementationPlan.md` §10–§11 for the design this
 * implements: `{userId}_{sanitized employee name}_{Month}_{Year}.pdf`,
 * using `SalaryPayment.userId` since no human-readable employee code
 * exists anywhere in the schema.
 */

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Characters Drive/most filesystems reject in a filename, plus control characters. */
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|\x00-\x1F]/g;

const MAX_SEGMENT_LENGTH = 150;

/** 1-12 → "January".."December". Throws on an out-of-range value rather than silently producing a wrong folder/filename. */
export function getMonthName(monthNumber: number): string {
  if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    throw new Error(`Invalid month number: ${monthNumber}. Expected an integer from 1 to 12.`);
  }
  return MONTH_NAMES[monthNumber - 1];
}

/**
 * Strips/replaces characters Drive or common filesystems reject, collapses
 * any run of whitespace or underscores into a single underscore, and trims
 * leading/trailing underscores. Deterministic — the same input always
 * produces the same output.
 */
export function sanitizeForDriveName(input: string): string {
  const sanitized = input
    .replace(INVALID_FILENAME_CHARS, "_")
    .trim()
    .replace(/[\s_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_SEGMENT_LENGTH);

  return sanitized || "unnamed";
}

/** "February 2026" — the month-level folder name under the configured Drive root. */
export function generatePayrollMonthFolderName(year: number, monthNumber: number): string {
  return `${getMonthName(monthNumber)} ${year}`;
}

/**
 * The branch-level folder name. An employee with no assigned branch
 * (`User.branchId: null`) uses the fixed fallback `"Unassigned"` — this is
 * the confirmed decision from `PayrollEmailImplementationPlan.md` §11, not
 * a placeholder awaiting a future choice.
 */
export function resolveBranchFolderName(branchName: string | null | undefined): string {
  const trimmed = branchName?.trim();
  if (!trimmed) {
    return "Unassigned";
  }
  const sanitized = sanitizeForDriveName(trimmed);
  return sanitized === "unnamed" ? "Unassigned" : sanitized;
}

export interface PayslipFilenameInput {
  /** `SalaryPayment.userId` — the real, already-unique identifier used since no employee code field exists. */
  userId: string;
  employeeName: string;
  year: number;
  /** 1-12 */
  monthNumber: number;
}

/** `{userId}_{sanitized employee name}_{Month}_{Year}.pdf` — e.g. `cmn123456_Abdul_Kader_February_2026.pdf`. */
export function generatePayslipFilename(input: PayslipFilenameInput): string {
  const sanitizedUserId = sanitizeForDriveName(input.userId);
  const sanitizedName = sanitizeForDriveName(input.employeeName);
  const monthName = getMonthName(input.monthNumber);
  return `${sanitizedUserId}_${sanitizedName}_${monthName}_${input.year}.pdf`;
}
