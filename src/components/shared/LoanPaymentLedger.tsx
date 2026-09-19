import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";

export interface LoanLedgerPayment {
  id: string;
  amount: number;
  type: string; // "EMI" = deducted in payroll, "MANUAL" = cash/off-payroll payment
  payrollMonth: string; // "YYYY-MM"
  createdAt: Date | string;
}

/**
 * Month-by-month repayment history of a manual-mode loan with the running balance.
 */
export function LoanPaymentLedger({
  issuedAmount,
  payments,
}: {
  issuedAmount: number;
  payments: LoanLedgerPayment[];
}) {
  const ordered = [...payments].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const rows = ordered.map((payment, index) => {
    const repaidSoFar = ordered.slice(0, index + 1).reduce((sum, p) => sum + p.amount, 0);
    return { payment, balanceAfter: Math.round((issuedAmount - repaidSoFar) * 100) / 100 };
  });

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground italic py-4 text-center">No deductions or payments recorded yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Month</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="text-right">Balance after</TableHead>
          <TableHead>Recorded</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ payment, balanceAfter }) => (
          <TableRow key={payment.id}>
            <TableCell className="font-medium">{payment.payrollMonth}</TableCell>
            <TableCell>
              <Badge variant="outline">{payment.type === "EMI" ? "Payroll deduction" : "Cash payment"}</Badge>
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatCurrency(payment.amount)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatCurrency(balanceAfter)}</TableCell>
            <TableCell className="text-muted-foreground text-xs">{formatDate(payment.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
