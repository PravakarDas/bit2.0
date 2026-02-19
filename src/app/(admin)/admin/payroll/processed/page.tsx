import { getAllProcessedPayrolls } from "@/actions/payroll.actions";
import { ProcessedPayrollClient } from "@/components/admin/ProcessedPayrollClient";

export default async function ProcessedPayrollPage() {
    const processedPayrolls = await getAllProcessedPayrolls();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Processed Payroll</h1>
                <p className="text-muted-foreground">
                    View all processed salary payments with complete details
                </p>
            </div>
            <ProcessedPayrollClient data={processedPayrolls} />
        </div>
    );
}
