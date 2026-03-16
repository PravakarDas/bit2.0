"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { ValueType, AllowanceScope } from "@prisma/client";
import { getDbUser } from "./user.actions";
import { logManagerOrganizationAction } from "./manager-organization.actions";

function canManageOrganization(user: Awaited<ReturnType<typeof getDbUser>>) {
    return !!user && (user.role === "SUPERADMIN" || (user.role === "EMPLOYEE" && user.isManager));
}

async function notifyIfManager(params: {
    user: NonNullable<Awaited<ReturnType<typeof getDbUser>>>;
    action: "CREATED" | "UPDATED" | "DELETED" | "ACTIVATED" | "DEACTIVATED";
    entityType: string;
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
            entityType: params.entityType,
            entityId: params.entityId,
            entityName: params.entityName,
            details: params.details,
        });
    }
}

/**
 * Global Settings
 */
export async function getSystemSettings() {
    let settings = await prisma.systemSettings.findUnique({
        where: { id: "global" },
    });

    if (!settings) {
        settings = await prisma.systemSettings.create({
            data: {
                id: "global",
                medicalClaimLimit: 500,
            },
        });
    }

    return settings;
}

export async function updateSystemSettings(data: {
    medicalClaimLimit: number;
}) {
    const user = await getDbUser();
    if (!canManageOrganization(user)) throw new Error("Unauthorized");

    const currentYear = new Date().getFullYear();

    const settings = await prisma.systemSettings.upsert({
        where: { id: "global" },
        update: data,
        create: { id: "global", ...data },
    });

    // Update all existing medical entitlements proportionally for current year
    const existingEntitlements = await prisma.medicalEntitlement.findMany({
        where: { year: currentYear },
    });

    for (const entitlement of existingEntitlements) {
        if (entitlement.totalLimit > 0) {
            // Calculate the remaining percentage
            const remainingPercentage = entitlement.remainingBalance / entitlement.totalLimit;
            
            // Apply the same percentage to new limit
            const newRemainingBalance = data.medicalClaimLimit * remainingPercentage;
            
            await prisma.medicalEntitlement.update({
                where: { id: entitlement.id },
                data: {
                    totalLimit: data.medicalClaimLimit,
                    remainingBalance: newRemainingBalance,
                },
            });
        }
    }

    await notifyIfManager({
        user: user!,
        action: "UPDATED",
        entityType: "system settings",
        entityId: "global",
        entityName: "Global Settings",
        details: `medicalClaimLimit=${data.medicalClaimLimit}`,
    });

    revalidatePath("/admin/organization");
    revalidatePath("/manager/organization");
    return { success: true, settings };
}

export async function getAllowanceTypes() {
    const user = await getDbUser();
    if (!canManageOrganization(user)) {
        throw new Error("Unauthorized");
    }
    
    return await prisma.allowanceType.findMany({
        orderBy: { createdAt: "desc" },
    });
}

export async function createAllowanceType(data: {
    name: string;
    amount: number;
    valueType: ValueType;
    scope: AllowanceScope;
    targetBranchIds: string[];
}) {
    const user = await getDbUser();
    if (!canManageOrganization(user)) throw new Error("Unauthorized");

    try {
        const allowance = await prisma.allowanceType.create({
            data: {
                name: data.name,
                amount: data.amount,
                valueType: data.valueType,
                scope: data.scope,
                targetBranchIds: data.targetBranchIds,
            },
        });

        await notifyIfManager({
            user: user!,
            action: "CREATED",
            entityType: "allowance",
            entityId: allowance.id,
            entityName: allowance.name,
            details: `scope=${allowance.scope}, valueType=${allowance.valueType}, amount=${allowance.amount}`,
        });

        revalidatePath("/admin/organization");
        revalidatePath("/manager/organization");
        return { success: true, allowance };
    } catch (error) {
        console.error(error);
        return { success: false, error: "Failed to create allowance" };
    }
}

export async function updateAllowanceType(id: string, data: {
    name: string;
    amount: number;
    valueType: ValueType;
    scope: AllowanceScope;
    targetBranchIds: string[];
}) {
    const user = await getDbUser();
    if (!canManageOrganization(user)) throw new Error("Unauthorized");

    try {
        const allowance = await prisma.allowanceType.update({
            where: { id },
            data: {
                name: data.name,
                amount: data.amount,
                valueType: data.valueType,
                scope: data.scope,
                targetBranchIds: data.targetBranchIds,
            },
        });

        await notifyIfManager({
            user: user!,
            action: "UPDATED",
            entityType: "allowance",
            entityId: allowance.id,
            entityName: allowance.name,
            details: `scope=${allowance.scope}, valueType=${allowance.valueType}, amount=${allowance.amount}`,
        });

        revalidatePath("/admin/organization");
        revalidatePath("/manager/organization");
        return { success: true, allowance };
    } catch (error) {
        console.error(error);
        return { success: false, error: "Failed to update allowance" };
    }
}

export async function toggleAllowanceStatus(id: string, isActive: boolean) {
    const user = await getDbUser();
    if (!canManageOrganization(user)) throw new Error("Unauthorized");

    const allowance = await prisma.allowanceType.update({
        where: { id },
        data: { isActive },
    });

    await notifyIfManager({
        user: user!,
        action: isActive ? "ACTIVATED" : "DEACTIVATED",
        entityType: "allowance",
        entityId: allowance.id,
        entityName: allowance.name,
    });

    revalidatePath("/admin/organization");
    revalidatePath("/manager/organization");
    return { success: true };
}

export async function deleteAllowanceType(id: string) {
    const user = await getDbUser();
    if (!canManageOrganization(user)) throw new Error("Unauthorized");

    const allowance = await prisma.allowanceType.findUnique({
        where: { id },
        select: { id: true, name: true },
    });

    await prisma.allowanceType.delete({ where: { id } });

    if (allowance) {
        await notifyIfManager({
            user: user!,
            action: "DELETED",
            entityType: "allowance",
            entityId: allowance.id,
            entityName: allowance.name,
        });
    }

    revalidatePath("/admin/organization");
    revalidatePath("/manager/organization");
    return { success: true };
}

export async function getEmployeeAllowances(userId: string) {
    const user = await getDbUser();
    if (!user || user.role !== "SUPERADMIN") {
        throw new Error("Unauthorized");
    }
    
    return await prisma.employeeAllowance.findMany({
        where: { userId },
        include: { allowance: true },
        orderBy: { createdAt: "desc" },
    });
}

export async function assignEmployeeAllowance(userId: string, allowanceId: string) {
    const user = await getDbUser();
    if (!user || user.role !== 'SUPERADMIN') throw new Error("Unauthorized");

    try {
        const employeeAllowance = await prisma.employeeAllowance.upsert({
            where: {
                userId_allowanceId: { userId, allowanceId }
            },
            update: { isActive: true },
            create: {
                userId,
                allowanceId,
                isActive: true,
            },
        });
        
        revalidatePath(`/admin/employee/${userId}`);
        return { success: true, employeeAllowance };
    } catch (error) {
        console.error(error);
        return { success: false, error: "Failed to assign allowance" };
    }
}

export async function removeEmployeeAllowance(userId: string, allowanceId: string) {
    const user = await getDbUser();
    if (!user || user.role !== 'SUPERADMIN') throw new Error("Unauthorized");

    try {
        await prisma.employeeAllowance.update({
            where: {
                userId_allowanceId: { userId, allowanceId }
            },
            data: { isActive: false },
        });
        
        revalidatePath(`/admin/employee/${userId}`);
        return { success: true };
    } catch (error) {
        console.error(error);
        return { success: false, error: "Failed to remove allowance" };
    }
}

export async function getCustomAllowancesForEmployee(userId: string) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { branchId: true },
    });

    if (!user) throw new Error("Employee not found");

    return await prisma.allowanceType.findMany({
        where: {
            scope: "CUSTOM",
            isActive: true,
        },
        orderBy: { name: "asc" },
    });
}
