"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { calculateEMI } from "@/lib/services/loan.service";
import { LoanStatus, ClaimStatus, UserStatus } from "@prisma/client";
import { shouldGeneratePayroll } from "@/lib/employee-status";
import { createAdminNotification } from "./notification.actions";
import { notificationEngineContainer } from "@/lib/services/notification-engine";
import { generatePayslipPdf } from "@/lib/services/payslip-pdf.service";
import { resolveGoogleDriveConfig } from "@/lib/services/google-drive.service";
import { GoogleDriveService } from "@/lib/services/google-drive-client";
import {
    dispatchPayslipsForPayrollRun,
    writePayslipTempFile,
    createPayslipDriveTarget,
    type PayslipDispatchInput,
    type PayslipDriveTarget,
} from "@/lib/services/payroll-payslip-dispatch.service";

export async function getAllProcessedPayrolls() {
    const payments = await prisma.salaryPayment.findMany({
        include: {
            user: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    bankAccountNumber: true,
                    branch: {
                        select: {
                            name: true,
                        },
                    },
                    department: {
                        select: {
                            name: true,
                        },
                    },
                    designation: {
                        select: {
                            name: true,
                        },
                    },
                },
            },
        },
        orderBy: [
            { month: 'desc' },
            { createdAt: 'desc' },
        ],
    });

    return payments;
}

interface EligibleBonus {
    id: string;
    name: string;
    type: "FIXED" | "PERCENTAGE";
    value: number;
    amount: number;
}

interface PayrollAggregation {
    userId: string;
    email: string;
    firstName?: string;
    lastName?: string;
    branchName?: string | null;
    bankAccountNumber?: string;
    baseSalary: number;
    walletBalance: number;
    eligibleBonuses: EligibleBonus[];
    totalAllowances: number;
    totalMedical: number;
    activeLoans: {
        id: string;
        currentEmi: number;
        carryForward: number;
        remainingPrincipal: number;
    }[];
    totalLoanDeduction: number;
    netPay: number;
}

export async function getPayrollAggregation(month: number, year: number) {
    const payrollMonth = `${year}-${month.toString().padStart(2, '0')}`;
    const currentDate = new Date(year, month - 1, 1); // First day of the payroll month

    const users = await prisma.user.findMany({
        where: {
            status: UserStatus.APPROVED,
            role: { not: "SUPERADMIN" },
            salaryPayments: {
                none: {
                    month: payrollMonth
                }
            },
            OR: [
                // Active employees
                { isArchived: false },
                // Archived employees still within payroll continuation period
                {
                    isArchived: true,
                    archivedAt: { not: null }
                }
            ]
        },
        include: {
            branch: {
                select: { name: true },
            },
            loans: {
                where: { status: LoanStatus.ACTIVE },
                select: {
                    id: true,
                    remainingPrincipal: true,
                    totalMonths: true,
                    gracePeriodMonths: true,
                    emiStartMonth: true,
                    emiStartYear: true,
                    createdAt: true,
                    emiState: {
                        select: {
                            currentEmi: true,
                            carryForward: true
                        }
                    }
                }
            },
            medicalClaims: {
                where: { status: ClaimStatus.APPROVED },
            },
        },
    });

    // Filter archived employees based on payroll continuation logic
    const eligibleUsers = users.filter((user) => {
        if (!user.isArchived) {
            return true; // Include all active employees
        }

        // For archived employees, check if they're within payroll continuation period
        return shouldGeneratePayroll(
            user.archivedAt,
            user.payrollContinuationMonths,
            currentDate
        );
    });

    const allActiveBonuses = await prisma.bonusType.findMany({
        where: { isActive: true },
        include: { branches: true },
    });

    const allActiveAllowances = await prisma.allowanceType.findMany({
        where: { isActive: true },
        include: {
            employeeAllowances: {
                where: { isActive: true },
                include: { user: true },
            },
        },
    });

    return eligibleUsers.map((user) => {
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

        // Allowances - New 3-tier system
        let totalAllowances = 0;
        
        // 1. FIXED scope allowances (apply to all employees)
        const fixedAllowances = allActiveAllowances.filter(a => a.scope === "FIXED");
        fixedAllowances.forEach((allowance) => {
            if (allowance.valueType === "FIXED") {
                totalAllowances += allowance.amount;
            } else {
                totalAllowances += (user.baseSalary * allowance.amount) / 100;
            }
        });
        
        // 2. FULL_BRANCH scope allowances (apply to employees in target branches)
        const branchAllowances = allActiveAllowances.filter(a => 
            a.scope === "FULL_BRANCH" && 
            user.branchId && 
            a.targetBranchIds.includes(user.branchId)
        );
        branchAllowances.forEach((allowance) => {
            if (allowance.valueType === "FIXED") {
                totalAllowances += allowance.amount;
            } else {
                totalAllowances += (user.baseSalary * allowance.amount) / 100;
            }
        });
        
        // 3. CUSTOM scope allowances (individual employee assignments)
        const customAllowances = allActiveAllowances.filter(a => 
            a.scope === "CUSTOM" && 
            a.employeeAllowances.some(ea => ea.userId === user.id && ea.isActive)
        );
        customAllowances.forEach((allowance) => {
            if (allowance.valueType === "FIXED") {
                totalAllowances += allowance.amount;
            } else {
                totalAllowances += (user.baseSalary * allowance.amount) / 100;
            }
        });

        const activeLoans = user.loans.map((loan) => {
            let currentEmiForPayroll = 0;
            let carryForwardForPayroll = 0;
            
            // Check if the current payroll month is within the grace period
            if (loan.emiStartMonth && loan.emiStartYear) {
                const emiStartYear = loan.emiStartYear;
                const emiStartMonth = loan.emiStartMonth;
                
                // If current processing month is before EMI start, no deduction
                if (year < emiStartYear || (year === emiStartYear && month < emiStartMonth)) {
                    currentEmiForPayroll = 0;
                    carryForwardForPayroll = 0;
                } else {
                    // Grace period has ended, use actual EMI amounts
                    currentEmiForPayroll = loan.emiState?.currentEmi || 0;
                    carryForwardForPayroll = loan.emiState?.carryForward || 0;
                }
            } else {
                // No grace period info, use current EMI (fallback)
                currentEmiForPayroll = loan.emiState?.currentEmi || 0;
                carryForwardForPayroll = loan.emiState?.carryForward || 0;
            }
            
            return {
                id: loan.id,
                currentEmi: currentEmiForPayroll,
                carryForward: carryForwardForPayroll,
                remainingPrincipal: loan.remainingPrincipal,
                totalMonths: loan.totalMonths,
                createdAt: loan.createdAt,
            };
        });

        const totalLoanDeduction = activeLoans.reduce(
            (sum, l) => sum + l.currentEmi + l.carryForward,
            0
        );

        return {
            userId: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            branchName: user.branch?.name ?? null,
            bankAccountNumber: user.bankAccountNumber,
            baseSalary: user.baseSalary,
            walletBalance: user.walletBalance,
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

interface CreatedSalaryPaymentForDispatch {
    userId: string;
    salaryPaymentId: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    branchName: string | null;
    baseSalary: number;
    totalBonuses: number;
    totalAllowances: number;
    medicalReimbursement: number;
    loanDeduction: number;
    walletAdjustment: number;
    netAmount: number;
}

/**
 * Phase 18c — connects the already-built PDF generation, Google Drive
 * folder/upload capability, Document/attachment pipeline, and Notification
 * Engine into the real post-payroll flow. Called once, after
 * `processPayroll()`'s transaction has committed — never inside it. Never
 * throws: `dispatchPayslipsForPayrollRun` isolates every employee, and the
 * one call here that reaches outside that isolation (resolving the Google
 * Drive config) is itself guarded so a missing/broken Drive config degrades
 * to "Drive step skipped for every employee, email still sent" rather than
 * blocking anything.
 */
async function dispatchPayrollPayslips(payrollMonth: string, createdSalaryPayments: CreatedSalaryPaymentForDispatch[]): Promise<void> {
    if (createdSalaryPayments.length === 0) {
        return;
    }

    const [yearStr, monthStr] = payrollMonth.split('-');
    const year = parseInt(yearStr);
    const monthNumber = parseInt(monthStr);

    // Resolved once per payroll run, not per employee — same singleton
    // GoogleDriveConfig, same credentials, for every recipient this run.
    let driveTarget: PayslipDriveTarget | null = null;
    try {
        const driveConfig = await resolveGoogleDriveConfig();
        if (driveConfig) {
            driveTarget = createPayslipDriveTarget(new GoogleDriveService(), driveConfig);
        }
    } catch (error) {
        console.error("Failed to resolve Google Drive configuration for payroll payslip dispatch:", error);
    }

    const inputs: PayslipDispatchInput[] = createdSalaryPayments.map((sp) => {
        const employeeName = `${sp.firstName ?? ""} ${sp.lastName ?? ""}`.trim() || sp.email;
        return {
            salaryPaymentId: sp.salaryPaymentId,
            userId: sp.userId,
            email: sp.email,
            employeeName,
            branchName: sp.branchName,
            year,
            monthNumber,
            payslipData: {
                employeeName,
                employeeEmail: sp.email,
                month: payrollMonth,
                baseSalary: sp.baseSalary,
                totalBonuses: sp.totalBonuses,
                totalAllowances: sp.totalAllowances,
                medicalReimbursement: sp.medicalReimbursement,
                loanDeduction: sp.loanDeduction,
                walletAdjustment: sp.walletAdjustment,
                netAmount: sp.netAmount,
            },
        };
    });

    const summary = await dispatchPayslipsForPayrollRun(inputs, {
        generatePdf: generatePayslipPdf,
        writeLocalFile: writePayslipTempFile,
        drive: driveTarget,
        documentRepository: notificationEngineContainer.repositories.documentRepository,
        notificationService: notificationEngineContainer.notificationService,
        onFailure: (failure) => {
            console.error(
                `Payroll payslip dispatch failure [${failure.stage}] for user ${failure.userId} (salaryPayment ${failure.salaryPaymentId}):`,
                failure.message
            );
        },
    });

    // One summary-level admin alert per payroll run on failures — not one
    // per failed employee. Payroll itself already succeeded regardless.
    if (summary.employeesWithFailures > 0) {
        await createAdminNotification({
            type: "PAYROLL_NOTIFICATION",
            title: `Payroll payslip delivery had ${summary.employeesWithFailures} issue(s)`,
            message: `Payroll for ${payrollMonth}: ${summary.pdfFailures} PDF generation failure(s), ${summary.driveFailures} Google Drive upload failure(s), ${summary.notificationFailures} notification failure(s), out of ${summary.total} employee(s) processed. Payroll itself was processed successfully — check DocumentUploadAttempt records and server logs for details.`,
            metadata: {
                payrollMonth,
                total: summary.total,
                employeesWithFailures: summary.employeesWithFailures,
                pdfFailures: summary.pdfFailures,
                driveFailures: summary.driveFailures,
                notificationFailures: summary.notificationFailures,
            },
        });
    }
}

export async function processPayroll(payrollMonth: string, selectedBonuses: Record<string, string[]>, emiDisabledUsers: string[] = []) {
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
            // Phase 18c: the smallest safe addition needed so the post-commit
            // payslip email flow (below, after the transaction) knows exactly
            // which SalaryPayment rows this run created — previously the
            // `create()` return value was discarded. Pure capture; does not
            // change any calculation, amount, or transaction semantics.
            const createdSalaryPayments: {
                userId: string;
                salaryPaymentId: string;
                email: string;
                firstName?: string | null;
                lastName?: string | null;
                branchName: string | null;
                baseSalary: number;
                totalBonuses: number;
                totalAllowances: number;
                medicalReimbursement: number;
                loanDeduction: number;
                walletAdjustment: number;
                netAmount: number;
            }[] = [];

            for (const emp of data) {
                const userBonusIds = selectedBonuses[emp.userId] || [];
                const appliedBonuses = emp.eligibleBonuses.filter(b => userBonusIds.includes(b.id));
                const totalBonuses = appliedBonuses.reduce((sum, b) => sum + b.amount, 0);

                // Check if EMI is disabled for this user
                const emiDisabled = emiDisabledUsers.includes(emp.userId);
                const adjustedLoanDeduction = emiDisabled ? 0 : emp.totalLoanDeduction;
                const finalNetPay = emp.netPay + totalBonuses + emp.walletBalance + (emiDisabled ? emp.totalLoanDeduction : 0);

                // 2. Create SalaryPayment Record
                const salaryPayment = await tx.salaryPayment.create({
                    data: {
                        userId: emp.userId,
                        month: payrollMonth,
                        baseSalary: emp.baseSalary,
                        totalBonuses: totalBonuses,
                        totalAllowances: emp.totalAllowances,
                        medicalReimbursement: emp.totalMedical,
                        loanDeduction: adjustedLoanDeduction,
                        walletAdjustment: emp.walletBalance,
                        netAmount: finalNetPay,
                    },
                });

                createdSalaryPayments.push({
                    userId: emp.userId,
                    salaryPaymentId: salaryPayment.id,
                    email: emp.email,
                    firstName: emp.firstName,
                    lastName: emp.lastName,
                    branchName: emp.branchName,
                    baseSalary: emp.baseSalary,
                    totalBonuses,
                    totalAllowances: emp.totalAllowances,
                    medicalReimbursement: emp.totalMedical,
                    loanDeduction: adjustedLoanDeduction,
                    walletAdjustment: emp.walletBalance,
                    netAmount: finalNetPay,
                });

                // Clear wallet balance and create adjustment transaction
                if (emp.walletBalance !== 0) {
                    await tx.user.update({
                        where: { id: emp.userId },
                        data: { walletBalance: 0 },
                    });

                    const monthNames = [
                        "January", "February", "March", "April", "May", "June",
                        "July", "August", "September", "October", "November", "December"
                    ];
                    const [year, monthNum] = payrollMonth.split('-');
                    const monthName = monthNames[parseInt(monthNum) - 1];
                    
                    await tx.walletTransaction.create({
                        data: {
                            userId: emp.userId,
                            amount: -emp.walletBalance,
                            type: "ADJUSTMENT",
                            description: `Adjusted in ${monthName}-${year} salary`,
                        },
                    });
                }

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

                // 3. Medical Reset: Mark ALL currently processed APPROVED claims as 'PAID'
                await tx.medicalClaim.updateMany({
                    where: {
                        userId: emp.userId,
                        status: "APPROVED"
                    },
                    data: { status: "PAID" },
                });

                // 4. Loan & Payment Updates
                for (const loan of emp.activeLoans) {
                    if (emiDisabled) {
                        // If EMI is disabled, carry forward the EMI and redistribute across remaining months
                        const currentEmiAmount = loan.currentEmi; // Current scheduled EMI
                        const newCarryForward = loan.carryForward + currentEmiAmount;
                        
                        // Calculate remaining months for this loan
                        const loanDetails = await tx.loan.findUnique({
                            where: { id: loan.id },
                        });
                        
                        if (loanDetails) {
                            const monthsPassed = Math.floor(
                                (Date.now() - loanDetails.createdAt.getTime()) / (30 * 24 * 60 * 60 * 1000)
                            ) + 1;
                            const remainingMonths = loanDetails.totalMonths - monthsPassed;
                            
                            // Redistribute total amount (remaining principal + carry forward) across remaining months
                            const totalAmountToDistribute = loanDetails.remainingPrincipal + newCarryForward;
                            const newEmiAmount = remainingMonths > 0 
                                ? (remainingMonths === 1 ? totalAmountToDistribute : Math.round(totalAmountToDistribute / remainingMonths))
                                : 0;
                            
                            await tx.emiState.update({
                                where: { loanId: loan.id },
                                data: {
                                    carryForward: newCarryForward,
                                    currentEmi: newEmiAmount, // Update EMI to include redistribution
                                },
                            });
                            
                            // Log the redistribution
                            await tx.auditLog.create({
                                data: {
                                    changeReason: `EMI Redistributed: ${currentEmiAmount} carried forward, new EMI: ${newEmiAmount} for loan ${loan.id} of user ${emp.userId} in Payroll ${payrollMonth}`,
                                    oldEmi: currentEmiAmount,
                                    newEmi: newEmiAmount,
                                }
                            });
                        }
                        
                    } else {
                        // Normal EMI processing when not disabled
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
            }

            // 5. Audit Log: Log the entire execution for compliance
            await tx.systemAudit.create({
                data: {
                    action: "PAYROLL_EXECUTION",
                    status: "SUCCESS",
                    details: `Processed payroll for ${payrollMonth}. Total employees: ${data.length}`,
                },
            });

            return { success: true, createdSalaryPayments };
        });

        revalidatePath("/admin/payroll");
        revalidatePath("/profile");

        // Phase 18c — payslip PDF + Google Drive archive + email, run only
        // after the payroll transaction has fully committed (never inside
        // it — PDF generation, Drive API calls, and notification dispatch
        // are all external I/O with no place in a DB transaction).
        // Synchronous, in this same post-commit step (not a background job):
        // this app has no general-purpose background-job infrastructure
        // outside the Notification Engine's own queue/worker, and generating
        // the PDF before raiseEvent() enqueues the job (rather than after,
        // in some later async step) is what guarantees the Document is
        // already GENERATED_LOCAL with real bytes on disk before a worker
        // could ever claim the job — see PayrollEmailFlowReport.md §2/§9 and
        // PayrollEmailImplementationPlan.md §16. Entirely best-effort:
        // wrapped in its own try/catch so nothing here can affect the
        // already-committed, already-successful payroll run; any failure is
        // additionally isolated per employee inside dispatchPayrollPayslips.
        try {
            await dispatchPayrollPayslips(payrollMonth, result.createdSalaryPayments);
        } catch (error) {
            console.error("dispatchPayrollPayslips failed unexpectedly:", error);
        }

        return result;
    } catch (error) {
        console.error("Payroll processing failed:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error during payroll execution";

        // Log failure in Audit Log if possible (outside transaction or separate)
        await prisma.systemAudit.create({
            data: {
                action: "PAYROLL_EXECUTION",
                status: "FAILED",
                details: errorMessage,
            }
        });

        throw new Error(errorMessage || "Payroll processing failed");
    }
}

export async function generatePayrollCSVData(data: PayrollAggregation[], selectedBonuses: Record<string, string[]>, emiDisabledUsers: string[] = []) {
    // Generate CSV data with employee name, account number, and net pay
    const csvData = data.map(emp => {
        const userBonusIds = selectedBonuses[emp.userId] || [];
        const appliedBonuses = emp.eligibleBonuses.filter(b => userBonusIds.includes(b.id));
        const totalBonuses = appliedBonuses.reduce((sum, b) => sum + b.amount, 0);
        
        // Check if EMI is disabled for this user
        const emiDisabled = emiDisabledUsers.includes(emp.userId);
        const finalNetPay = emp.netPay + totalBonuses + emp.walletBalance + (emiDisabled ? emp.totalLoanDeduction : 0);
        
        const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.email;
        
        return {
            userId: emp.userId,
            employeeName: fullName,
            accountNumber: emp.bankAccountNumber || 'N/A',
            netPayAmount: finalNetPay.toFixed(2)
        };
    });

    return csvData;
}

export async function getFailedEmployees(payrollMonth: string) {
    const [yearStr, monthStr] = payrollMonth.split('-');
    const remainingEmployees = await getPayrollAggregation(parseInt(monthStr), parseInt(yearStr));
    return remainingEmployees.map(emp => emp.userId);
}
