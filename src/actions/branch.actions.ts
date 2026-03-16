"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getDbUser } from "./user.actions";
import { logManagerOrganizationAction } from "./manager-organization.actions";

function canManageOrganization(user: Awaited<ReturnType<typeof getDbUser>>) {
    return !!user && (user.role === "SUPERADMIN" || (user.role === "EMPLOYEE" && user.isManager));
}

async function notifyIfManager(params: {
    user: NonNullable<Awaited<ReturnType<typeof getDbUser>>>;
    action: "CREATED" | "UPDATED" | "ACTIVATED" | "DEACTIVATED";
    entityId: string;
    entityName: string;
    details?: string;
}) {
    if (params.user.role === "EMPLOYEE" && params.user.isManager) {
        const actorName = [params.user.firstName, params.user.lastName].filter(Boolean).join(" ") || params.user.email;
        await logManagerOrganizationAction({
            actorId: params.user.id,
            actorName,
            action: params.action,
            entityType: "branch",
            entityId: params.entityId,
            entityName: params.entityName,
            details: params.details,
        });
    }
}

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
    const user = await getDbUser();
    if (!canManageOrganization(user)) {
        throw new Error("Unauthorized");
    }

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

        await notifyIfManager({
            user: user!,
            action: "CREATED",
            entityId: branch.id,
            entityName: branch.name,
            details: `location=${branch.location}`,
        });

        revalidatePath("/admin/organization");
        revalidatePath("/manager/organization");
        return { success: true, branch };
    } catch (error) {
        console.error("Error creating branch:", error);
        return { success: false, error: "Failed to create branch" };
    }
}

export async function toggleBranchStatus(id: string, isActive: boolean) {
    const user = await getDbUser();
    if (!canManageOrganization(user)) {
        throw new Error("Unauthorized");
    }

    try {
        const branch = await prisma.branch.update({
            where: { id },
            data: { isActive },
        });

        await notifyIfManager({
            user: user!,
            action: isActive ? "ACTIVATED" : "DEACTIVATED",
            entityId: branch.id,
            entityName: branch.name,
        });

        revalidatePath("/admin/organization");
        revalidatePath("/manager/organization");
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
    const user = await getDbUser();
    if (!canManageOrganization(user)) {
        throw new Error("Unauthorized");
    }

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

        await notifyIfManager({
            user: user!,
            action: "UPDATED",
            entityId: branch.id,
            entityName: branch.name,
            details: "timeline settings updated",
        });

        revalidatePath("/admin/organization");
        revalidatePath("/manager/organization");
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
    const user = await getDbUser();
    if (!canManageOrganization(user)) {
        throw new Error("Unauthorized");
    }

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

        await notifyIfManager({
            user: user!,
            action: "UPDATED",
            entityId: branch.id,
            entityName: branch.name,
            details: `location=${branch.location}`,
        });

        revalidatePath("/admin/organization");
        revalidatePath("/manager/organization");
        return { success: true, branch };
    } catch (error) {
        console.error("Error updating branch:", error);
        return { success: false, error: "Failed to update branch" };
    }
}
