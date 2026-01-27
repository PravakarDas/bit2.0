"use server";

import { prisma } from "@/lib/prisma";
import { LoanStatus, Role, TransactionType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { calculateEMI, checkLoanEligibility } from "@/lib/services/loan.service";
import { getDbUser } from "./user.actions";

/**
 * Fetch all loans for admin review (Pending & Active).
 * Renamed to getAllLoans to reflect capability, though initially used for pending.
 */
export async function getAllLoans() {
    const user = await getDbUser();

    // Security Check: Only Admin/HR can see this
    if (!user || (user.role !== "SUPERADMIN" && user.role !== "HR")) {
        throw new Error("Unauthorized access to loan management");
    }

    return await prisma.loan.findMany({
        orderBy: {
            createdAt: 'desc'
        },
        include: {
            user: true,
            emiState: true
        }
    });
}

/**
 * Approve a loan request.
 * Sets values, creates EmiState, and logs to AuditLog.
 */
export async function approveLoan(
    loanId: string,
    data: {
        issuedAmount: number;
        gracePeriodMonths: number;
        totalMonths: number;
    }
) {
    const user = await getDbUser();

    if (!user || (user.role !== "SUPERADMIN" && user.role !== "HR")) {
        throw new Error("Unauthorized");
    }

    // 1. Validation Logic
    const loan = await prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) throw new Error("Loan not found");

    const eligibility = await checkLoanEligibility(loan.userId, data.issuedAmount);
    if (!eligibility.eligible) {
        throw new Error(eligibility.reason);
    }

    return await prisma.$transaction(async (tx) => {
        // Calculate Schedule
        const now = new Date();
        const startMonthDate = new Date(now.getFullYear(), now.getMonth() + data.gracePeriodMonths + 1, 1);

        // 2. Update the Loan record
        const updatedLoan = await tx.loan.update({
            where: { id: loanId },
            data: {
                issuedAmount: data.issuedAmount,
                remainingPrincipal: data.issuedAmount,
                gracePeriodMonths: data.gracePeriodMonths,
                totalMonths: data.totalMonths,
                status: LoanStatus.ACTIVE,
                emiStartMonth: startMonthDate.getMonth() + 1,
                emiStartYear: startMonthDate.getFullYear(),
                approvedBy: user.id
            }
        });

        // 3. Create the initial EmiState record
        const initialEmi = data.gracePeriodMonths > 0 ? 0 : calculateEMI(data.issuedAmount, data.totalMonths);

        await tx.emiState.create({
            data: {
                loanId: updatedLoan.id,
                currentEmi: initialEmi,
                carryForward: 0
            }
        });

        // 4. Log the initial EMI in AuditLog
        await tx.auditLog.create({
            data: {
                loanId: updatedLoan.id,
                oldEmi: 0,
                newEmi: initialEmi,
                changeReason: `Loan approved by ${user.id}. EMI starts ${startMonthDate.toLocaleDateString()}.`
            }
        });

        // 5. Credit Wallet
        await tx.user.update({
            where: { id: loan.userId },
            data: {
                walletBalance: { increment: data.issuedAmount }
            }
        });

        await tx.walletTransaction.create({
            data: {
                userId: loan.userId,
                amount: data.issuedAmount,
                type: "ADJUSTMENT",
                description: `Loan Disbursement - Loan #${loan.id.slice(-6)}`
            }
        });

        revalidatePath("/admin/loans");
        return updatedLoan;
    });
}

/**
 * Submit a new loan application.
 */
export async function applyForLoan(data: {
    amount: number;
    duration: number;
    gracePeriod: number;
    reason?: string;
}) {
    const user = await getDbUser();
    if (!user) throw new Error("Unauthorized");

    // 1. Validation Logic - Initial Pre-check
    // The deeper check happens in checkLoanEligibility which considers existing debt.
    const eligibility = await checkLoanEligibility(user.id, data.amount);

    if (!eligibility.eligible) {
        throw new Error(eligibility.reason || "Loan application rejected based on eligibility criteria.");
    }

    // Check with loan service for other limits


    try {
        const loan = await prisma.loan.create({
            data: {
                userId: user.id,
                issuedAmount: data.amount,
                remainingPrincipal: data.amount,
                totalMonths: data.duration,
                gracePeriodMonths: data.gracePeriod,
                reason: data.reason || "Personal",
                status: LoanStatus.PENDING
            }
        });

        revalidatePath("/loans");
        return { success: true, loan };
    } catch (error: any) {
        console.error("Loan application failed:", error);
        return { success: false, error: error.message || "Failed to submit application" };
    }
}

/**
 * Fetch current user's loans.
 */
export async function getMyLoans() {
    const user = await getDbUser();
    if (!user) throw new Error("Unauthorized");

    return await prisma.loan.findMany({
        where: { userId: user.id },
        include: { emiState: true },
        orderBy: { createdAt: "desc" },
    });
}

export async function processMonthlyEMIs(monthStr: string) {
    const admin = await getDbUser();
    if (!admin || (admin.role !== "SUPERADMIN" && admin.role !== "HR")) {
        throw new Error("Unauthorized");
    }

    const activeLoans = await prisma.loan.findMany({
        where: { status: "ACTIVE" },
        include: { user: true, emiState: true }
    });

    const results = { processed: 0, skipped: 0, failed: 0, errors: [] as string[] };

    for (const loan of activeLoans) {
        try {
            const existingPayment = await prisma.payment.findFirst({
                where: {
                    loanId: loan.id,
                    payrollMonth: monthStr,
                    type: "EMI"
                }
            });

            if (existingPayment) {
                results.skipped++;
                continue;
            }

            const emiAmount = loan.emiState?.currentEmi || 0;
            if (emiAmount <= 0) {
                results.skipped++;
                continue;
            }

            await prisma.$transaction(async (tx) => {
                await tx.user.update({
                    where: { id: loan.userId },
                    data: { walletBalance: { decrement: emiAmount } }
                });

                await tx.walletTransaction.create({
                    data: {
                        userId: loan.userId,
                        amount: -emiAmount,
                        type: "LOAN_DEDUCTION" as any,
                        description: `EMI Deduction - ${loan.reason} (${monthStr})`
                    }
                });

                await tx.payment.create({
                    data: {
                        amount: emiAmount,
                        type: "EMI",
                        payrollMonth: monthStr,
                        loanId: loan.id
                    }
                });

                await tx.loan.update({
                    where: { id: loan.id },
                    data: { remainingPrincipal: { decrement: emiAmount } }
                });
            });

            results.processed++;

        } catch (error: any) {
            results.failed++;
            results.errors.push(`Loan for ${loan.user.email}: ${error.message}`);
        }
    }

    revalidatePath("/admin/loans");
    revalidatePath("/admin/wallet");
    return results;
}
