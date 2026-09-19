"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { calculateEMI } from "@/lib/services/loan.service";
import { LoanStatus, ClaimStatus, UserStatus, SalaryPaymentStatus, Prisma } from "@prisma/client";
import { getDbUser } from "./user.actions";
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
    type PayslipDispatchSummary,
    type PayslipDriveTarget,
} from "@/lib/services/payroll-payslip-dispatch.service";

export async function getAllProcessedPayrolls() {
    const payments = await prisma.salaryPayment.findMany({
        where: { status: SalaryPaymentStatus.FINALIZED },
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
    firstName?: string | null;
    lastName?: string | null;
    branchName?: string | null;
    bankAccountNumber?: string | null;
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
    // MANUAL-mode loans (no EmiState): nothing is deducted unless admin enters an amount.
    manualLoans: {
        id: string;
        issuedAmount: number;
        remainingPrincipal: number;
        createdAt: Date;
        reason: string;
    }[];
    totalLoanDeduction: number;
    netPay: number;
    /** Saved (not yet sent) draft for this month, if admin already generated one. */
    draft: {
        id: string;
        inputs: PayrollEmployeeInput;
        netAmount: number;
    } | null;
}

/** Everything admin can choose per employee for one payroll month. */
export interface PayrollEmployeeInput {
    bonusIds: string[];
    /** One-off bonus for this month only (on top of the bonus types). */
    customBonus: number;
    customBonusNote: string;
    /** Medical amount to pay this month. null = the employee's approved claims total. */
    medicalAmount: number | null;
    /** Total of approved claims when the draft was saved (server-filled; used to detect changes before sending). */
    medicalClaimed?: number;
    /**
     * loanId -> amount to deduct this month. For old EMI-schedule loans an absent entry
     * means "the scheduled EMI" and 0 means "skip this month". For manual-mode loans an
     * absent entry means 0.
     */
    loanDeductions: Record<string, number>;
}

const roundMoney = (n: number) => Math.round(n * 100) / 100;

/**
 * Admin-chosen deductions (loanId -> amount) for one employee's manual loans.
 * Throws on invalid input so a bad amount can never silently slip into payroll.
 */
function resolveManualDeductions(
    emp: Pick<PayrollAggregation, "userId" | "manualLoans">,
    manualLoanDeductions: Record<string, number>
) {
    const entries: { loanId: string; amount: number }[] = [];
    for (const loan of emp.manualLoans) {
        const raw = manualLoanDeductions[loan.id];
        if (raw === undefined || raw === null) continue;
        const amount = roundMoney(Number(raw));
        if (!Number.isFinite(amount) || amount < 0) {
            throw new Error(`Invalid loan deduction amount for loan #${loan.id.slice(-6)}`);
        }
        if (amount === 0) continue;
        if (amount > loan.remainingPrincipal) {
            throw new Error(
                `Loan deduction ৳${amount} exceeds remaining balance ৳${loan.remainingPrincipal} for loan #${loan.id.slice(-6)}`
            );
        }
        entries.push({ loanId: loan.id, amount });
    }
    return { entries, total: roundMoney(entries.reduce((sum, e) => sum + e.amount, 0)) };
}

/** Deductions for old EMI-schedule loans: defaults to the scheduled EMI + carry-forward unless admin typed an amount. */
function resolveAutoDeductions(
    emp: Pick<PayrollAggregation, "activeLoans">,
    loanDeductions: Record<string, number>
) {
    const entries: { loanId: string; amount: number; scheduled: number }[] = [];
    for (const loan of emp.activeLoans) {
        const scheduled = loan.currentEmi + loan.carryForward;
        const raw = loanDeductions[loan.id];
        const amount = raw === undefined || raw === null ? scheduled : roundMoney(Number(raw));
        if (!Number.isFinite(amount) || amount < 0) {
            throw new Error(`Invalid loan deduction amount for loan #${loan.id.slice(-6)}`);
        }
        if (amount > loan.remainingPrincipal) {
            throw new Error(
                `Loan deduction ৳${amount} exceeds remaining balance ৳${loan.remainingPrincipal} for loan #${loan.id.slice(-6)}`
            );
        }
        entries.push({ loanId: loan.id, amount, scheduled });
    }
    return { entries, total: roundMoney(entries.reduce((sum, e) => sum + e.amount, 0)) };
}

async function computePayrollAggregation(month: number, year: number): Promise<PayrollAggregation[]> {
    const payrollMonth = `${year}-${month.toString().padStart(2, '0')}`;
    const currentDate = new Date(year, month - 1, 1); // First day of the payroll month

    const users = await prisma.user.findMany({
        where: {
            status: UserStatus.APPROVED,
            role: { not: "SUPERADMIN" },
            salaryPayments: {
                none: {
                    month: payrollMonth,
                    status: SalaryPaymentStatus.FINALIZED
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
                    reason: true,
                    issuedAmount: true,
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

    const draftRows = await prisma.salaryPayment.findMany({
        where: { month: payrollMonth, status: SalaryPaymentStatus.DRAFT },
        orderBy: { createdAt: "asc" },
    });
    const draftsByUser = new Map(
        draftRows.map((row) => [
            row.userId,
            { id: row.id, inputs: normalizePayrollInput(row.draftInputs), netAmount: row.netAmount },
        ])
    );

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

        // Loans without an EmiState are manual-mode loans: never auto-deducted.
        const manualLoans = user.loans
            .filter((loan) => !loan.emiState)
            .map((loan) => ({
                id: loan.id,
                issuedAmount: loan.issuedAmount,
                remainingPrincipal: loan.remainingPrincipal,
                createdAt: loan.createdAt,
                reason: loan.reason,
            }));

        const activeLoans = user.loans.filter((loan) => loan.emiState).map((loan) => {
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
            manualLoans,
            draft: draftsByUser.get(user.id) ?? null,
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
    customBonus?: number;
    customBonusNote?: string | null;
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
async function dispatchPayrollPayslips(
    payrollMonth: string,
    createdSalaryPayments: CreatedSalaryPaymentForDispatch[],
    options: { resend?: boolean } = {}
): Promise<PayslipDispatchSummary | null> {
    if (createdSalaryPayments.length === 0) {
        return null;
    }
    const dedupeKeySuffix = options.resend ? `resend-${Date.now()}` : undefined;

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
                customBonus: sp.customBonus,
                customBonusNote: sp.customBonusNote,
            },
            dedupeKeySuffix,
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
            message: `Payroll for ${payrollMonth}: ${summary.pdfFailures} PDF generation failure(s), ${summary.driveFailures} Google Drive upload failure(s), ${summary.notificationFailures} notification failure(s), out of ${summary.total} employee(s) processed. Payroll itself was already finalized — check DocumentUploadAttempt records and server logs for details.`,
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

    return summary;
}


// ---------------------------------------------------------------------------
// Draft -> CSV -> Edit -> Send workflow
//
//   saveDraftPayroll          saves numbers only (SalaryPayment status DRAFT).
//                             Wallet, medical claims and loans are NOT touched.
//   finalizeAndSendPayslips   per employee, in ONE transaction: flips the draft to
//                             FINALIZED and applies every money effect (wallet
//                             cleared, medical marked PAID, loan balances/ledger),
//                             then (after commit) PDF + Drive + email, as before.
//   resendPayslips            re-emails an already finalized payslip.
// ---------------------------------------------------------------------------

const PAYROLL_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONEY_TOLERANCE = 0.01;

async function requirePayrollAdmin() {
    const user = await getDbUser();
    if (!user || (user.role !== "SUPERADMIN" && user.role !== "HR")) {
        throw new Error("Unauthorized");
    }
    return user;
}

function parsePayrollMonth(payrollMonth: string) {
    if (!PAYROLL_MONTH_PATTERN.test(payrollMonth)) {
        throw new Error("Invalid payroll month");
    }
    const [yearStr, monthStr] = payrollMonth.split("-");
    return { year: parseInt(yearStr), month: parseInt(monthStr) };
}

/** Defensive parse of client input / the stored `draftInputs` JSON. */
function normalizePayrollInput(raw: unknown): PayrollEmployeeInput {
    const value = (raw && typeof raw === "object" ? raw : {}) as Partial<PayrollEmployeeInput>;
    const loanDeductions: Record<string, number> = {};
    if (value.loanDeductions && typeof value.loanDeductions === "object") {
        for (const [loanId, amount] of Object.entries(value.loanDeductions)) {
            loanDeductions[loanId] = Number(amount);
        }
    }
    return {
        bonusIds: Array.isArray(value.bonusIds) ? value.bonusIds.filter((id): id is string => typeof id === "string") : [],
        customBonus: Number(value.customBonus ?? 0) || 0,
        customBonusNote: typeof value.customBonusNote === "string" ? value.customBonusNote : "",
        medicalAmount:
            value.medicalAmount === null || value.medicalAmount === undefined || !Number.isFinite(Number(value.medicalAmount))
                ? null
                : Number(value.medicalAmount),
        medicalClaimed: Number.isFinite(Number(value.medicalClaimed)) ? Number(value.medicalClaimed) : undefined,
        loanDeductions,
    };
}

/** Single source of truth for one employee's payroll numbers (used by draft save AND by the send-time re-check). */
function computeEmployeePayroll(emp: PayrollAggregation, input: PayrollEmployeeInput) {
    const appliedBonuses = emp.eligibleBonuses.filter((b) => input.bonusIds.includes(b.id));
    const bonusTypesTotal = appliedBonuses.reduce((sum, b) => sum + b.amount, 0);

    const customBonus = roundMoney(input.customBonus);
    if (!Number.isFinite(customBonus) || customBonus < 0) {
        throw new Error("Custom bonus must be zero or a positive amount");
    }
    const customBonusNote = input.customBonusNote.trim();
    if (customBonus > 0 && !customBonusNote) {
        throw new Error("Custom bonus needs a label (e.g. 'Eid gift')");
    }

    const medicalAmount = input.medicalAmount === null ? emp.totalMedical : roundMoney(input.medicalAmount);
    if (!Number.isFinite(medicalAmount) || medicalAmount < 0) {
        throw new Error("Medical amount must be zero or a positive amount");
    }

    const totalBonuses = bonusTypesTotal + customBonus;
    const auto = resolveAutoDeductions(emp, input.loanDeductions);
    const manual = resolveManualDeductions(emp, input.loanDeductions);
    const loanDeduction = auto.total + manual.total;
    const netAmount =
        emp.baseSalary + emp.totalAllowances + medicalAmount + totalBonuses + emp.walletBalance - loanDeduction;

    // Only guard against negative pay when admin asked for more than the automatic schedule would take.
    if (netAmount < 0 && loanDeduction > emp.totalLoanDeduction) {
        throw new Error(`Loan deduction ৳${loanDeduction} exceeds net pay ৳${roundMoney(netAmount + loanDeduction)}`);
    }

    return {
        appliedBonuses,
        totalBonuses,
        customBonus,
        customBonusNote: customBonus > 0 ? customBonusNote : null,
        medicalAmount,
        autoEntries: auto.entries,
        manualEntries: manual.entries,
        loanDeduction,
        netAmount,
    };
}

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

/** Admin working view: everyone still to be paid this month (with saved drafts attached). */
export async function getPayrollAggregation(month: number, year: number) {
    await requirePayrollAdmin();
    return computePayrollAggregation(month, year);
}

/** Employees already finalized (payslip sent) for the month. */
export async function getFinalizedPayrollForMonth(payrollMonth: string) {
    await requirePayrollAdmin();
    parsePayrollMonth(payrollMonth);

    const rows = await prisma.salaryPayment.findMany({
        where: { month: payrollMonth, status: SalaryPaymentStatus.FINALIZED },
        include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: "asc" },
    });

    return rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        email: row.user.email,
        name: `${row.user.firstName ?? ""} ${row.user.lastName ?? ""}`.trim(),
        netAmount: row.netAmount,
        loanDeduction: row.loanDeduction,
        totalBonuses: row.totalBonuses,
        payslipSentAt: row.payslipSentAt,
    }));
}

/**
 * "Generate CSV": validates and saves a DRAFT for every employee still to be paid this
 * month (replacing any earlier draft) and returns the CSV rows. Nothing else changes.
 */
export async function saveDraftPayroll(payrollMonth: string, inputsByUser: Record<string, PayrollEmployeeInput>) {
    const admin = await requirePayrollAdmin();
    const { year, month } = parsePayrollMonth(payrollMonth);
    const data = await computePayrollAggregation(month, year);

    const knownLoanIds = new Set(
        data.flatMap((emp) => [...emp.manualLoans.map((l) => l.id), ...emp.activeLoans.map((l) => l.id)])
    );
    for (const input of Object.values(inputsByUser)) {
        for (const loanId of Object.keys(input.loanDeductions ?? {})) {
            if (!knownLoanIds.has(loanId)) {
                throw new Error(`Loan ${loanId} is not an active loan of an employee in this payroll run`);
            }
        }
    }

    const prepared = data.map((emp) => {
        const input = normalizePayrollInput(inputsByUser[emp.userId]);
        try {
            const computed = computeEmployeePayroll(emp, input);
            // Store the resolved deduction for every one of this employee's loans, plus the claims
            // total seen now (so send can detect medical changes even when the amount is overridden).
            input.loanDeductions = Object.fromEntries([
                ...computed.autoEntries.map((e) => [e.loanId, e.amount] as const),
                ...computed.manualEntries.map((e) => [e.loanId, e.amount] as const),
            ]);
            input.customBonus = computed.customBonus;
            input.medicalClaimed = emp.totalMedical;
            return { emp, input, computed };
        } catch (error) {
            throw new Error(`${emp.email}: ${errorMessage(error, "Invalid payroll input")}`);
        }
    });

    await prisma.$transaction(async (tx) => {
        for (const { emp, input, computed } of prepared) {
            await tx.salaryPayment.deleteMany({
                where: { userId: emp.userId, month: payrollMonth, status: SalaryPaymentStatus.DRAFT },
            });
            await tx.salaryPayment.create({
                data: {
                    userId: emp.userId,
                    month: payrollMonth,
                    status: SalaryPaymentStatus.DRAFT,
                    baseSalary: emp.baseSalary,
                    totalBonuses: computed.totalBonuses,
                    totalAllowances: emp.totalAllowances,
                    medicalReimbursement: computed.medicalAmount,
                    loanDeduction: computed.loanDeduction,
                    walletAdjustment: emp.walletBalance,
                    netAmount: computed.netAmount,
                    customBonus: computed.customBonus,
                    customBonusNote: computed.customBonusNote,
                    draftInputs: input as unknown as Prisma.InputJsonValue,
                },
            });
        }

        await tx.systemAudit.create({
            data: {
                action: "PAYROLL_DRAFT_SAVED",
                status: "SUCCESS",
                details: `Payroll draft for ${payrollMonth} saved by ${admin.id}. Employees: ${prepared.length}`,
            },
        });
    });

    revalidatePath("/admin/payroll");

    return prepared.map(({ emp, computed }) => ({
        userId: emp.userId,
        employeeName: `${emp.firstName || ""} ${emp.lastName || ""}`.trim() || emp.email,
        accountNumber: emp.bankAccountNumber || "N/A",
        netPayAmount: computed.netAmount.toFixed(2),
    }));
}

/** Why a draft no longer matches live data, or null when it is still valid. */
function findDraftMismatch(
    draft: {
        baseSalary: number;
        totalAllowances: number;
        medicalReimbursement: number;
        walletAdjustment: number;
        loanDeduction: number;
        totalBonuses: number;
        netAmount: number;
    },
    emp: PayrollAggregation,
    computed: ReturnType<typeof computeEmployeePayroll>,
    input: PayrollEmployeeInput
): string | null {
    const differs = (a: number, b: number) => Math.abs(a - b) > MONEY_TOLERANCE;
    if (input.medicalClaimed !== undefined && differs(input.medicalClaimed, emp.totalMedical)) return "medical claims";
    if (differs(draft.baseSalary, emp.baseSalary)) return "base salary";
    if (differs(draft.totalAllowances, emp.totalAllowances)) return "allowances";
    if (differs(draft.medicalReimbursement, computed.medicalAmount)) return "medical amount";
    if (differs(draft.walletAdjustment, emp.walletBalance)) return "wallet balance";
    if (differs(draft.totalBonuses, computed.totalBonuses)) return "bonuses";
    if (differs(draft.loanDeduction, computed.loanDeduction)) return "loan deduction";
    if (differs(draft.netAmount, computed.netAmount)) return "net pay";
    return null;
}

/**
 * All money side effects of paying one employee. Runs inside the finalize transaction.
 * (Logic carried over unchanged from the former all-at-once payroll run.)
 */
async function applyPayrollEffects(
    tx: Prisma.TransactionClient,
    emp: PayrollAggregation,
    input: PayrollEmployeeInput,
    computed: ReturnType<typeof computeEmployeePayroll>,
    payrollMonth: string
) {
    // Guard against wallet / medical changes made since the numbers were read.
    const liveUser = await tx.user.findUnique({ where: { id: emp.userId }, select: { walletBalance: true } });
    if (!liveUser || Math.abs(liveUser.walletBalance - emp.walletBalance) > MONEY_TOLERANCE) {
        throw new Error("Wallet balance changed while sending. Edit and regenerate.");
    }
    const liveMedical = await tx.medicalClaim.aggregate({
        where: { userId: emp.userId, status: "APPROVED" },
        _sum: { amount: true },
    });
    if (Math.abs((liveMedical._sum.amount ?? 0) - emp.totalMedical) > MONEY_TOLERANCE) {
        throw new Error("Approved medical claims changed while sending. Edit and regenerate.");
    }

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
    for (const bonus of computed.appliedBonuses) {
        await tx.auditLog.create({
            data: {
                changeReason: `Bonus Applied: ${bonus.name} (Amount: ${bonus.amount}) for user ${emp.userId} in Payroll ${payrollMonth}`,
                oldEmi: null,
                newEmi: null,
            }
        });
    }
    if (computed.customBonus > 0) {
        await tx.auditLog.create({
            data: {
                changeReason: `Custom Bonus Applied: ${computed.customBonusNote} (Amount: ${computed.customBonus}) for user ${emp.userId} in Payroll ${payrollMonth}`,
                oldEmi: null,
                newEmi: null,
            }
        });
    }

    // Medical Reset: Mark ALL currently approved claims as 'PAID'
    await tx.medicalClaim.updateMany({
        where: {
            userId: emp.userId,
            status: "APPROVED"
        },
        data: { status: "PAID" },
    });
    if (Math.abs(computed.medicalAmount - emp.totalMedical) > MONEY_TOLERANCE) {
        await tx.auditLog.create({
            data: {
                changeReason: `Medical reimbursement overridden: approved claims ৳${emp.totalMedical}, paid ৳${computed.medicalAmount} for user ${emp.userId} in Payroll ${payrollMonth}`,
                oldEmi: null,
                newEmi: null,
            }
        });
    }

    // Old EMI-schedule loans: the scheduled EMI, or the amount admin typed for this month
    for (const entry of computed.autoEntries) {
        const loan = emp.activeLoans.find((l) => l.id === entry.loanId);
        if (!loan) continue;
        const scheduled = entry.scheduled;

        if (entry.amount === scheduled) {
            // Normal EMI processing
            if (scheduled > 0) {
                await tx.loan.update({
                    where: { id: loan.id },
                    data: {
                        remainingPrincipal: { decrement: scheduled },
                    },
                });

                await tx.payment.create({
                    data: {
                        loanId: loan.id,
                        amount: scheduled,
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
        } else if (entry.amount === 0) {
            // Skipped this month: carry the EMI forward and redistribute across remaining months
            const currentEmiAmount = loan.currentEmi; // Current scheduled EMI
            const newCarryForward = loan.carryForward + currentEmiAmount;

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

                await tx.auditLog.create({
                    data: {
                        loanId: loan.id,
                        changeReason: `EMI Redistributed: ${currentEmiAmount} carried forward, new EMI: ${newEmiAmount} for loan ${loan.id} of user ${emp.userId} in Payroll ${payrollMonth}`,
                        oldEmi: currentEmiAmount,
                        newEmi: newEmiAmount,
                    }
                });
            }
        } else {
            // Custom amount (more or less than the schedule): treated as a payment; the rest is
            // re-spread over the remaining months, so nothing is double counted.
            const fresh = await tx.loan.findUnique({ where: { id: loan.id } });
            if (!fresh || fresh.status !== LoanStatus.ACTIVE || fresh.remainingPrincipal < entry.amount) {
                throw new Error(`Loan #${loan.id.slice(-6)} changed while sending. Edit and regenerate.`);
            }

            const remaining = roundMoney(fresh.remainingPrincipal - entry.amount);
            const monthsPassed =
                Math.floor((Date.now() - fresh.createdAt.getTime()) / (30 * 24 * 60 * 60 * 1000)) + 1;
            const nextEmi = remaining > 0 ? calculateEMI(remaining, fresh.totalMonths - monthsPassed) : 0;

            await tx.payment.create({
                data: {
                    loanId: loan.id,
                    amount: entry.amount,
                    type: "EMI",
                    payrollMonth,
                },
            });

            await tx.loan.update({
                where: { id: loan.id },
                data: {
                    remainingPrincipal: remaining,
                    ...(remaining <= 0 ? { status: LoanStatus.CLOSED } : {}),
                },
            });

            await tx.emiState.update({
                where: { loanId: loan.id },
                data: { currentEmi: nextEmi, carryForward: 0 },
            });

            await tx.auditLog.create({
                data: {
                    loanId: loan.id,
                    oldEmi: scheduled,
                    newEmi: nextEmi,
                    changeReason: `Payroll deduction of ৳${entry.amount} (scheduled ৳${scheduled}) in Payroll ${payrollMonth}. Remaining balance: ৳${remaining}.`,
                },
            });
        }
    }

    // Manual-mode loans: apply only the amounts admin entered for this month
    for (const entry of computed.manualEntries) {
        const fresh = await tx.loan.findUnique({ where: { id: entry.loanId } });
        if (!fresh || fresh.status !== LoanStatus.ACTIVE || fresh.remainingPrincipal < entry.amount) {
            throw new Error(`Loan #${entry.loanId.slice(-6)} changed while sending. Edit and regenerate.`);
        }

        const remaining = roundMoney(fresh.remainingPrincipal - entry.amount);

        await tx.payment.create({
            data: {
                loanId: entry.loanId,
                amount: entry.amount,
                type: "EMI",
                payrollMonth,
            },
        });

        await tx.loan.update({
            where: { id: entry.loanId },
            data: {
                remainingPrincipal: remaining,
                ...(remaining <= 0 ? { status: LoanStatus.CLOSED } : {}),
            },
        });

        await tx.auditLog.create({
            data: {
                loanId: entry.loanId,
                oldEmi: 0,
                newEmi: 0,
                changeReason: `Manual payroll deduction of ৳${entry.amount} in Payroll ${payrollMonth}. Remaining balance: ৳${remaining}.`,
            },
        });
    }
}

export interface PayslipSendResult {
    userId: string;
    email: string;
    /** SENT = finalized and email queued; EMAIL_FAILED = finalized but email/PDF failed (use Resend); BLOCKED = nothing changed. */
    status: "SENT" | "EMAIL_FAILED" | "BLOCKED";
    message?: string;
}

function toDispatchPayment(
    payment: {
        id: string;
        userId: string;
        baseSalary: number;
        totalBonuses: number;
        totalAllowances: number;
        medicalReimbursement: number;
        loanDeduction: number;
        walletAdjustment: number;
        netAmount: number;
        customBonus: number;
        customBonusNote: string | null;
    },
    user: { email: string; firstName?: string | null; lastName?: string | null; branchName: string | null }
): CreatedSalaryPaymentForDispatch {
    return {
        userId: payment.userId,
        salaryPaymentId: payment.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        branchName: user.branchName,
        baseSalary: payment.baseSalary,
        totalBonuses: payment.totalBonuses,
        totalAllowances: payment.totalAllowances,
        medicalReimbursement: payment.medicalReimbursement,
        loanDeduction: payment.loanDeduction,
        walletAdjustment: payment.walletAdjustment,
        netAmount: payment.netAmount,
        customBonus: payment.customBonus,
        customBonusNote: payment.customBonusNote,
    };
}

/** Runs the PDF/Drive/email step and stamps `payslipSentAt` for the ones whose email was queued. */
async function dispatchAndStamp(
    payrollMonth: string,
    items: { payment: CreatedSalaryPaymentForDispatch; result: PayslipSendResult }[],
    options: { resend?: boolean } = {}
) {
    if (items.length === 0) return;

    let summary: PayslipDispatchSummary | null = null;
    try {
        summary = await dispatchPayrollPayslips(payrollMonth, items.map((i) => i.payment), options);
    } catch (error) {
        console.error("dispatchPayrollPayslips failed unexpectedly:", error);
    }

    const sentIds: string[] = [];
    for (const item of items) {
        const outcome = summary?.results.find((r) => r.salaryPaymentId === item.payment.salaryPaymentId);
        if (outcome?.notificationRaised) {
            sentIds.push(item.payment.salaryPaymentId);
            item.result.status = "SENT";
        } else {
            item.result.status = "EMAIL_FAILED";
            const failure = outcome?.failures.find((f) => f.stage !== "drive_upload") ?? outcome?.failures[0];
            item.result.message = `Payroll finalized but the email was not sent${failure ? ` (${failure.message})` : ""}. Use Resend.`;
        }
    }

    if (sentIds.length > 0) {
        await prisma.salaryPayment.updateMany({
            where: { id: { in: sentIds } },
            data: { payslipSentAt: new Date() },
        });
    }
}

/**
 * "Send email": for each selected employee with a saved draft — re-check the draft against
 * live data, finalize (apply all money effects in one transaction), then send the payslip.
 * Employees whose data changed since the draft are BLOCKED and left untouched.
 */
export async function finalizeAndSendPayslips(payrollMonth: string, userIds: string[]): Promise<PayslipSendResult[]> {
    const admin = await requirePayrollAdmin();
    const { year, month } = parsePayrollMonth(payrollMonth);

    const uniqueUserIds = Array.from(new Set(userIds));
    if (uniqueUserIds.length === 0) {
        throw new Error("Select at least one employee");
    }

    const live = await computePayrollAggregation(month, year);
    const drafts = await prisma.salaryPayment.findMany({
        where: { month: payrollMonth, status: SalaryPaymentStatus.DRAFT, userId: { in: uniqueUserIds } },
        orderBy: { createdAt: "desc" },
    });

    const results: PayslipSendResult[] = [];
    const toDispatch: { payment: CreatedSalaryPaymentForDispatch; result: PayslipSendResult }[] = [];

    for (const userId of uniqueUserIds) {
        const emp = live.find((e) => e.userId === userId);
        const draft = drafts.find((d) => d.userId === userId);
        const result: PayslipSendResult = { userId, email: emp?.email ?? userId, status: "BLOCKED" };
        results.push(result);

        if (!emp || !draft) {
            result.message = "No saved draft. Generate the CSV first.";
            continue;
        }

        try {
            const input = normalizePayrollInput(draft.draftInputs);
            const computed = computeEmployeePayroll(emp, input);

            const mismatch = findDraftMismatch(draft, emp, computed, input);
            if (mismatch) {
                result.message = `Data changed since the draft (${mismatch}). Edit and regenerate.`;
                continue;
            }

            await prisma.$transaction(async (tx) => {
                const claimed = await tx.salaryPayment.updateMany({
                    where: { id: draft.id, status: SalaryPaymentStatus.DRAFT },
                    data: { status: SalaryPaymentStatus.FINALIZED },
                });
                if (claimed.count !== 1) {
                    throw new Error("This payroll entry was already finalized.");
                }

                await applyPayrollEffects(tx, emp, input, computed, payrollMonth);

                await tx.systemAudit.create({
                    data: {
                        action: "PAYROLL_FINALIZED",
                        status: "SUCCESS",
                        details: `Payroll ${payrollMonth} finalized for user ${emp.userId} by ${admin.id}. Net: ${draft.netAmount}`,
                    },
                });
            });

            toDispatch.push({
                payment: toDispatchPayment(draft, {
                    email: emp.email,
                    firstName: emp.firstName,
                    lastName: emp.lastName,
                    branchName: emp.branchName ?? null,
                }),
                result,
            });
            result.status = "SENT";
        } catch (error) {
            console.error(`Finalizing payroll ${payrollMonth} for user ${userId} failed:`, error);
            result.status = "BLOCKED";
            result.message = errorMessage(error, "Failed to finalize payroll for this employee");
        }
    }

    // Post-commit only — PDF, Drive and email are external I/O and never run inside a DB transaction.
    await dispatchAndStamp(payrollMonth, toDispatch);

    revalidatePath("/admin/payroll");
    revalidatePath("/admin/payroll/processed");
    revalidatePath("/admin/loans");
    revalidatePath("/loans");
    revalidatePath("/profile");

    return results;
}

/** Re-sends the payslip email for employees whose payroll is already finalized (no money effects). */
export async function resendPayslips(payrollMonth: string, userIds: string[]): Promise<PayslipSendResult[]> {
    await requirePayrollAdmin();
    parsePayrollMonth(payrollMonth);

    const uniqueUserIds = Array.from(new Set(userIds));
    if (uniqueUserIds.length === 0) {
        throw new Error("Select at least one employee");
    }

    const rows = await prisma.salaryPayment.findMany({
        where: { month: payrollMonth, status: SalaryPaymentStatus.FINALIZED, userId: { in: uniqueUserIds } },
        include: {
            user: { select: { email: true, firstName: true, lastName: true, branch: { select: { name: true } } } },
        },
        orderBy: { createdAt: "desc" },
    });

    const results: PayslipSendResult[] = [];
    const toDispatch: { payment: CreatedSalaryPaymentForDispatch; result: PayslipSendResult }[] = [];

    for (const userId of uniqueUserIds) {
        const row = rows.find((r) => r.userId === userId);
        const result: PayslipSendResult = { userId, email: row?.user.email ?? userId, status: "BLOCKED" };
        results.push(result);

        if (!row) {
            result.message = "No finalized payroll found for this employee and month.";
            continue;
        }

        toDispatch.push({
            payment: toDispatchPayment(row, {
                email: row.user.email,
                firstName: row.user.firstName,
                lastName: row.user.lastName,
                branchName: row.user.branch?.name ?? null,
            }),
            result,
        });
    }

    await dispatchAndStamp(payrollMonth, toDispatch, { resend: true });

    revalidatePath("/admin/payroll");
    revalidatePath("/admin/payroll/processed");

    return results;
}
