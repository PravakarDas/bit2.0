"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { UserStatus, EmployeeStatus, SalaryChangeReason, Role, Prisma } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";
import { getDbUser } from "./user.actions";
import { createAdminNotification } from "./notification.actions";
import { logManagerEmployeeEditAction } from "./manager-employee-edit.actions";
import { buildDateRangeFilter } from "@/lib/utils";
import { isArchivedStatus } from "@/lib/employee-status";

/**
 * Get archive warning data for an employee
 * Returns wallet balance and all loan records
 */
export async function getArchiveWarningsData(userId: string) {
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                walletBalance: true,
                loans: {
                    select: {
                        id: true,
                        issuedAmount: true,
                        remainingPrincipal: true,
                        status: true,
                        reason: true,
                    },
                },
            },
        });

        if (!user) {
            return { walletBalance: 0, loans: [] };
        }

        return {
            walletBalance: user.walletBalance,
            loans: user.loans,
        };
    } catch (error) {
        console.error("Error fetching archive warnings data:", error);
        return { walletBalance: 0, loans: [] };
    }
}

async function logManagerEmployeeRejection({
    actorId,
    actorName,
    employeeId,
    employeeName,
}: {
    actorId: string;
    actorName: string;
    employeeId: string;
    employeeName: string;
}) {
    try {
        await prisma.auditLog.create({
            data: {
                userId: actorId,
                oldEmi: null,
                newEmi: null,
                changeReason: `Manager rejected employee account: ${employeeName} (${employeeId})`,
            },
        });

        await createAdminNotification({
            type: "SYSTEM_ALERT",
            title: "Manager Rejected Employee Account",
            message: `${actorName} rejected the employee account for ${employeeName}`,
            metadata: {
                actorId,
                actorName,
                action: "REJECTED",
                employeeId,
                employeeName,
                source: "employee_account_approval",
            },
        });
    } catch (error) {
        console.error("Failed to log manager employee rejection action:", error);
    }
}

export async function getActiveEmployees() {
    return await prisma.user.findMany({
        where: { 
            isArchived: false,
            role: { not: "SUPERADMIN" }
        },
        include: { 
            branch: true,
            department: true,
            designation: true
        },
        orderBy: { createdAt: "desc" },
    });
}

export async function getPendingEmployees() {
    return await prisma.user.findMany({
        where: { 
            status: "PENDING",
            isArchived: false,
            role: { not: "SUPERADMIN" }
        },
        include: { 
            branch: true,
            department: true,
            designation: true
        },
        orderBy: { createdAt: "desc" },
    });
}

export async function getArchivedEmployees(fromDate?: string, toDate?: string) {
    const whereClause: Prisma.UserWhereInput = {
        isArchived: true,
        role: { not: "SUPERADMIN" }
    };

    const dateFilter = buildDateRangeFilter(fromDate, toDate);
    if (dateFilter) {
        whereClause.updatedAt = dateFilter;
    }

    return await prisma.user.findMany({
        where: whereClause,
        include: { 
            branch: true,
            department: true,
            designation: true
        },
        orderBy: { updatedAt: "desc" },
    });
}

export async function approveEmployeeWithDetails(userId: string, branchId: string, baseSalary: number) {
    try {
        if (!branchId) {
            return { success: false, error: "Branch is required to approve employee" };
        }
        if (!baseSalary || baseSalary <= 0) {
            return { success: false, error: "Base salary is required to approve employee" };
        }

        const user = await prisma.$transaction(async (tx) => {
            const updatedUser = await tx.user.update({
                where: { id: userId },
                data: { 
                    status: "APPROVED",
                    employeeStatus: "ACTIVE",
                    branchId,
                    baseSalary
                },
            });

            // Create salary history entry for joining
            await tx.baseSalary.create({
                data: {
                    userId,
                    amount: baseSalary,
                    reason: SalaryChangeReason.JOINING,
                    effectiveFrom: new Date()
                }
            });

            // Create medical entitlement for approved employee
            const settings = await tx.systemSettings.findUnique({ where: { id: "global" } });
            const limit = settings?.medicalClaimLimit ?? 500;
            const year = new Date().getFullYear();

            await tx.medicalEntitlement.upsert({
                where: { userId_year: { userId, year } },
                update: {}, // Don't overwrite if already exists
                create: {
                    userId,
                    year,
                    totalLimit: limit,
                    remainingBalance: limit,
                },
            });

            return updatedUser;
        });

        revalidatePath("/admin/employees");
        return { success: true, user };
    } catch (error) {
        console.error("Error approving employee:", error);
        return { success: false, error: "Failed to approve employee" };
    }
}

export async function approveEmployee(userId: string) {
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { branchId: true, baseSalary: true }
        });

        if (!user?.branchId || !user.baseSalary || user.baseSalary <= 0) {
            return { success: false, error: "Branch and base salary are required before approval" };
        }

        return await approveEmployeeWithDetails(userId, user.branchId, user.baseSalary);
    } catch (error) {
        console.error("Error approving employee:", error);
        return { success: false, error: "Failed to approve employee" };
    }
}

export async function rejectEmployee(userId: string) {
    try {
        const actor = await getDbUser();

        // Get user details before deletion
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            return { success: false, error: "Employee not found" };
        }

        // Delete from database
        await prisma.user.delete({
            where: { id: userId },
        });

        // Try to delete from Clerk (optional, if it fails we continue)
        try {
            const clerk = await clerkClient();
            await clerk.users.deleteUser(user.clerkId);
        } catch (clerkError) {
            console.warn("Could not delete user from Clerk:", clerkError);
        }

        if (actor && actor.role === "EMPLOYEE" && actor.isManager) {
            const actorName = [actor.firstName, actor.lastName].filter(Boolean).join(" ") || actor.email;
            const employeeName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

            await logManagerEmployeeRejection({
                actorId: actor.id,
                actorName,
                employeeId: user.id,
                employeeName,
            });
        }

        revalidatePath("/admin/employees");
        revalidatePath("/manager/employees");
        return { success: true };
    } catch (error) {
        console.error("Error rejecting employee:", error);
        return { success: false, error: "Failed to reject employee" };
    }
}

export async function updateEmployeeStatus(userId: string, employeeStatus: EmployeeStatus) {
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { employeeStatus: true, isArchived: true, archivedAt: true },
        });

        if (!user) {
            return { success: false, error: "Employee not found" };
        }

        const currentStatus = user.employeeStatus;
        const newIsArchived = isArchivedStatus(employeeStatus);
        const wasArchived = user.isArchived;

        const updateData: Prisma.UserUpdateInput = { 
            employeeStatus,
            isArchived: newIsArchived,
        };

        // If transitioning to archived status, set archivedAt timestamp
        if (newIsArchived && !wasArchived) {
            updateData.archivedAt = new Date();
        }

        // If reactivating from archive, clear the archivedAt timestamp
        if (!newIsArchived && wasArchived) {
            updateData.archivedAt = null;
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            include: {
                branch: true,
                department: true,
                designation: true,
            },
        });

        revalidatePath("/admin/employees");
        revalidatePath("/admin/archived-employees");
        revalidatePath(`/admin/employees/${userId}`);
        revalidatePath("/manager/employees");
        revalidatePath("/manager/employees/archived");

        // Log the status change
        if (newIsArchived && !wasArchived) {
            console.log(`Employee ${userId} archived with status ${employeeStatus}`);
        } else if (!newIsArchived && wasArchived) {
            console.log(`Employee ${userId} reactivated from archive to status ${employeeStatus}`);
        }

        return { success: true, user: updatedUser };
    } catch (error) {
        console.error("Error updating employee status:", error);
        return { success: false, error: "Failed to update employee status" };
    }
}

export async function updatePayrollContinuationMonths(userId: string, months: number) {
    try {
        const actor = await getDbUser();
        const isAuthorized = !!actor && (["SUPERADMIN", "HR"].includes(actor.role) || (actor.role === "EMPLOYEE" && actor.isManager));

        if (!isAuthorized) {
            return { success: false, error: "Unauthorized" };
        }

        // Validate months is non-negative integer
        if (!Number.isInteger(months) || months < 0) {
            return { success: false, error: "Payroll continuation months must be a non-negative integer" };
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: { payrollContinuationMonths: months },
            include: {
                branch: true,
                department: true,
                designation: true,
            },
        });

        revalidatePath(`/admin/employees/${userId}`);
        revalidatePath(`/manager/employees/${userId}`);
        revalidatePath("/admin/archived-employees");

        return { success: true, user };
    } catch (error) {
        console.error("Error updating payroll continuation months:", error);
        return { success: false, error: "Failed to update payroll continuation months" };
    }
}

export async function assignBranch(userId: string, branchId: string | null) {
    try {
        const user = await prisma.user.update({
            where: { id: userId },
            data: { branchId },
        });
        revalidatePath("/admin/employees");
        return { success: true, user };
    } catch (error) {
        console.error("Error assigning branch:", error);
        return { success: false, error: "Failed to assign branch" };
    }
}

export async function updateWorkingDaysInMonth(userId: string, workingDaysInMonth: number) {
    try {
        const normalizedWorkingDays = Math.max(0, Math.min(31, Math.floor(workingDaysInMonth)));
        const user = await prisma.user.update({
            where: { id: userId },
            data: { workingDaysInMonth: normalizedWorkingDays }
        });
        revalidatePath(`/admin/employees/${userId}`);
        return { success: true, user };
    } catch (error) {
        console.error("Error updating working days in month:", error);
        return { success: false, error: "Failed to update working days" };
    }
}

export async function updateEmployeeDocumentLinks(
    userId: string,
    links: {
        loanPapersLink?: string | null;
        nomineesPapersLink?: string | null;
        emergencyContactLink?: string | null;
        personalInfoLink?: string | null;
    }
) {
    try {
        const actor = await getDbUser();
        const isAuthorized = !!actor && (
            actor.role === "SUPERADMIN" ||
            (actor.role === "EMPLOYEE" && actor.isManager)
        );

        if (!isAuthorized) {
            return { success: false, error: "Unauthorized" };
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: {
                loanPapersLink: links.loanPapersLink ?? null,
                nomineesPapersLink: links.nomineesPapersLink ?? null,
                emergencyContactLink: links.emergencyContactLink ?? null,
                personalInfoLink: links.personalInfoLink ?? null,
            },
        });

        revalidatePath(`/admin/employees/${userId}`);
        revalidatePath(`/admin/admin/employees/${userId}`);
        revalidatePath(`/manager/employees/${userId}`);
        revalidatePath(`/manager/manager/employees/${userId}`);

        return { success: true, user };
    } catch (error) {
        console.error("Error updating employee document links:", error);
        return { success: false, error: "Failed to update document links" };
    }
}

export async function updateEmployeeProfile(userId: string, data: {
    role?: Role;
    branchId?: string | null;
    departmentId?: string | null;
    designationId?: string | null;
}) {
    try {
        const actor = await getDbUser();
        const isAuthorized = !!actor && (["SUPERADMIN", "HR"].includes(actor.role) || (actor.role === "EMPLOYEE" && actor.isManager));

        if (!isAuthorized) {
            return { success: false, error: "Unauthorized" };
        }

        const employee = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, firstName: true, lastName: true, email: true },
        });

        if (!employee) {
            return { success: false, error: "Employee not found" };
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data,
        });

        if (actor.role === "EMPLOYEE" && actor.isManager) {
            const actorName = [actor.firstName, actor.lastName].filter(Boolean).join(" ") || actor.email;
            const employeeName = [employee.firstName, employee.lastName].filter(Boolean).join(" ") || employee.email;
            const changeKeys = Object.keys(data).join(", ");

            await logManagerEmployeeEditAction({
                actorId: actor.id,
                actorName,
                action: "UPDATED",
                area: "employee_employment",
                employeeId: employee.id,
                employeeName,
                details: changeKeys ? `fields=${changeKeys}` : undefined,
            });
        }

        revalidatePath("/admin/employees");
        revalidatePath(`/admin/employees/${userId}`);
        revalidatePath("/manager/employees");
        revalidatePath(`/manager/employees/${userId}`);
        return { success: true, user };
    } catch (error) {
        console.error("Error updating employee profile:", error);
        return { success: false, error: "Failed to update profile" };
    }
}

// Legacy function - kept for backward compatibility
export async function updateUserStatus(userId: string, status: UserStatus) {
    if (status === "APPROVED") {
        return { success: false, error: "Approval requires branch and base salary" };
    }

    try {
        const user = await prisma.user.update({
            where: { id: userId },
            data: { status },
        });
        revalidatePath("/admin/employees");
        return { success: true, user };
    } catch (error) {
        console.error("Error updating user status:", error);
        return { success: false, error: "Failed to update status" };
    }
}
