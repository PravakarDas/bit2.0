"use server";

import { prisma } from "@/lib/prisma";
import { LoanStatus, TransactionType, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { calculateEMI, checkLoanEligibility, processLoanPayment } from "@/lib/services/loan.service";
import { getDbUser } from "./user.actions";

/**
 * Fetch all loans for admin review (Pending & Active).
 * Enhanced to include comprehensive employee financial context.
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
            user: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    phoneNumber: true,
                    baseSalary: true,
                    walletBalance: true,
                    dateOfJoining: true,
                    department: {
                        select: {
                            name: true
                        }
                    },
                    designation: {
                        select: {
                            name: true
                        }
                    },
                    branch: {
                        select: {
                            name: true
                        }
                    }
                }
            },
            emiState: true
        }
    });
}

/**
 * Get detailed loan information for admin approval with financial context
 */
export async function getLoanDetailsForApproval(loanId: string) {
    const user = await getDbUser();
    
    if (!user || (user.role !== "SUPERADMIN" && user.role !== "HR")) {
        throw new Error("Unauthorized");
    }
    
    const loan = await prisma.loan.findUnique({
        where: { id: loanId },
        include: {
            user: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    phoneNumber: true,
                    baseSalary: true,
                    walletBalance: true,
                    dateOfJoining: true,
                    department: {
                        select: {
                            name: true
                        }
                    },
                    designation: {
                        select: {
                            name: true
                        }
                    },
                    branch: {
                        select: {
                            name: true
                        }
                    }
                }
            }
        }
    });
    
    if (!loan) {
        throw new Error("Loan not found");
    }
    
    // Get existing loans for debt calculation
    const existingLoans = await prisma.loan.findMany({
        where: {
            userId: loan.userId,
            id: { not: loanId }, // Exclude current loan
            status: { in: ["ACTIVE", "APPROVED"] }
        },
        include: {
            emiState: true
        }
    });
    
    // Get recent payment history
    const recentPayments = await prisma.payment.findMany({
        where: {
            loan: {
                userId: loan.userId
            }
        },
        orderBy: {
            createdAt: 'desc'
        },
        take: 5,
        include: {
            loan: {
                select: {
                    id: true,
                    issuedAmount: true
                }
            }
        }
    });
    
    // Calculate financial metrics
    const totalExistingDebt = existingLoans.reduce((sum, loan) => sum + loan.remainingPrincipal, 0);
    const totalIssuedAmount = existingLoans.reduce((sum, loan) => sum + loan.issuedAmount, 0);
    const totalRepaidAmount = totalIssuedAmount - totalExistingDebt;
    const repaymentRatio = totalIssuedAmount > 0 ? (totalRepaidAmount / totalIssuedAmount) : 1;
    
    // Calculate exact loan limits using same employee-side logic
    const financialMetrics = {
        totalExistingDebt,
        totalIssuedAmount,
        totalRepaidAmount,
        repaymentRatio,
        salaryCap: loan.user.baseSalary * 12 * 0.5,  // 50% of yearly salary (employee-side logic)
        globalCap: 300000,                           // Hard limit (employee-side logic)
        remainingSalaryCap: Math.max(0, (loan.user.baseSalary * 12 * 0.5) - totalExistingDebt),
        remainingGlobalCap: Math.max(0, 300000 - totalExistingDebt),
        maxAllowedLoan: Math.min(
            Math.max(0, (loan.user.baseSalary * 12 * 0.5) - totalExistingDebt),
            Math.max(0, 300000 - totalExistingDebt)
        ),
        meetsRepaymentRequirement: repaymentRatio >= 0.75
    };
    
    return {
        loan,
        financialMetrics,
        existingLoans,
        recentPayments
    };
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
        adminComments?: string;
    }
) {
    const user = await getDbUser();

    if (!user || (user.role !== "SUPERADMIN" && user.role !== "HR")) {
        throw new Error("Unauthorized");
    }

    // 1. Validation Logic
    const loan = await prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) throw new Error("Loan not found");
    // Allow approval for manager-verified loans or pending loans
    if (loan.status !== LoanStatus.PENDING && loan.status !== LoanStatus.MANAGER_VERIFIED) {
        throw new Error("Only pending or manager-verified loans can be approved");
    }

    // Skip eligibility check for manager-verified loans (manager already verified)
    if (loan.status === LoanStatus.PENDING) {
        const eligibility = await checkLoanEligibility(loan.userId, data.issuedAmount);
        if (!eligibility.eligible) {
            throw new Error(eligibility.reason);
        }
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
                approvedBy: user.id,
                adminComments: data.adminComments
            }
        });

        // 3. Create the initial EmiState record
        const emiMonths = data.totalMonths - data.gracePeriodMonths;
        const initialEmi = data.gracePeriodMonths > 0 ? 0 : calculateEMI(data.issuedAmount, emiMonths);

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

        // 6. Notify manager if this was a manager-verified loan
        if (loan.managerVerifiedById) {
            const manager = await tx.user.findUnique({
                where: { id: loan.managerVerifiedById },
                select: { id: true }
            });

            if (manager) {
                const employee = await tx.user.findUnique({
                    where: { id: loan.userId },
                    select: { firstName: true, lastName: true }
                });

                await tx.employeeNotification.create({
                    data: {
                        userId: loan.managerVerifiedById,
                        type: "LOAN_APPLICATION_APPROVED",
                        title: "Loan Approved by Admin",
                        message: `The loan request you verified for ${employee?.firstName} ${employee?.lastName} (৳${data.issuedAmount.toLocaleString()}) has been approved by Admin ${user.firstName} ${user.lastName}.`,
                        relatedEntityId: loan.id,
                    }
                });
            }
        }

        revalidatePath("/admin/loans");
        return updatedLoan;
    });
}

/**
 * EMI Management Functions for Admin
 */

// Toggle EMI collection for a specific loan
export async function toggleEmiCollection(loanId: string, enabled: boolean, reason?: string) {
    const user = await getDbUser();
    
    if (!user || (user.role !== "SUPERADMIN" && user.role !== "HR")) {
        throw new Error("Unauthorized");
    }
    
    return await prisma.$transaction(async (tx) => {
        const loan = await tx.loan.findUnique({
            where: { id: loanId },
            include: { emiState: true }
        });
        
        if (!loan || !loan.emiState) {
            throw new Error("Loan or EMI state not found");
        }
        
        // Create audit log
        await tx.auditLog.create({
            data: {
                loanId,
                oldEmi: loan.emiState.currentEmi,
                newEmi: enabled ? loan.emiState.currentEmi : 0,
                changeReason: `EMI collection ${enabled ? 'enabled' : 'disabled'} by admin ${user.id}${reason ? '. Reason: ' + reason : ''}`
            }
        });
        
        // Update EMI state
        if (!enabled) {
            // When disabling EMI, set currentEmi to 0 and add to carryForward
            await tx.emiState.update({
                where: { loanId },
                data: {
                    carryForward: loan.emiState.carryForward + loan.emiState.currentEmi,
                    currentEmi: 0
                }
            });
        } else {
            // When enabling EMI, recalculate and redistribute across remaining months
            const newEmi = await recalculateEMI(loanId, tx);
            
            // Log the EMI change
            await tx.auditLog.create({
                data: {
                    loanId,
                    oldEmi: 0,
                    newEmi: newEmi,
                    changeReason: `EMI enabled with redistribution by admin ${user.id}${reason ? '. Reason: ' + reason : ''}`
                }
            });
        }
        
        revalidatePath("/admin/loans");
        return { success: true };
    });
}

// Skip EMI for specific month
export async function skipEmiForMonth(loanId: string, month: string, reason: string) {
    const user = await getDbUser();
    
    if (!user || (user.role !== "SUPERADMIN" && user.role !== "HR")) {
        throw new Error("Unauthorized");
    }
    
    return await prisma.$transaction(async (tx) => {
        const loan = await tx.loan.findUnique({
            where: { id: loanId },
            include: { emiState: true }
        });
        
        if (!loan || !loan.emiState) {
            throw new Error("Loan not found");
        }
        
        // Check if EMI already processed for this month
        const existingPayment = await tx.payment.findFirst({
            where: {
                loanId,
                payrollMonth: month,
                type: 'EMI'
            }
        });
        
        if (existingPayment) {
            throw new Error("EMI already processed for this month");
        }
        
        // Create a skip record (payment with 0 amount)
        await tx.payment.create({
            data: {
                loanId,
                amount: 0,
                type: 'EMI',
                payrollMonth: month,
            }
        });
        
        // Add carry forward for skipped EMI and recalculate
        await tx.emiState.update({
            where: { loanId },
            data: {
                carryForward: loan.emiState.carryForward + loan.emiState.currentEmi
            }
        });
        
        // Recalculate and redistribute EMI across remaining months
        const newEmi = await recalculateEMI(loanId, tx);
        
        // Create audit log
        await tx.auditLog.create({
            data: {
                loanId,
                oldEmi: loan.emiState.currentEmi,
                newEmi: newEmi,
                changeReason: `EMI skipped for ${month} and redistributed by admin ${user.id}. Reason: ${reason}`
            }
        });
        
        revalidatePath("/admin/loans");
        return { success: true };
    });
}

// Manual payment recording
export async function recordManualPayment(loanId: string, amount: number, reason: string) {
    const user = await getDbUser();
    
    if (!user || (user.role !== "SUPERADMIN" && user.role !== "HR")) {
        throw new Error("Unauthorized");
    }
    
    if (amount <= 0) {
        throw new Error("Payment amount must be positive");
    }
    
    // Use existing loan service for payment processing
    const result = await processLoanPayment(loanId, amount, 'MANUAL');
    
    // Create audit log for manual payment
    await prisma.auditLog.create({
        data: {
            loanId,
            oldEmi: 0, // Not EMI related
            newEmi: 0,
            changeReason: `Manual payment of ৳${amount} recorded by admin ${user.id}. Reason: ${reason}`
        }
    });
    
    revalidatePath("/admin/loans");
    return result;
}

// Get loan activity history for admin review
export async function getLoanActivityHistory(loanId: string) {
    const user = await getDbUser();
    
    if (!user || (user.role !== "SUPERADMIN" && user.role !== "HR")) {
        throw new Error("Unauthorized");
    }
    
    const [loan, payments, auditLogs] = await Promise.all([
        prisma.loan.findUnique({
            where: { id: loanId },
            include: {
                user: {
                    select: {
                        firstName: true,
                        lastName: true,
                        email: true
                    }
                },
                emiState: true
            }
        }),
        prisma.payment.findMany({
            where: { loanId },
            orderBy: { createdAt: 'desc' }
        }),
        prisma.auditLog.findMany({
            where: { loanId },
            orderBy: { createdAt: 'desc' }
        })
    ]);
    
    return {
        loan,
        payments,
        auditLogs
    };
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
    } catch (error) {
        console.error("Loan application failed:", error);
        const message = error instanceof Error ? error.message : "Failed to submit application";
        return { success: false, error: message };
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
        include: {
            emiState: true,
            managerVerifiedBy: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                }
            }
        },
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
            // Check if EMI already processed for this month
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

            // Parse the month string to check grace period
            const [year, month] = monthStr.split('-').map(Number);
            
            // Check if we're still in grace period
            if (loan.emiStartMonth && loan.emiStartYear) {
                const emiStartYear = loan.emiStartYear;
                const emiStartMonth = loan.emiStartMonth;
                
                // Check if current processing month is before EMI start
                if (year < emiStartYear || (year === emiStartYear && month < emiStartMonth)) {
                    results.skipped++;
                    continue; // Still in grace period
                }
                
                // If grace period just ended and EMI is still 0, activate it
                if (year === emiStartYear && month === emiStartMonth && (loan.emiState?.currentEmi || 0) === 0) {
                    await prisma.$transaction(async (tx) => {
                        const emiMonths = loan.totalMonths - loan.gracePeriodMonths;
                        const newEmi = calculateEMI(loan.remainingPrincipal, emiMonths);
                        
                        await tx.emiState.update({
                            where: { loanId: loan.id },
                            data: { currentEmi: newEmi }
                        });
                        
                        await tx.auditLog.create({
                            data: {
                                loanId: loan.id,
                                oldEmi: 0,
                                newEmi: newEmi,
                                changeReason: `Grace period ended. EMI activated for ${emiMonths} months.`
                            }
                        });
                    });
                    
                    // Refresh loan data after EMI activation
                    const updatedLoan = await prisma.loan.findUnique({
                        where: { id: loan.id },
                        include: { user: true, emiState: true }
                    });
                    if (updatedLoan) {
                        loan.emiState = updatedLoan.emiState;
                    }
                }
            }

            const emiAmount = loan.emiState?.currentEmi || 0;
            if (emiAmount <= 0) {
                results.skipped++;
                continue; // EMI is turned off or zero
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
                        type: TransactionType.LOAN_DEDUCTION,
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

        } catch (error) {
            results.failed++;
            const message = error instanceof Error ? error.message : "Unknown error";
            results.errors.push(`Loan for ${loan.user.email}: ${message}`);
        }
    }

    revalidatePath("/admin/loans");
    revalidatePath("/admin/wallet");
    return results;
}

/**
 * Helper function to recalculate and redistribute EMI across remaining months
 */
async function recalculateEMI(loanId: string, tx: Prisma.TransactionClient) {
    const loan = await tx.loan.findUnique({
        where: { id: loanId },
        include: { emiState: true }
    });

    if (!loan || !loan.emiState) {
        throw new Error("Loan or EMI state not found");
    }

    // Calculate how many months have passed since EMI start
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    
    const emiStartYear = loan.emiStartYear || currentYear;
    const emiStartMonth = loan.emiStartMonth || currentMonth;
    
    // Calculate remaining months using proper month arithmetic
    const totalEmiMonths = loan.totalMonths - loan.gracePeriodMonths;
    const monthsSinceEmiStart = Math.max(0, (currentYear - emiStartYear) * 12 + (currentMonth - emiStartMonth));
    const remainingMonths = Math.max(1, totalEmiMonths - monthsSinceEmiStart);
    
    // Calculate new EMI including any carry forward
    const totalRemainingAmount = loan.remainingPrincipal + loan.emiState.carryForward;
    const newEmiAmount = Math.round(totalRemainingAmount / remainingMonths);
    
    // Update EMI state
    await tx.emiState.update({
        where: { loanId },
        data: {
            currentEmi: newEmiAmount,
            carryForward: 0 // Reset carry forward as it's now distributed
        }
    });
    
    return newEmiAmount;
}

/**
 * Decline a loan request.
 * Updates loan status to DECLINED and adds decline reason.
 */
export async function declineLoan(
    loanId: string,
    declineReason: string
) {
    const user = await getDbUser();

    if (!user || (user.role !== "SUPERADMIN" && user.role !== "HR")) {
        throw new Error("Unauthorized");
    }

    if (!declineReason || declineReason.trim() === "") {
        throw new Error("Decline reason is required");
    }

    // 1. Validation Logic
    const loan = await prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) throw new Error("Loan not found");
    
    // Allow decline for pending or manager-verified loans
    if (loan.status !== LoanStatus.PENDING && loan.status !== LoanStatus.MANAGER_VERIFIED) {
        throw new Error("Only pending or manager-verified loans can be declined");
    }

    return await prisma.$transaction(async (tx) => {
        const updatedLoan = await tx.loan.update({
            where: { id: loanId },
            data: {
                status: LoanStatus.DECLINED,
                adminDeclinedReason: declineReason,
                adminDeclinedAt: new Date()
            }
        });

        const employee = await tx.user.findUnique({
            where: { id: loan.userId },
            select: { firstName: true, lastName: true }
        });

        await tx.employeeNotification.create({
            data: {
                userId: loan.userId,
                type: "LOAN_APPLICATION_DECLINED",
                title: "Loan Request Declined",
                message: `Your loan request for ৳${loan.issuedAmount.toLocaleString("en-BD")} has been declined. Reason: ${declineReason}`,
                relatedEntityId: loan.id,
            }
        });

        if (loan.managerVerifiedById) {
            await tx.employeeNotification.create({
                data: {
                    userId: loan.managerVerifiedById,
                    type: "LOAN_APPLICATION_DECLINED",
                    title: "Verified Loan Declined by Admin",
                    message: `The loan request you verified for ${employee?.firstName} ${employee?.lastName} (৳${loan.issuedAmount.toLocaleString("en-BD")}) has been declined by Admin ${user.firstName ?? ""} ${user.lastName ?? ""}. Reason: ${declineReason}`.trim(),
                    relatedEntityId: loan.id,
                }
            });
        }

        revalidatePath("/admin/loans");
        return updatedLoan;
    });
}
