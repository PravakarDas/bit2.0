"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { calculateEMI } from "@/lib/services/loan.service";

export async function getPayrollAggregation(month: number, year: number) {
    const payrollMonth = `${year}-${month.toString().padStart(2, '0')}`;

    const users = await prisma.user.findMany({
        where: {
            status: "APPROVED",
            role: { not: "SUPERADMIN" },
            salaryPayments: {
                none: {
                    month: payrollMonth
                }
            }
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
        // Fetch ALL Approved but Unpaid Claims for this user
        const approvedClaims = user.medicalClaims; // Already filtered by status: "APPROVED" in include
        const totalMedical = approvedClaims.reduce(
            (sum, claim) => sum + claim.amount,
            0
        );

        // Eligible Bonuses for this user
        const eligibleBonuses = allActiveBonuses.filter(
            (b) =>
                b.branches.length === 0 ||
                b.branches.some((br) => br.id === user.branchId)
        );

        // Allowances
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
            eligibleBonuses: eligibleBonuses.map(b => ({
                id: b.id,
                name: b.name,
                type: b.type,
                value: b.value,
                amount: b.type === "FIXED" ? b.value : (user.baseSalary * b.value) / 100
            })),
            totalAllowances,
            totalMedical,
            activeLoans,
            totalLoanDeduction,
            netPay:
                user.baseSalary +
                totalAllowances +
                totalMedical -
                totalLoanDeduction, // Bonuses added manually on client
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

export async function processPayroll(payrollMonth: string, selectedBonuses: Record<string, string[]>) {
    // 1. Immutability Check: Prevent duplicate runs for the same month
    const existingPayment = await prisma.salaryPayment.findFirst({
        where: { month: payrollMonth },
    });

    if (existingPayment) {
        throw new Error(`Payroll for ${payrollMonth} has already been processed.`);
    }

    const [yearStr, monthStr] = payrollMonth.split('-');
    const data = await getPayrollAggregation(parseInt(monthStr), parseInt(yearStr));

    try {
        const result = await prisma.$transaction(async (tx) => {
            for (const emp of data) {
                const userBonusIds = selectedBonuses[emp.userId] || [];
                const appliedBonuses = emp.eligibleBonuses.filter(b => userBonusIds.includes(b.id));
                const totalBonuses = appliedBonuses.reduce((sum, b) => sum + b.amount, 0);

                const finalNetPay = emp.netPay + totalBonuses;

                // 2. Create SalaryPayment Record
                await tx.salaryPayment.create({
                    data: {
                        userId: emp.userId,
                        month: payrollMonth,
                        baseSalary: emp.baseSalary,
                        totalBonuses: totalBonuses,
                        totalAllowances: emp.totalAllowances,
                        medicalReimbursement: emp.totalMedical,
                        loanDeduction: emp.totalLoanDeduction,
                        netAmount: finalNetPay,
                    },
                });

                // Audit Bonuses
                for (const bonus of appliedBonuses) {
                    await tx.auditLog.create({
                        data: {
                            changeReason: `Bonus Applied: ${bonus.name} (Amount: ${bonus.amount}) for user ${emp.userId} in Payroll ${payrollMonth}`,
                            oldEmi: null,
                            newEmi: null,
                        }
                    });
                }

                // 3. Wallet Update: Credit Net Pay to User & Create Transaction
                await tx.user.update({
                    where: { id: emp.userId },
                    data: {
                        walletBalance: { increment: finalNetPay },
                    },
                });

                await tx.walletTransaction.create({
                    data: {
                        userId: emp.userId,
                        amount: finalNetPay,
                        type: "SALARY_CREDIT",
                        description: `Monthly Salary Credit - ${payrollMonth}`,
                    },
                });

                // 4. Medical Reset: Mark ALL currently processed APPROVED claims as 'PAID'
                await tx.medicalClaim.updateMany({
                    where: {
                        userId: emp.userId,
                        status: "APPROVED"
                    },
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
