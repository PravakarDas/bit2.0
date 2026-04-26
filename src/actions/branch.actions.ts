"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getDbUser } from "./user.actions";
import { logManagerOrganizationAction } from "./manager-organization.actions";

function canManageOrganization(user: Awaited<ReturnType<typeof getDbUser>>) {
    return !!user && (user.role === "SUPERADMIN" || (user.role === "EMPLOYEE" && user.isManager));
}

const HH_MM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function normalizeHHMM(value: string | undefined, fallback: string): string {
    if (typeof value !== "string") {
        return fallback;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return fallback;
    }

    if (HH_MM_REGEX.test(trimmed)) {
        return trimmed;
    }

    const longFormatMatch = trimmed.match(/^([01]\d|2[0-3]):([0-5]\d):[0-5]\d(?:\.\d+)?$/);
    if (longFormatMatch) {
        return `${longFormatMatch[1]}:${longFormatMatch[2]}`;
    }

    throw new Error(`Invalid time format: ${trimmed}. Expected HH:mm`);
}

async function notifyIfManager(params: {
    user: NonNullable<Awaited<ReturnType<typeof getDbUser>>>;
    action: "CREATED" | "UPDATED" | "DELETED" | "ACTIVATED" | "DEACTIVATED";
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

function isMissingLoanToggleColumnError(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
        return false;
    }

    if (error.code !== "P2022") {
        return false;
    }

    const column =
        typeof error.meta?.column === "string"
            ? error.meta.column
            : typeof error.message === "string"
              ? error.message
              : "";

    return column.includes("Branch.isLoanApplicationEnabled");
}

export async function getBranches() {
    try {
        return await prisma.branch.findMany({
            orderBy: { name: "asc" },
        });
    } catch (error) {
        if (!isMissingLoanToggleColumnError(error)) {
            throw error;
        }

        const legacyBranches = await prisma.branch.findMany({
            orderBy: { name: "asc" },
            select: {
                id: true,
                name: true,
                location: true,
                isActive: true,
                checkInTime: true,
                checkOutTime: true,
                breakDuration: true,
                weeklyOffDays: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        return legacyBranches.map((branch) => ({
            ...branch,
            isLoanApplicationEnabled: true,
        }));
    }
}

export async function getActiveBranches() {
    try {
        return await prisma.branch.findMany({
            where: { isActive: true },
            orderBy: { name: "asc" },
        });
    } catch (error) {
        if (!isMissingLoanToggleColumnError(error)) {
            throw error;
        }

        const legacyBranches = await prisma.branch.findMany({
            where: { isActive: true },
            orderBy: { name: "asc" },
            select: {
                id: true,
                name: true,
                location: true,
                isActive: true,
                checkInTime: true,
                checkOutTime: true,
                breakDuration: true,
                weeklyOffDays: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        return legacyBranches.map((branch) => ({
            ...branch,
            isLoanApplicationEnabled: true,
        }));
    }
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
        const checkInTime = normalizeHHMM(data.checkInTime, "09:00");
        const checkOutTime = normalizeHHMM(data.checkOutTime, "18:00");
        const breakDuration = normalizeHHMM(data.breakDuration, "01:00");

        const branch = await prisma.branch.create({
            data: {
                name: data.name,
                location: data.location,
                checkInTime,
                checkOutTime,
                breakDuration,
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
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to create branch",
        };
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

export async function toggleBranchLoanApplication(id: string, isLoanApplicationEnabled: boolean) {
    const user = await getDbUser();
    if (!canManageOrganization(user)) {
        throw new Error("Unauthorized");
    }

    try {
        const branch = await prisma.branch.update({
            where: { id },
            data: { isLoanApplicationEnabled },
        });

        await notifyIfManager({
            user: user!,
            action: "UPDATED",
            entityId: branch.id,
            entityName: branch.name,
            details: `loan applications ${isLoanApplicationEnabled ? "enabled" : "disabled"}`,
        });

        revalidatePath("/admin/organization");
        revalidatePath("/manager/organization");
        revalidatePath("/loans");
        return { success: true, branch };
    } catch (error) {
        console.error("Error toggling branch loan application status:", error);
        if (isMissingLoanToggleColumnError(error)) {
            return {
                success: false,
                error: "Loan toggle column is missing in the database. Please run the latest Prisma migration.",
            };
        }
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to update loan application setting",
        };
    }
}

export async function toggleAllBranchesLoanApplication(isLoanApplicationEnabled: boolean) {
    const user = await getDbUser();
    if (!canManageOrganization(user)) {
        throw new Error("Unauthorized");
    }

    try {
        const result = await prisma.branch.updateMany({
            data: { isLoanApplicationEnabled },
        });

        await notifyIfManager({
            user: user!,
            action: "UPDATED",
            entityId: "all-branches",
            entityName: "All Branches",
            details: `loan applications ${isLoanApplicationEnabled ? "enabled" : "disabled"} for ${result.count} branches`,
        });

        revalidatePath("/admin/organization");
        revalidatePath("/manager/organization");
        revalidatePath("/loans");
        return { success: true, updatedCount: result.count };
    } catch (error) {
        console.error("Error toggling all branches loan application status:", error);
        if (isMissingLoanToggleColumnError(error)) {
            return {
                success: false,
                error: "Loan toggle column is missing in the database. Please run the latest Prisma migration.",
            };
        }
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to update all branches loan setting",
        };
    }
}

export async function deleteBranch(id: string) {
    const user = await getDbUser();
    if (!canManageOrganization(user)) {
        throw new Error("Unauthorized");
    }

    try {
        const branch = await prisma.branch.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                _count: {
                    select: {
                        users: true,
                    },
                },
            },
        });

        if (!branch) {
            return { success: false, error: "Branch not found" };
        }

        if (branch._count.users > 0) {
            return { success: false, error: "Cannot delete branch with assigned employees" };
        }

        await prisma.branch.delete({
            where: { id },
        });

        await notifyIfManager({
            user: user!,
            action: "DELETED",
            entityId: branch.id,
            entityName: branch.name,
        });

        revalidatePath("/admin/organization");
        revalidatePath("/manager/organization");
        return { success: true };
    } catch (error) {
        console.error("Error deleting branch:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to delete branch",
        };
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
        const checkInTime = normalizeHHMM(data.checkInTime, "09:00");
        const checkOutTime = normalizeHHMM(data.checkOutTime, "18:00");
        const breakDuration = normalizeHHMM(data.breakDuration, "01:00");

        const branch = await prisma.branch.update({
            where: { id: branchId },
            data: {
                checkInTime,
                checkOutTime,
                breakDuration,
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
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to update branch timeline settings",
        };
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
        const checkInTime = normalizeHHMM(data.checkInTime, "09:00");
        const checkOutTime = normalizeHHMM(data.checkOutTime, "18:00");
        const breakDuration = normalizeHHMM(data.breakDuration, "01:00");

        const branch = await prisma.branch.update({
            where: { id },
            data: {
                name: data.name,
                location: data.location,
                checkInTime,
                checkOutTime,
                breakDuration,
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
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to update branch",
        };
    }
}
