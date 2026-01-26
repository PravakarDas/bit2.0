"use server";

import { prisma } from "@/lib/prisma";
import { LoanStatus, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { calculateEMI, checkLoanEligibility } from "@/lib/services/loan.service";
import { getDbUser } from "./user.actions";

/**
 * Fetch all loans with PENDING status for admin review.
 */
export async function getPendingLoans() {
    const user = await getDbUser();

    // Security Check: Only Admin/HR can see this
    if (!user || (user.role !== "SUPERADMIN" && user.role !== "HR")) {
        throw new Error("Unauthorized access to loan management");
    }

    return await prisma.loan.findMany({
        where: {
            status: { in: [LoanStatus.PENDING, LoanStatus.ACTIVE] }
        },
        include: {
            user: true
        },
        orderBy: {
            createdAt: 'desc'
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

    // 1. Validation Logic
    if (data.amount > user.baseSalary * 0.5) {
        throw new Error("Loan amount exceeds 50% of your monthly salary.");
    }

    if (data.amount > 300000) {
        throw new Error("Loan amount exceeds the maximum limit of 300,000 BDT.");
    }

    // Check with loan service for other limits
    const eligibility = await checkLoanEligibility(user.id, data.amount);
    if (!eligibility.eligible) {
        throw new Error(eligibility.reason);
    }

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
