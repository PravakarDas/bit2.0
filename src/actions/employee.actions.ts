"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { UserStatus, EmployeeStatus, SalaryChangeReason } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";
import { getDbUser } from "./user.actions";

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
    const whereClause: any = { 
        isArchived: true,
        role: { not: "SUPERADMIN" }
    };

    if (fromDate || toDate) {
        whereClause.updatedAt = {};
        if (fromDate) whereClause.updatedAt.gte = new Date(fromDate);
        if (toDate) whereClause.updatedAt.lte = new Date(toDate);
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

        revalidatePath("/admin/employees");
        return { success: true };
    } catch (error) {
        console.error("Error rejecting employee:", error);
        return { success: false, error: "Failed to reject employee" };
    }
}

export async function updateEmployeeStatus(userId: string, employeeStatus: EmployeeStatus) {
    try {
        const updateData: any = { employeeStatus };

        // If status is RESIGNED or TERMINATED, archive the employee
        if (employeeStatus === "RESIGNED" || employeeStatus === "TERMINATED") {
            updateData.isArchived = true;
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: updateData,
        });

        revalidatePath("/admin/employees");
        revalidatePath("/admin/archived-employees");
        return { success: true, user };
    } catch (error) {
        console.error("Error updating employee status:", error);
        return { success: false, error: "Failed to update employee status" };
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
    role?: any;
    branchId?: string | null;
    departmentId?: string | null;
    designationId?: string | null;
}) {
    try {
        const user = await prisma.user.update({
            where: { id: userId },
            data,
        });
        revalidatePath("/admin/employees");
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
