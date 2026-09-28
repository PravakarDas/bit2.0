import { formatCurrency } from "@/lib/utils";
import { isPayrollManualMedicalEntry } from "@/lib/medical-history";

interface MedicalAmountProps {
  claim: {
    amount: number;
    status: string;
    description: string;
    paidAmount?: number | null;
    payrollMonth?: string | null;
  };
  align?: "left" | "right" | "center";
}

/**
 * Shows the amount for a medical history row. Once a claim has been paid through
 * payroll, the amount actually paid is the headline figure and the original claim is
 * shown beneath it when it differs.
 */
export function MedicalAmount({ claim, align = "right" }: MedicalAmountProps) {
  const alignClass = align === "right" ? "items-end" : align === "center" ? "items-center" : "items-start";
  const paid = claim.status === "PAID" && claim.paidAmount !== null && claim.paidAmount !== undefined;

  if (!paid) {
    return <span className="tabular-nums">{formatCurrency(claim.amount)}</span>;
  }

  const manual = isPayrollManualMedicalEntry(claim);
  return (
    <div className={`flex flex-col ${alignClass} leading-tight`}>
      <span className="tabular-nums font-semibold">{formatCurrency(claim.paidAmount as number)}</span>
      {manual ? (
        <span className="text-[10px] text-muted-foreground">Added by admin · payroll {claim.payrollMonth}</span>
      ) : (
        <span className="text-[10px] text-muted-foreground">
          {claim.paidAmount !== claim.amount ? `Claimed ${formatCurrency(claim.amount)} · ` : ""}
          Paid in payroll {claim.payrollMonth}
        </span>
      )}
    </div>
  );
}
