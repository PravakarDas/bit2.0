import { getMyLoans } from "@/actions/loan.actions";
import { getDbUser } from "@/actions/user.actions";
import { LoanDashboard } from "@/components/employee/LoanDashboard";
import { redirect } from "next/navigation";

export default async function LoansPage() {
    const user = await getDbUser();
    if (!user) redirect("/sign-in");

    const loans = await getMyLoans();

    // STRICT Max Eligible Amount Logic:
    // User can claim UP TO 50% of their base salary OR 300,000 Global Cap (whichever is lower).
    // This is the absolute limit for the application form.
    // Existing debt does not reduce this specific "per application" cap, 
    // though global exposure might be checked on the backend.

    const salaryCap = user.baseSalary * 0.5;
    const globalCap = 300000;
    const maxEligibleAmount = Math.min(salaryCap, globalCap);

    return (
        <div className="container mx-auto py-8">
            <div className="flex flex-col gap-2 mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Financial Aid</h1>
                <p className="text-muted-foreground">Manage your loans and apply for new financial assistance.</p>
            </div>

            <LoanDashboard
                loans={loans as any}
                maxEligibleAmount={maxEligibleAmount}
            />
        </div>
    );
}
