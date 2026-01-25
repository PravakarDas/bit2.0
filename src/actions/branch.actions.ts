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

export async function createBranch(data: { name: string; location: string }) {
    try {
        const branch = await prisma.branch.create({
            data,
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
