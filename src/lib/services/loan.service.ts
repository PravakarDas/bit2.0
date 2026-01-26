import { prisma } from "@/lib/prisma";
import { PaymentType, LoanStatus } from "@prisma/client";

/**
 * Core Recalculation Function
 * Formulas: round(remainingPrincipal / remainingMonths)
 * Edge case: If 1 month left, EMI = remainingPrincipal
 */
export function calculateEMI(remainingPrincipal: number, remainingMonths: number): number {
    if (remainingMonths <= 0) return 0;
    if (remainingMonths === 1) return remainingPrincipal;

    return Math.round(remainingPrincipal / remainingMonths);
}

/**
 * Waterfall Payment Logic
 * Order: 
 * 1. Deduct from carryForward
 * 2. Deduct from currentEmi
 * 3. Remainder to remainingPrincipal
 */
export async function processLoanPayment(loanId: string, amount: number, type: PaymentType) {
    return await prisma.$transaction(async (tx) => {
        // 1. Fetch Loan and EmiState
        const loan = await tx.loan.findUnique({
            where: { id: loanId },
            include: { emiState: true }
        });

        if (!loan || !loan.emiState) {
            throw new Error("Loan or EmiState not found");
        }

        const oldEmi = loan.emiState.currentEmi;
        let remainingPayment = amount;
        let newCarryForward = loan.emiState.carryForward;
        let newCurrentEmi = loan.emiState.currentEmi;
        let newRemainingPrincipal = loan.remainingPrincipal;

        // --- Waterfall Phase 1: Carry Forward ---
        if (newCarryForward > 0 && remainingPayment > 0) {
            const deduction = Math.min(newCarryForward, remainingPayment);
            newCarryForward -= deduction;
            remainingPayment -= deduction;
        }

        // --- Waterfall Phase 2: Current EMI ---
        if (newCurrentEmi > 0 && remainingPayment > 0) {
            const deduction = Math.min(newCurrentEmi, remainingPayment);
            newCurrentEmi -= deduction;
            remainingPayment -= deduction;
        }

        // --- Waterfall Phase 3: Principal Reduction ---
        if (remainingPayment > 0) {
            newRemainingPrincipal -= remainingPayment;
            remainingPayment = 0;
        }

        // Ensure principal doesn't go negative
        if (newRemainingPrincipal < 0) {
            newCarryForward += Math.abs(newRemainingPrincipal);
            newRemainingPrincipal = 0;
        }

        // 2. Update Database
        // Record Payment
        await tx.payment.create({
            data: {
                loanId,
                amount,
                type,
                payrollMonth: new Date().toISOString().slice(0, 7), // YYYY-MM
            }
        });

        // Update Loan Principal
        const updatedLoan = await tx.loan.update({
            where: { id: loanId },
            data: {
                remainingPrincipal: newRemainingPrincipal,
                status: newRemainingPrincipal === 0 ? LoanStatus.CLOSED : loan.status
            }
        });

        // Update EmiState
        await tx.emiState.update({
            where: { loanId },
            data: {
                currentEmi: newCurrentEmi,
                carryForward: newCarryForward
            }
        });

        // 3. Create Audit Log
        await tx.auditLog.create({
            data: {
                loanId,
                oldEmi: oldEmi,
                newEmi: newCurrentEmi,
                changeReason: `Payment of ${amount} (${type}) processed.`
            }
        });

        return updatedLoan;
    });
}

/**
 * Validation Logic
 * 1. Check if existing loans are >= 75% recovered (<= 25% remaining)
 * 2. Check if total remaining principal + new loan <= 300,000
 */
export async function checkLoanEligibility(userId: string, newLoanAmount: number) {
    const userLoans = await prisma.loan.findMany({
        where: {
            userId,
            status: { in: [LoanStatus.ACTIVE, LoanStatus.APPROVED] }
        }
    });

    const user = await prisma.user.findUnique({
        where: { id: userId }
    });

    if (!user) throw new Error("User not found");

    // 1. 75% Total Repayment Rule for Multiple Loans
    let totalIssued = 0;
    let totalRemaining = 0;

    for (const loan of userLoans) {
        totalIssued += loan.issuedAmount;
        totalRemaining += loan.remainingPrincipal;
    }

    if (totalIssued > 0) {
        const totalRepaidRatio = (totalIssued - totalRemaining) / totalIssued;
        if (totalRepaidRatio < 0.75) {
            return {
                eligible: false,
                reason: `You have only repaid ${Math.round(totalRepaidRatio * 100)}% of your total loan debt. You must repay at least 75% to apply for a new loan.`
            };
        }
    }

    // 2. Financial Cap Calculation
    // Rule: (50% of Salary) - (Current Remaining Debt)
    // AND GLOBAL CAP: 300,000 - (Current Remaining Debt)

    const salaryCap = user.baseSalary * 0.5;
    const globalCap = 300000;

    const remainingSalaryCap = Math.max(0, salaryCap - totalRemaining);
    const remainingGlobalCap = Math.max(0, globalCap - totalRemaining);

    // The strict limit for the NEW loan is the lower of these two remaining capacities
    const maxAllowedNewLoan = Math.min(remainingSalaryCap, remainingGlobalCap);

    if (newLoanAmount > maxAllowedNewLoan) {
        return {
            eligible: false,
            reason: `Loan amount exceeds your eligible limit. Based on your current debt of ৳${totalRemaining}, you can borrow up to ৳${maxAllowedNewLoan.toLocaleString("en-BD")}.`
        };
    }

    return { eligible: true, maxAmount: maxAllowedNewLoan };
}

/**
 * Grace Period & EMI State Sync
 * Called when a loan is first issued or a new month starts.
 * Sets currentEmi to 0 if within grace period.
 */
export async function refreshEmiState(loanId: string) {
    const loan = await prisma.loan.findUnique({
        where: { id: loanId },
        include: { emiState: true }
    });

    if (!loan) return;

    const monthsPassed = Math.floor((Date.now() - loan.createdAt.getTime()) / (30 * 24 * 60 * 60 * 1000));

    let newEmi = 0;
    if (monthsPassed >= loan.gracePeriodMonths) {
        const remainingMonths = loan.totalMonths - monthsPassed;
        newEmi = calculateEMI(loan.remainingPrincipal, remainingMonths);
    }

    await prisma.emiState.update({
        where: { loanId },
        data: { currentEmi: newEmi }
    });
}
