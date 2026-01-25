import { getPayrollAggregation } from "@/actions/payroll.actions";
import { PayrollClient } from "@/components/admin/PayrollClient";

export default async function PayrollPage() {
    const payrollData = await getPayrollAggregation();

    return (
        <div className="container mx-auto">
            <PayrollClient initialData={payrollData as any} />
        </div>
    );
}
