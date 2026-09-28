import { getPayrollAggregation, getFinalizedPayrollForMonth } from "@/actions/payroll.actions";
import { PayrollClient } from "@/components/admin/PayrollClient";
import { PayrollSelectors } from "@/components/admin/PayrollSelectors";

export default async function PayrollPage({
    searchParams
}: {
    searchParams: { month?: string, year?: string }
}) {
    const params = await searchParams;

    // Logic: Starting from Jan 2026.
    const selectedYear = params.year ? parseInt(params.year) : 2026;
    const selectedMonth = params.month ? parseInt(params.month) : 1;

    const payrollData = await getPayrollAggregation(selectedMonth, selectedYear);
    const finalizedData = await getFinalizedPayrollForMonth(
        `${selectedYear}-${selectedMonth.toString().padStart(2, "0")}`
    );

    return (
        <div className="container mx-auto space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Payroll Management</h1>
                    <p className="text-muted-foreground text-sm">Review and process organization payroll for future periods.</p>
                </div>
                <PayrollSelectors
                    currentMonth={selectedMonth}
                    currentYear={selectedYear}
                />
            </div>

            <PayrollClient
                // Remount when switching month so the per-employee form state starts fresh.
                key={`${selectedYear}-${selectedMonth}`}
                initialData={payrollData}
                finalized={finalizedData}
                month={selectedMonth}
                year={selectedYear}
            />
        </div>
    );
}
