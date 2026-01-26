import { getMyLoans } from "@/actions/loan.actions";
import { getDbUser } from "@/actions/user.actions";
import { LoanDashboard } from "@/components/employee/LoanDashboard";
import { redirect } from "next/navigation";

export default async function LoansPage() {
    const user = await getDbUser();
    if (!user) redirect("/sign-in");

    const loans = await getMyLoans();

    // Calculate max eligible amount (50% of salary or 300k cap)
    // We deduct existing active principal to show remaining capacity if needed, 
    // but for "max eligible for NEW loan", the rule is total exposure.
    // Let's passed the theoretical max for the form, and the validator checks the rest.
    // Actually, usually "Available Limit" means (Cap - CurrentDebt).

    const currentDebt = loans
        .filter(l => l.status === "APPROVED" || l.status === "ACTIVE")
        .reduce((sum, l) => sum + l.remainingPrincipal, 0);

    const salaryLimit = user.baseSalary * 0.5; // 50% monthly salary constraint (?) 
    // Wait, the requirement said "Requested Amount ... <= 50% of current salary". 
    // Usually this means the new loan amount itself can't exceed that, OR the total. 
    // Let's assume it's per loan or total cap. 
    // The prompt: "Must be <= 50% of current salary AND <= 300,000 BDT" implies 50% of monthly salary as a cap for the loan amount? 
    // Or 50% of salary is the EMI limit? 
    // "Requested Amount ... <= 50% of current salary" -> This is very small if it's monthly. 
    // Maybe they mean 50% of annual? Or maybe 50% of monthly salary is the MAX EMI?
    // Let's stick to the prompt literal: Amount <= 50% Salary.
    // If salary is 50k, max loan is 25k? That seems low for a loan system.
    // RE-READING PROMPT: "Requested Amount: Input field with validation (Must be <= 50% of current salary AND <= 300,000 BDT)."
    // Okay, I will implement exactly that.

    // However, usually there's a global cap of 300k.
    // Let's pass the 300k cap as the strict limit, but the form will also validate against salary.

    // Let's calculate the "Effective Available Limit" based on the 300k global cap.
    const globalLimit = 300000;
    const availableSafeLimit = Math.max(0, globalLimit - currentDebt);

    return (
        <div className="container mx-auto py-8">
            <div className="flex flex-col gap-2 mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Financial Aid</h1>
                <p className="text-muted-foreground">Manage your loans and apply for new financial assistance.</p>
            </div>

            <LoanDashboard
                loans={loans as any}
                maxEligibleAmount={availableSafeLimit}
            />
        </div>
    );
}
