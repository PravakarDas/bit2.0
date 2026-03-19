import { getMyLoans } from "@/actions/loan.actions";
import { getDbUser } from "@/actions/user.actions";
import { LoanDashboard } from "@/components/employee/LoanDashboard";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LoansPage() {
    const user = await getDbUser();
    if (!user) redirect("/sign-in");

    const loans = await getMyLoans();

    // DYNAMIC Max Eligible Amount Logic:
    // 1. Base Cap: Lower of (50% Base Salary) OR (300,000 Global Limit)
    // 2. Remaining Capacity: Base Cap - (Total Current Debt)
    // This allows multiple loans as long as the cumulative total fits within the cap.

    const currentDebt = loans
        .filter(l => l.status === "APPROVED" || l.status === "ACTIVE")
        .reduce((sum, l) => sum + l.remainingPrincipal, 0);

    const salaryCap = user.baseSalary * 0.5;
    const globalCap = 300000;
    const baseCap = Math.min(salaryCap, globalCap);

    const maxEligibleAmount = Math.max(0, baseCap - currentDebt);

    return (
        <div className="container mx-auto py-8">
            <div className="flex flex-col gap-2 mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Financial Aid</h1>
                <p className="text-muted-foreground">Manage your loans and apply for new financial assistance.</p>
            </div>

            <LoanDashboard
                loans={loans}
                maxEligibleAmount={maxEligibleAmount}
            />
        </div>
    );
}
