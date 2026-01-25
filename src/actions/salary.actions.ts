"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { SalaryChangeReason } from "@prisma/client";
import { getDbUser } from "./user.actions";

export async function getSalaryHistory(userId: string) {
    return await prisma.baseSalary.findMany({
        where: { userId },
        orderBy: { effectiveFrom: "desc" },
    });
}

export async function updateEmployeeSalary(data: {
    userId: string;
    amount: number;
    reason: SalaryChangeReason;
    effectiveFrom: Date;
}) {
    const admin = await getDbUser();
    if (!admin || admin.role !== "SUPERADMIN") throw new Error("Unauthorized");

    return await prisma.$transaction(async (tx) => {
        // 1. Terminate previous active salary record
        await tx.baseSalary.updateMany({
            where: {
                userId: data.userId,
                effectiveTo: null,
            },
            data: {
                effectiveTo: data.effectiveFrom,
            },
        });

        // 2. Create new salary record
        const newSalary = await tx.baseSalary.create({
            data: {
                userId: data.userId,
                amount: data.amount,
                reason: data.reason,
                effectiveFrom: data.effectiveFrom,
            },
        });

        // 3. Update cached baseSalary in User table for quick lookups
        await tx.user.update({
            where: { id: data.userId },
            data: { baseSalary: data.amount },
        });

        return newSalary;
    });
}
