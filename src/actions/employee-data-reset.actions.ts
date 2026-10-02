"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { SalaryChangeReason, SalaryPaymentStatus } from "@prisma/client";
import { getDbUser } from "./user.actions";

/**
 * "Reset for rejoin": wipes an archived employee's history so that, if they rejoin, the HRM
 * treats them as a new hire. Kept: login account, profile fields (except dateOfJoining, which is
 * cleared so the rejoin doesn't backfill the timeline from the old joining date — with no joining
 * date, only today's timeline record is generated until a new one is set), current base salary, allowance
 * assignments, notification preferences, FINALIZED payroll (past months' payroll totals stay
 * correct), and anything this employee did to OTHER employees' records (reviews, notes written,
 * notices sent, audit logs as actor). The employee stays archived; reactivate them separately.
 */

async function requireSuperAdmin() {
    const user = await getDbUser();
    if (!user || user.role !== "SUPERADMIN") {
        throw new Error("Unauthorized: only SUPERADMIN can reset employee data");
    }
    return user;
}

async function getArchivedTarget(userId: string) {
    const target = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, firstName: true, lastName: true, role: true, isArchived: true, walletBalance: true, baseSalary: true },
    });
    if (!target) throw new Error("Employee not found");
    if (target.role === "SUPERADMIN") throw new Error("A SUPERADMIN account cannot be reset");
    if (!target.isArchived) throw new Error("Only archived employees can be reset");
    return target;
}

export type EmployeeDataResetPreview = {
    employeeName: string;
    email: string;
    walletBalance: number;
    openLoans: { id: string; status: string; reason: string | null; remainingPrincipal: number }[];
    pendingRequests: { label: string; count: number }[];
    toDelete: { label: string; count: number }[];
    finalizedPayrollsKept: number;
};

export async function getEmployeeDataResetPreview(
    userId: string
): Promise<{ success: true; preview: EmployeeDataResetPreview } | { success: false; error: string }> {
    try {
        await requireSuperAdmin();
        const target = await getArchivedTarget(userId);
        const where = { userId };

        const [
            timeRecords, temporaryTimeRecords, timelineRequests, leaveApplications, leaveEntitlements,
            leaveAuditLogs, loans, walletTransactions, walletRequests, medicalClaims, medicalEntitlements,
            overtimeRequests, overtimePayouts, profileUpdateRequests, draftPayrolls, finalizedPayrolls,
            notesReceived, notifications, notificationJobs, noticesReceived,
            pendingLeave, pendingWallet, pendingMedical, pendingOvertime, pendingProfile, pendingTimeline,
        ] = await Promise.all([
            prisma.dailyTimeRecord.count({ where }),
            prisma.dailyTimeRecordTemporary.count({ where }),
            prisma.timelineModificationRequest.count({ where }),
            prisma.leaveApplication.count({ where }),
            prisma.userLeaveEntitlement.count({ where }),
            prisma.leaveAuditLog.count({ where }),
            prisma.loan.findMany({
                where,
                select: { id: true, status: true, reason: true, remainingPrincipal: true },
            }),
            prisma.walletTransaction.count({ where }),
            prisma.walletRequest.count({ where }),
            prisma.medicalClaim.count({ where }),
            prisma.medicalEntitlement.count({ where }),
            prisma.overtimeRequest.count({ where }),
            prisma.overtimePayout.count({ where }),
            prisma.profileUpdateRequest.count({ where }),
            prisma.salaryPayment.count({ where: { userId, status: SalaryPaymentStatus.DRAFT } }),
            prisma.salaryPayment.count({ where: { userId, status: SalaryPaymentStatus.FINALIZED } }),
            prisma.employeeNote.count({ where: { employeeId: userId } }),
            prisma.employeeNotification.count({ where }),
            prisma.notificationJob.count({ where: { recipientUserId: userId } }),
            prisma.breakingNoticeRecipient.count({ where }),
            prisma.leaveApplication.count({ where: { userId, status: "PENDING" } }),
            prisma.walletRequest.count({ where: { userId, status: "PENDING" } }),
            prisma.medicalClaim.count({ where: { userId, status: "PENDING" } }),
            prisma.overtimeRequest.count({ where: { userId, status: { in: ["PENDING", "MANAGER_VERIFIED"] } } }),
            prisma.profileUpdateRequest.count({ where: { userId, status: "PENDING" } }),
            prisma.timelineModificationRequest.count({ where: { userId, status: "PENDING" } }),
        ]);

        const nonZero = (rows: { label: string; count: number }[]) => rows.filter((r) => r.count > 0);

        return {
            success: true,
            preview: {
                employeeName: [target.firstName, target.lastName].filter(Boolean).join(" ") || target.email,
                email: target.email,
                walletBalance: target.walletBalance,
                openLoans: loans
                    .filter((l) => l.status !== "CLOSED" && l.status !== "DECLINED" && l.status !== "MANAGER_REJECTED")
                    .map((l) => ({ id: l.id, status: l.status, reason: l.reason, remainingPrincipal: l.remainingPrincipal })),
                pendingRequests: nonZero([
                    { label: "Leave applications", count: pendingLeave },
                    { label: "Wallet requests", count: pendingWallet },
                    { label: "Medical claims", count: pendingMedical },
                    { label: "Overtime requests", count: pendingOvertime },
                    { label: "Profile update requests", count: pendingProfile },
                    { label: "Timeline modification requests", count: pendingTimeline },
                    { label: "Draft (unsent) payroll", count: draftPayrolls },
                ]),
                toDelete: nonZero([
                    { label: "Attendance / timeline records", count: timeRecords + temporaryTimeRecords },
                    { label: "Timeline modification requests", count: timelineRequests },
                    { label: "Leave applications", count: leaveApplications },
                    { label: "Leave entitlements (balances)", count: leaveEntitlements },
                    { label: "Leave audit logs", count: leaveAuditLogs },
                    { label: "Loans (with EMI & payment history)", count: loans.length },
                    { label: "Wallet transactions", count: walletTransactions },
                    { label: "Wallet requests", count: walletRequests },
                    { label: "Medical claims", count: medicalClaims },
                    { label: "Medical entitlements", count: medicalEntitlements },
                    { label: "Overtime requests", count: overtimeRequests },
                    { label: "Overtime payouts", count: overtimePayouts },
                    { label: "Profile update requests", count: profileUpdateRequests },
                    { label: "Draft payrolls", count: draftPayrolls },
                    { label: "Employee notes", count: notesReceived },
                    { label: "Notifications", count: notifications + notificationJobs },
                    { label: "Notices received", count: noticesReceived },
                ]),
                finalizedPayrollsKept: finalizedPayrolls,
            },
        };
    } catch (error) {
        console.error("Error loading employee data reset preview:", error);
        return { success: false, error: error instanceof Error ? error.message : "Failed to load reset preview" };
    }
}

export async function resetArchivedEmployeeData(userId: string, confirmEmail: string) {
    try {
        const admin = await requireSuperAdmin();
        const target = await getArchivedTarget(userId);

        if (confirmEmail.trim().toLowerCase() !== target.email.toLowerCase()) {
            return { success: false, error: "Confirmation email does not match the employee's email" };
        }

        await prisma.$transaction(
            async (tx) => {
                const where = { userId };

                // Attendance / timeline
                const timelineRequestIds = (
                    await tx.timelineModificationRequest.findMany({ where, select: { id: true } })
                ).map((r) => r.id);
                await tx.timelineModificationActionLog.deleteMany({
                    where: { OR: [{ targetUserId: userId }, { requestId: { in: timelineRequestIds } }] },
                });
                await tx.timelineModificationRequest.deleteMany({ where });
                await tx.dailyTimeRecord.deleteMany({ where });
                await tx.dailyTimeRecordTemporary.deleteMany({ where });

                // Leave
                await tx.leaveApplication.deleteMany({ where });
                await tx.userLeaveEntitlement.deleteMany({ where });
                await tx.leaveAuditLog.deleteMany({ where });

                // Loans (children first)
                const loanIds = (await tx.loan.findMany({ where, select: { id: true } })).map((l) => l.id);
                if (loanIds.length > 0) {
                    await tx.payment.deleteMany({ where: { loanId: { in: loanIds } } });
                    await tx.emiState.deleteMany({ where: { loanId: { in: loanIds } } });
                    await tx.auditLog.deleteMany({ where: { loanId: { in: loanIds } } });
                    await tx.loan.deleteMany({ where: { id: { in: loanIds } } });
                }

                // Wallet
                await tx.walletTransaction.deleteMany({ where });
                await tx.walletRequest.deleteMany({ where });

                // Medical (claims reference entitlements)
                await tx.medicalClaim.deleteMany({ where });
                await tx.medicalEntitlement.deleteMany({ where });

                // Overtime
                await tx.overtimeRequest.deleteMany({ where });
                await tx.overtimePayout.deleteMany({ where });

                // Payroll: only unsent drafts and per-month allowance overrides; FINALIZED rows are kept
                await tx.salaryPayment.deleteMany({ where: { userId, status: SalaryPaymentStatus.DRAFT } });
                await tx.payrollAllowanceOverride.deleteMany({ where });

                // Profile requests, notes, notifications, notices
                await tx.profileUpdateRequest.deleteMany({ where });
                await tx.employeeNote.deleteMany({ where: { employeeId: userId } });
                await tx.employeeNotification.deleteMany({ where });
                await tx.notificationJobInboxState.deleteMany({ where });
                await tx.notificationJob.deleteMany({ where: { recipientUserId: userId } });
                await tx.breakingNoticeRecipient.deleteMany({ where });
                await tx.breakingNotice.deleteMany({ where: { targetUserId: userId } });

                // Salary history restarts from the current base salary, like a new joiner
                await tx.baseSalary.deleteMany({ where });
                if (target.baseSalary > 0) {
                    await tx.baseSalary.create({
                        data: { userId, amount: target.baseSalary, reason: SalaryChangeReason.JOINING, effectiveFrom: new Date() },
                    });
                }

                await tx.user.update({ where: { id: userId }, data: { walletBalance: 0, dateOfJoining: null } });

                const targetName = [target.firstName, target.lastName].filter(Boolean).join(" ") || target.email;
                await tx.auditLog.create({
                    data: {
                        userId: admin.id,
                        oldEmi: null,
                        newEmi: null,
                        changeReason: `Employee data reset for rejoin: ${targetName} (${userId}); previous wallet balance ${target.walletBalance}, ${loanIds.length} loan(s) removed`,
                    },
                });
            },
            { timeout: 60_000 }
        );

        // The wipe touches almost every page that shows employee data.
        revalidatePath("/", "layout");
        return { success: true };
    } catch (error) {
        console.error("Error resetting archived employee data:", error);
        return { success: false, error: error instanceof Error ? error.message : "Failed to reset employee data" };
    }
}
