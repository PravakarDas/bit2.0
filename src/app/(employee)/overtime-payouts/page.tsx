import EmployeeOvertimePayoutClient from "@/components/employee/EmployeeOvertimePayoutClient";

export const dynamic = "force-dynamic";

export default function EmployeeOvertimePayoutPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My OT/UT Payout</h1>
        <p className="text-muted-foreground">Your yearly overtime/undertime calculation and payout status.</p>
      </div>
      <EmployeeOvertimePayoutClient />
    </div>
  );
}
