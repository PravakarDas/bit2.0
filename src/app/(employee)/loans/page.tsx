import { getMyLoans } from "@/actions/loan.actions";
import { getDbUser } from "@/actions/user.actions";
import { LoanDashboard } from "@/components/employee/LoanDashboard";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function isMissingBranchLoanToggleColumnError(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
        return false;
    }

    if (error.code !== "P2022") {
        return false;
    }

    const column =
        typeof error.meta?.column === "string"
            ? error.meta.column
            : typeof error.message === "string"
              ? error.message
              : "";

    return column.includes("Branch.isLoanApplicationEnabled");
}

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

    const salaryCap = user.baseSalary * 12 * 0.5;
    const globalCap = 300000;
    const baseCap = Math.min(salaryCap, globalCap);

    const maxEligibleAmount = Math.max(0, baseCap - currentDebt);

    let branchLoanApplicationEnabled = true;
    if (user.branchId) {
        try {
            branchLoanApplicationEnabled = (
                await prisma.branch.findUnique({
                    where: { id: user.branchId },
                    select: { isLoanApplicationEnabled: true },
                })
            )?.isLoanApplicationEnabled ?? true;
        } catch (error) {
            if (!isMissingBranchLoanToggleColumnError(error)) {
                throw error;
            }
            branchLoanApplicationEnabled = true;
        }
    }

    return (
        <div className="container mx-auto py-8">
            <div className="flex flex-col gap-2 mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Financial Aid</h1>
                <p className="text-muted-foreground">Manage your loans and apply for new financial assistance.</p>
            </div>

            <LoanDashboard
                loans={loans}
                maxEligibleAmount={maxEligibleAmount}
                branchLoanApplicationEnabled={branchLoanApplicationEnabled}
            />
        </div>
    );
}
