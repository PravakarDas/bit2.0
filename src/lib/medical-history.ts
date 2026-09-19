/** Description stored on medical history rows that admin added directly in payroll (no employee claim). */
export const MANUAL_MEDICAL_DESCRIPTION_PREFIX = "Added by admin in payroll";

export function isPayrollManualMedicalEntry(claim: { description: string }) {
  return claim.description.startsWith(MANUAL_MEDICAL_DESCRIPTION_PREFIX);
}

/** What was actually paid for a claim: the recorded paid amount, else the claimed amount (older claims). */
export function getPaidMedicalAmount(claim: { amount: number; paidAmount?: number | null }) {
  return claim.paidAmount ?? claim.amount;
}
