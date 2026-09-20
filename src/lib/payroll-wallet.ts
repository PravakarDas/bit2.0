/**
 * Wallet helpers for payroll. Pure (no database), so they are unit-tested.
 */

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONEY_TOLERANCE = 0.01;

/** Description of the entry a payroll writes to clear the employee's wallet, e.g. "Adjusted in July-2026 salary". */
export function walletClearingDescription(payrollMonth: string): string {
  const [year, monthNum] = payrollMonth.split("-");
  return `Adjusted in ${MONTH_NAMES[parseInt(monthNum) - 1]}-${year} salary`;
}

/**
 * Removes the previous payroll's own clearing entry from a list of wallet entries.
 *
 * Entries recorded after the previous payroll include that payroll's clearing entry (written as
 * it settled), which belongs to the previous month's payslip, not this one. It is recognised by
 * the exact description for that payroll's month AND an amount that cancels that payroll's wallet
 * adjustment, so an admin-typed entry that merely looks similar is kept.
 */
export function withoutPreviousPayrollClearing<T extends { description: string; amount: number }>(
  rows: T[],
  previous: { month: string; walletAdjustment: number } | null
): T[] {
  if (!previous) return rows;

  const description = walletClearingDescription(previous.month);
  const index = rows.findIndex(
    (row) => row.description === description && Math.abs(row.amount + previous.walletAdjustment) <= MONEY_TOLERANCE
  );
  return index === -1 ? rows : [...rows.slice(0, index), ...rows.slice(index + 1)];
}
