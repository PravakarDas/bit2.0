/**
 * Employee ID printed on payslips: "BTCD" + the employee's attendance ID.
 * Employees without an attendance ID have no printable code (null).
 */
export function formatEmployeeCode(attendanceId: string | null | undefined): string | null {
  const id = attendanceId?.trim();
  return id ? `BTCD${id}` : null;
}
