"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { ValueType } from "@prisma/client";
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
                foodAllowance: 0,
                mobileAllowance: 0,
            },
        });
    }

    return settings;
}

export async function updateSystemSettings(data: {
    medicalClaimLimit: number;
    foodAllowance: number;
    mobileAllowance: number;
}) {
    const user = await getDbUser();
    if (!user || user.role !== "SUPERADMIN") throw new Error("Unauthorized");

    const settings = await prisma.systemSettings.upsert({
        where: { id: "global" },
        update: data,
        create: { id: "global", ...data },
    });

    revalidatePath("/admin/settings");
    return { success: true, settings };
}

/**
 * Allowance Types CRUD with Branch Targeting
 */
export async function getAllowanceTypes() {
    return await prisma.allowanceType.findMany({
        include: { branches: true },
        orderBy: { createdAt: "desc" },
    });
}

export async function createAllowanceType(data: {
    name: string;
    amount: number;
    type: ValueType;
    branchIds: string[];
}) {
    const user = await getDbUser();
    if (!user || user.role !== "SUPERADMIN") throw new Error("Unauthorized");

    try {
        const allowance = await prisma.allowanceType.create({
            data: {
                name: data.name,
                amount: data.amount,
                type: data.type,
                branches: {
                    connect: data.branchIds.map((id) => ({ id })),
                },
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
    type: ValueType;
    branchIds: string[];
}) {
    const user = await getDbUser();
    if (!user || user.role !== "SUPERADMIN") throw new Error("Unauthorized");

    try {
        const allowance = await prisma.allowanceType.update({
            where: { id },
            data: {
                name: data.name,
                amount: data.amount,
                type: data.type,
                branches: {
                    set: data.branchIds.map((id) => ({ id })),
                },
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
    if (!user || user.role !== "SUPERADMIN") throw new Error("Unauthorized");

    await prisma.allowanceType.update({
        where: { id },
        data: { isActive },
    });
    revalidatePath("/admin/settings");
    return { success: true };
}

export async function deleteAllowanceType(id: string) {
    const user = await getDbUser();
    if (!user || user.role !== "SUPERADMIN") throw new Error("Unauthorized");

    await prisma.allowanceType.delete({ where: { id } });
    revalidatePath("/admin/settings");
    return { success: true };
}
