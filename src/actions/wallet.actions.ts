"use server";

import { prisma } from "@/lib/prisma";
import { WalletRequestStatus, TransactionType, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getDbUser } from "./user.actions";

export async function createWalletRequest(data: { amount: number; description: string; attachmentUrl?: string }) {
    const user = await getDbUser();
    if (!user) throw new Error("Unauthorized");

    const request = await prisma.walletRequest.create({
        data: {
            userId: user.id,
            amount: data.amount,
            description: data.description,
            attachmentUrl: data.attachmentUrl,
            status: "PENDING",
        },
    });

    revalidatePath("/wallet");
    revalidatePath("/admin/wallet");
    return request;
}

export async function getMyWalletRequests() {
    const user = await getDbUser();
    if (!user) throw new Error("Unauthorized");

    return await prisma.walletRequest.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
    });
}

export async function getAllWalletRequests() {
    const user = await getDbUser();
    if (!user || !["SUPERADMIN", "HR"].includes(user.role)) {
        throw new Error("Unauthorized");
    }

    return await prisma.walletRequest.findMany({
        orderBy: { createdAt: "desc" },
        include: { user: true },
    });
}

export async function updateWalletRequestStatus(requestId: string, status: WalletRequestStatus) {
    const admin = await getDbUser();
    if (!admin || !["SUPERADMIN", "HR"].includes(admin.role)) {
        throw new Error("Unauthorized");
    }

    const request = await prisma.walletRequest.findUnique({
        where: { id: requestId },
    });

    if (!request) throw new Error("Request not found");
    if (request.status !== "PENDING") throw new Error("Request already processed");

    const result = await prisma.$transaction(async (tx) => {
        const updatedRequest = await tx.walletRequest.update({
            where: { id: requestId },
            data: { status },
        });

        if (status === "APPROVED") {
            // Credit to wallet
            await tx.user.update({
                where: { id: request.userId },
                data: { walletBalance: { increment: request.amount } },
            });

            // Create Transaction Record
            await tx.walletTransaction.create({
                data: {
                    userId: request.userId,
                    amount: request.amount,
                    type: "REIMBURSEMENT",
                    description: `Approved Request: ${request.description} (Ref: ${request.id.slice(-6)})`,
                },
            });
        }

        return updatedRequest;
    });

    revalidatePath("/wallet");
    revalidatePath("/admin/wallet");
    return result;
}

export async function adjustWalletBalance(userId: string, amount: number, description: string) {
    const admin = await getDbUser();
    if (!admin || !["SUPERADMIN", "HR"].includes(admin.role)) {
        throw new Error("Unauthorized");
    }

    await prisma.$transaction(async (tx) => {
        await tx.user.update({
            where: { id: userId },
            data: { walletBalance: { increment: amount } },
        });

        await tx.walletTransaction.create({
            data: {
                userId,
                amount,
                type: "ADJUSTMENT",
                description,
            },
        });
    });

    revalidatePath("/admin/wallet"); // General admin wallet page
}

export async function getMyWalletTransactions() {
    const user = await getDbUser();
    if (!user) throw new Error("Unauthorized");

    return await prisma.walletTransaction.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' }
    });
}

export async function getWalletTransactionsForUser(userId: string) {
    const admin = await getDbUser();
    if (!admin || !["SUPERADMIN", "HR"].includes(admin.role)) {
        throw new Error("Unauthorized");
    }

    return await prisma.walletTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
    });
}

export async function getWalletRequestsForUser(userId: string) {
    const admin = await getDbUser();
    if (!admin || !["SUPERADMIN", "HR"].includes(admin.role)) {
        throw new Error("Unauthorized");
    }

    return await prisma.walletRequest.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
    });
}

export async function getAllWalletTransactionsHistory() {
    const admin = await getDbUser();
    if (!admin || !["SUPERADMIN", "HR"].includes(admin.role)) {
        throw new Error("Unauthorized");
    }

    const transactions = await prisma.walletTransaction.findMany({
        include: {
            user: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    department: {
                        select: {
                            name: true
                        }
                    },
                    designation: {
                        select: {
                            name: true
                        }
                    }
                }
            }
        },
        orderBy: { createdAt: "desc" }
    });

    // Calculate statistics
    const stats = {
        total: transactions.length,
        totalReimbursement: transactions.filter(t => t.type === "REIMBURSEMENT").reduce((sum, t) => sum + Number(t.amount), 0),
        totalDeduction: transactions.filter(t => t.type === "DEDUCTION").reduce((sum, t) => sum + Number(t.amount), 0),
        totalAdjustment: transactions.filter(t => t.type === "ADJUSTMENT").reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0),
        reimbursementCount: transactions.filter(t => t.type === "REIMBURSEMENT").length,
        deductionCount: transactions.filter(t => t.type === "DEDUCTION").length,
        adjustmentCount: transactions.filter(t => t.type === "ADJUSTMENT").length,
    };

    return { transactions, stats };
}

export async function getAllEmployeeWalletBalances() {
    const admin = await getDbUser();
    if (!admin || !["SUPERADMIN", "HR"].includes(admin.role)) {
        throw new Error("Unauthorized");
    }

    const users = await prisma.user.findMany({
        where: {
            role: "EMPLOYEE",
            isArchived: false
        },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            walletBalance: true,
            department: {
                select: {
                    name: true
                }
            },
            designation: {
                select: {
                    name: true
                }
            },
            walletTransactions: {
                orderBy: {
                    createdAt: "desc"
                },
                take: 5
            }
        },
        orderBy: {
            walletBalance: "desc"
        }
    });

    return users;
}

