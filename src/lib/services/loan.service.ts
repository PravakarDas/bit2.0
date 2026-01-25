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

    // Recovery Check
    for (const loan of userLoans) {
        const recoveryRatio = loan.remainingPrincipal / loan.issuedAmount;
        if (recoveryRatio > 0.25) {
            return {
                eligible: false,
                reason: `Loan ${loan.id} is only ${Math.round((1 - recoveryRatio) * 100)}% recovered. Minimum 75% required.`
            };
        }
    }

    // Principal Cap Check
    const totalRemaining = userLoans.reduce((sum, l) => sum + l.remainingPrincipal, 0);
    if (totalRemaining + newLoanAmount > 300000) {
        return {
            eligible: false,
            reason: `Total loan exposure (${totalRemaining + newLoanAmount}) exceeds the 300,000 limit.`
        };
    }

    return { eligible: true };
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
