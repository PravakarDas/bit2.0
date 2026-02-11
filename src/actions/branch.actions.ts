"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getBranches() {
    return await prisma.branch.findMany({
        orderBy: { name: "asc" },
    });
}

export async function getActiveBranches() {
    return await prisma.branch.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
    });
}

export async function createBranch(data: { 
    name: string; 
    location: string;
    checkInTime?: string;
    checkOutTime?: string;
    breakDuration?: string;
    weeklyOffDays?: string[];
}) {
    try {
        const branch = await prisma.branch.create({
            data: {
                name: data.name,
                location: data.location,
                checkInTime: data.checkInTime || "09:00",
                checkOutTime: data.checkOutTime || "18:00",
                breakDuration: data.breakDuration || "01:00",
                weeklyOffDays: data.weeklyOffDays || ["SUNDAY"]
            },
        });
        revalidatePath("/admin/branches");
        return { success: true, branch };
    } catch (error) {
        console.error("Error creating branch:", error);
        return { success: false, error: "Failed to create branch" };
    }
}

export async function toggleBranchStatus(id: string, isActive: boolean) {
    try {
        const branch = await prisma.branch.update({
            where: { id },
            data: { isActive },
        });
        revalidatePath("/admin/branches");
        return { success: true, branch };
    } catch (error) {
        console.error("Error toggling branch status:", error);
        return { success: false, error: "Failed to toggle status" };
    }
}

export async function getBranchWithDetails(id: string) {
    try {
        const branch = await prisma.branch.findUnique({
            where: { id },
            include: {
                users: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true
                    }
                },
                _count: {
                    select: {
                        users: true
                    }
                }
            }
        });
        return { success: true, branch };
    } catch (error) {
        console.error("Error fetching branch details:", error);
        return { success: false, error: "Failed to fetch branch details" };
    }
}

export async function updateBranchTimelineSettings(branchId: string, data: {
    checkInTime: string;
    checkOutTime: string;
    breakDuration: string;
    weeklyOffDays: string[];
}) {
    try {
        const branch = await prisma.branch.update({
            where: { id: branchId },
            data: {
                checkInTime: data.checkInTime,
                checkOutTime: data.checkOutTime,
                breakDuration: data.breakDuration,
                weeklyOffDays: data.weeklyOffDays
            }
        });
        revalidatePath("/admin/branches");
        return { success: true, branch };
    } catch (error) {
        console.error("Error updating branch timeline settings:", error);
        return { success: false, error: "Failed to update branch timeline settings" };
    }
}

export async function updateBranch(id: string, data: { 
    name: string; 
    location: string;
    checkInTime?: string;
    checkOutTime?: string;
    breakDuration?: string;
    weeklyOffDays?: string[];
}) {
    try {
        const branch = await prisma.branch.update({
            where: { id },
            data: {
                name: data.name,
                location: data.location,
                checkInTime: data.checkInTime || "09:00",
                checkOutTime: data.checkOutTime || "18:00",
                breakDuration: data.breakDuration || "01:00",
                weeklyOffDays: data.weeklyOffDays || ["SUNDAY"]
            },
        });
        revalidatePath("/admin/branches");
        revalidatePath("/admin/organization");
        return { success: true, branch };
    } catch (error) {
        console.error("Error updating branch:", error);
        return { success: false, error: "Failed to update branch" };
    }
}
