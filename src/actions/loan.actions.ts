"use server";

import { prisma } from "@/lib/prisma";
import { LoanStatus, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { calculateEMI } from "@/lib/services/loan.service";
import { auth } from "@clerk/nextjs/server";

/**
 * Fetch all loans with PENDING status for admin review.
 */
export async function getPendingLoans() {
    const { sessionClaims } = await auth();
    const role = (sessionClaims?.metadata as any)?.role;

    // Security Check: Only Admin/HR can see this
    if (role !== "SUPERADMIN" && role !== "HR") {
        throw new Error("Unauthorized access to loan management");
    }

    return await prisma.loan.findMany({
        where: {
            status: LoanStatus.PENDING
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
    const { sessionClaims } = await auth();
    const role = (sessionClaims?.metadata as any)?.role;

    if (role !== "SUPERADMIN" && role !== "HR") {
        throw new Error("Unauthorized");
    }

    return await prisma.$transaction(async (tx) => {
        // 1. Update the Loan record
        const updatedLoan = await tx.loan.update({
            where: { id: loanId },
            data: {
                issuedAmount: data.issuedAmount,
                remainingPrincipal: data.issuedAmount,
                gracePeriodMonths: data.gracePeriodMonths,
                totalMonths: data.totalMonths,
                status: LoanStatus.ACTIVE // Set to ACTIVE on approval
            }
        });

        // 2. Create the initial EmiState record
        // During grace period, currentEmi is 0.
        const initialEmi = data.gracePeriodMonths > 0 ? 0 : calculateEMI(data.issuedAmount, data.totalMonths);

        await tx.emiState.create({
            data: {
                loanId: updatedLoan.id,
                currentEmi: initialEmi,
                carryForward: 0
            }
        });

        // 3. Log the initial EMI in AuditLog
        await tx.auditLog.create({
            data: {
                loanId: updatedLoan.id,
                oldEmi: 0,
                newEmi: initialEmi,
                changeReason: "Loan approved. Initial EMI state created."
            }
        });

        revalidatePath("/admin/loans");
        return updatedLoan;
    });
}
