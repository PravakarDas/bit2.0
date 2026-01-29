"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { UserStatus, EmployeeStatus } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";

export async function getActiveEmployees() {
    return await prisma.user.findMany({
        where: { 
            isArchived: false,
            role: { not: "SUPERADMIN" }
        },
        include: { branch: true },
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
        include: { branch: true },
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
        include: { branch: true },
        orderBy: { updatedAt: "desc" },
    });
}

export async function approveEmployee(userId: string) {
    try {
        const user = await prisma.$transaction(async (tx) => {
            const updatedUser = await tx.user.update({
                where: { id: userId },
                data: { 
                    status: "APPROVED",
                    employeeStatus: "ACTIVE"
                },
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

export async function updateEmployeeProfile(userId: string, data: {
    role?: any;
    branchId?: string | null;
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
    return await approveEmployee(userId);
}
