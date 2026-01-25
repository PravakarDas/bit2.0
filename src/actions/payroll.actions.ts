"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { calculateEMI } from "@/lib/services/loan.service";

export async function getPayrollAggregation() {
    const users = await prisma.user.findMany({
        where: {
            status: "APPROVED",
            role: { not: "SUPERADMIN" },
        },
        include: {
            loans: {
                where: { status: "ACTIVE" },
                include: { emiState: true },
            },
            medicalClaims: {
                where: { status: "APPROVED" },
            },
        },
    });

    const allActiveBonuses = await prisma.bonusType.findMany({
        where: { isActive: true },
        include: { branches: true },
    });

    const allActiveAllowances = await prisma.allowanceType.findMany({
        where: { isActive: true },
        include: { branches: true },
    });

    const settings = await prisma.systemSettings.findUnique({
        where: { id: "global" },
    });

    return users.map((user) => {
        const totalMedical = user.medicalClaims.reduce(
            (sum, claim) => sum + claim.amount,
            0
        );

        // Filter Bonuses by Branch
        let totalBonuses = 0;
        const userBonuses = allActiveBonuses.filter(
            (b) =>
                b.branches.length === 0 ||
                b.branches.some((br) => br.id === user.branchId)
        );
        userBonuses.forEach((bonus) => {
            if (bonus.type === "FIXED") {
                totalBonuses += bonus.value;
            } else {
                totalBonuses += (user.baseSalary * bonus.value) / 100;
            }
        });

        // Filter Allowances by Branch
        let totalAllowances =
            (settings?.foodAllowance || 0) + (settings?.mobileAllowance || 0);
        const userAllowances = allActiveAllowances.filter(
            (a) =>
                a.branches.length === 0 ||
                a.branches.some((br) => br.id === user.branchId)
        );
        userAllowances.forEach((allowance) => {
            if (allowance.type === "FIXED") {
                totalAllowances += allowance.amount;
            } else {
                totalAllowances += (user.baseSalary * allowance.amount) / 100;
            }
        });

        const activeLoans = user.loans.map((loan) => ({
            id: loan.id,
            currentEmi: loan.emiState?.currentEmi || 0,
            carryForward: loan.emiState?.carryForward || 0,
            remainingPrincipal: loan.remainingPrincipal,
            totalMonths: loan.totalMonths,
            createdAt: loan.createdAt,
        }));

        const totalLoanDeduction = activeLoans.reduce(
            (sum, l) => sum + l.currentEmi + l.carryForward,
            0
        );

        return {
            userId: user.id,
            email: user.email,
            baseSalary: user.baseSalary,
            totalBonuses,
            totalAllowances,
            totalMedical,
            activeLoans,
            totalLoanDeduction,
            netPay:
                user.baseSalary +
                totalBonuses +
                totalAllowances +
                totalMedical -
                totalLoanDeduction,
        };
    });
}

export async function toggleEmiCarryForward(
    loanId: string,
    shouldCarryForward: boolean
) {
    return await prisma.$transaction(async (tx) => {
        const emiState = await tx.emiState.findUnique({
            where: { loanId },
        });

        if (!emiState) throw new Error("EMI State not found");

        if (shouldCarryForward) {
            await tx.emiState.update({
                where: { loanId },
                data: {
                    carryForward: emiState.carryForward + emiState.currentEmi,
                    currentEmi: 0,
                },
            });

            await tx.auditLog.create({
                data: {
                    loanId,
                    oldEmi: emiState.currentEmi,
                    newEmi: 0,
                    changeReason: "EMI Carried Forward to next month.",
                },
            });
        } else {
            const loan = await tx.loan.findUnique({ where: { id: loanId } });
            if (!loan) throw new Error("Loan not found");

            const monthsPassed = Math.floor(
                (Date.now() - loan.createdAt.getTime()) / (30 * 24 * 60 * 60 * 1000)
            );
            const remainingMonths = loan.totalMonths - monthsPassed;
            const originalEmi = calculateEMI(
                loan.remainingPrincipal,
                remainingMonths
            );

            await tx.emiState.update({
                where: { loanId },
                data: {
                    currentEmi: originalEmi,
                    carryForward: Math.max(0, emiState.carryForward - originalEmi),
                },
            });
        }
    });

    revalidatePath("/admin/payroll");
}

export async function processPayroll(payrollMonth: string) {
    // 1. Immutability Check: Prevent duplicate runs for the same month
    const existingPayment = await prisma.salaryPayment.findFirst({
        where: { month: payrollMonth },
    });

    if (existingPayment) {
        throw new Error(`Payroll for ${payrollMonth} has already been processed.`);
    }

    const data = await getPayrollAggregation();

    try {
        const result = await prisma.$transaction(async (tx) => {
            for (const emp of data) {
                // 2. Create SalaryPayment Record
                await tx.salaryPayment.create({
                    data: {
                        userId: emp.userId,
                        month: payrollMonth,
                        baseSalary: emp.baseSalary,
                        totalBonuses: emp.totalBonuses,
                        totalAllowances: emp.totalAllowances,
                        medicalReimbursement: emp.totalMedical,
                        loanDeduction: emp.totalLoanDeduction,
                        netAmount: emp.netPay,
                    },
                });

                // 3. Wallet Update: Credit Net Pay to User & Create Transaction
                await tx.user.update({
                    where: { id: emp.userId },
                    data: {
                        walletBalance: { increment: emp.netPay },
                    },
                });

                await tx.walletTransaction.create({
                    data: {
                        userId: emp.userId,
                        amount: emp.netPay,
                        type: "SALARY_CREDIT",
                        description: `Monthly Salary Credit - ${payrollMonth}`,
                    },
                });

                // 4. Medical Reset: Mark approved claims as 'PAID'
                await tx.medicalClaim.updateMany({
                    where: { userId: emp.userId, status: "APPROVED" },
                    data: { status: "PAID" },
                });

                // 5. Loan & Payment Updates
                for (const loan of emp.activeLoans) {
                    const totalDeducted = loan.currentEmi + loan.carryForward;
                    if (totalDeducted > 0) {
                        // Update Remaining Principal
                        await tx.loan.update({
                            where: { id: loan.id },
                            data: {
                                remainingPrincipal: { decrement: totalDeducted },
                            },
                        });

                        // Record Loan Payment
                        await tx.payment.create({
                            data: {
                                loanId: loan.id,
                                amount: totalDeducted,
                                type: "EMI",
                                payrollMonth,
                            },
                        });

                        // Recalculate next month's EMI and Reset Carry Forward
                        const updatedLoan = await tx.loan.findUnique({
                            where: { id: loan.id },
                        });
                        if (updatedLoan) {
                            const monthsPassed =
                                Math.floor(
                                    (Date.now() - updatedLoan.createdAt.getTime()) /
                                    (30 * 24 * 60 * 60 * 1000)
                                ) + 1;
                            const remainingMonths = updatedLoan.totalMonths - monthsPassed;
                            const nextEmi =
                                updatedLoan.remainingPrincipal > 0
                                    ? calculateEMI(updatedLoan.remainingPrincipal, remainingMonths)
                                    : 0;

                            // Check if loan should be CLOSED
                            if (updatedLoan.remainingPrincipal <= 0) {
                                await tx.loan.update({
                                    where: { id: loan.id },
                                    data: { status: "CLOSED" }
                                });
                            }

                            await tx.emiState.update({
                                where: { loanId: loan.id },
                                data: {
                                    currentEmi: nextEmi,
                                    carryForward: 0,
                                },
                            });
                        }
                    }
                }
            }

            // 6. Audit Log: Log the entire execution for compliance
            await tx.systemAudit.create({
                data: {
                    action: "PAYROLL_EXECUTION",
                    status: "SUCCESS",
                    details: `Processed payroll for ${payrollMonth}. Total employees: ${data.length}`,
                },
            });

            return { success: true };
        });

        revalidatePath("/admin/payroll");
        revalidatePath("/profile");
        return result;
    } catch (error: any) {
        console.error("Payroll processing failed:", error);

        // Log failure in Audit Log if possible (outside transaction or separate)
        await prisma.systemAudit.create({
            data: {
                action: "PAYROLL_EXECUTION",
                status: "FAILED",
                details: error.message || "Unknown error during payroll execution",
            }
        });

        throw new Error(error.message || "Payroll processing failed");
    }
}
