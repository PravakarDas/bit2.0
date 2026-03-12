"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { ValueType, AllowanceScope } from "@prisma/client";
import { getDbUser } from "./user.actions";

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
    if (!user || user.role !== 'SUPERADMIN') throw new Error("Unauthorized");

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

    revalidatePath("/admin/settings");
    return { success: true, settings };
}

export async function getAllowanceTypes() {
    const user = await getDbUser();
    if (!user || user.role !== "SUPERADMIN") {
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
    if (!user || user.role !== 'SUPERADMIN') throw new Error("Unauthorized");

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
        revalidatePath("/admin/settings");
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
    if (!user || user.role !== 'SUPERADMIN') throw new Error("Unauthorized");

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
        revalidatePath("/admin/settings");
        return { success: true, allowance };
    } catch (error) {
        console.error(error);
        return { success: false, error: "Failed to update allowance" };
    }
}

export async function toggleAllowanceStatus(id: string, isActive: boolean) {
    const user = await getDbUser();
    if (!user || user.role !== 'SUPERADMIN') throw new Error("Unauthorized");

    await prisma.allowanceType.update({
        where: { id },
        data: { isActive },
    });
    revalidatePath("/admin/settings");
    return { success: true };
}

export async function deleteAllowanceType(id: string) {
    const user = await getDbUser();
    if (!user || user.role !== 'SUPERADMIN') throw new Error("Unauthorized");

    await prisma.allowanceType.delete({ where: { id } });
    revalidatePath("/admin/settings");
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
