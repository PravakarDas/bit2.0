"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { ValueType } from "@prisma/client";

export async function getBonusTypes() {
    return await prisma.bonusType.findMany({
        include: { branches: true },
        orderBy: { createdAt: "desc" },
    });
}

export async function createBonusType(data: {
    name: string;
    type: ValueType;
    value: number;
    branchIds: string[];
}) {
    try {
        const bonus = await prisma.bonusType.create({
            data: {
                name: data.name,
                type: data.type,
                value: data.value,
                branches: {
                    connect: data.branchIds.map((id) => ({ id })),
                },
            },
        });
        revalidatePath("/admin/bonuses");
        return { success: true, bonus };
    } catch (error) {
        console.error("Error creating bonus type:", error);
        return { success: false, error: "Failed to create bonus type" };
    }
}

export async function toggleBonusStatus(id: string, isActive: boolean) {
    try {
        const bonus = await prisma.bonusType.update({
            where: { id },
            data: { isActive },
        });
        revalidatePath("/admin/bonuses");
        return { success: true, bonus };
    } catch (error) {
        console.error("Error toggling bonus status:", error);
        return { success: false, error: "Failed to toggle status" };
    }
}
