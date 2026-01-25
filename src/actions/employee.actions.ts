"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { UserStatus } from "@prisma/client";

export async function getEmployees() {
    return await prisma.user.findMany({
        include: { branch: true },
        orderBy: { createdAt: "desc" },
    });
}

export async function updateUserStatus(userId: string, status: UserStatus) {
    try {
        const user = await prisma.$transaction(async (tx) => {
            const updatedUser = await tx.user.update({
                where: { id: userId },
                data: { status },
            });

            if (status === "APPROVED") {
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
            }

            return updatedUser;
        });

        revalidatePath("/admin/employees");
        return { success: true, user };
    } catch (error) {
        console.error("Error updating user status:", error);
        return { success: false, error: "Failed to update status" };
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
