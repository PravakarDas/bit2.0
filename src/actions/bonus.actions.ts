"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { ValueType } from "@prisma/client";
import { getDbUser } from "./user.actions";
import { logManagerOrganizationAction } from "./manager-organization.actions";

function canManageOrganization(user: Awaited<ReturnType<typeof getDbUser>>) {
    return !!user && (user.role === "SUPERADMIN" || (user.role === "EMPLOYEE" && user.isManager));
}

async function notifyIfManager(params: {
    user: NonNullable<Awaited<ReturnType<typeof getDbUser>>>;
    action: "CREATED" | "ACTIVATED" | "DEACTIVATED";
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
            entityType: "bonus",
            entityId: params.entityId,
            entityName: params.entityName,
            details: params.details,
        });
    }
}

export async function getBonusTypes() {
    const user = await getDbUser();
    if (!canManageOrganization(user)) {
        throw new Error("Unauthorized");
    }

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
    const user = await getDbUser();
    if (!canManageOrganization(user)) {
        throw new Error("Unauthorized");
    }

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

        await notifyIfManager({
            user: user!,
            action: "CREATED",
            entityId: bonus.id,
            entityName: bonus.name,
            details: `type=${bonus.type}, value=${bonus.value}`,
        });

        revalidatePath("/admin/organization");
        revalidatePath("/manager/organization");
        return { success: true, bonus };
    } catch (error) {
        console.error("Error creating bonus type:", error);
        return { success: false, error: "Failed to create bonus type" };
    }
}

export async function toggleBonusStatus(id: string, isActive: boolean) {
    const user = await getDbUser();
    if (!canManageOrganization(user)) {
        throw new Error("Unauthorized");
    }

    try {
        const bonus = await prisma.bonusType.update({
            where: { id },
            data: { isActive },
        });

        await notifyIfManager({
            user: user!,
            action: isActive ? "ACTIVATED" : "DEACTIVATED",
            entityId: bonus.id,
            entityName: bonus.name,
        });

        revalidatePath("/admin/organization");
        revalidatePath("/manager/organization");
        return { success: true, bonus };
    } catch (error) {
        console.error("Error toggling bonus status:", error);
        return { success: false, error: "Failed to toggle status" };
    }
}
