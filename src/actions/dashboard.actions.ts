"use server";

import { prisma } from "@/lib/prisma";
import { getDbUser } from "./user.actions";

export async function getEmployeeDashboardData() {
    const user = await getDbUser();
    if (!user) throw new Error("Unauthorized");

    const [loans, medicalEntitlement, salaryHistory, recentTransactions] = await Promise.all([
        // 1. Remaining Loan Principal
        prisma.loan.aggregate({
            where: { userId: user.id, status: "ACTIVE" },
            _sum: { remainingPrincipal: true },
        }),

        // 2. Remaining Medical Entitlement
        prisma.medicalEntitlement.findFirst({
            where: { userId: user.id, year: new Date().getFullYear() },
            select: { remainingBalance: true },
        }).then(res => res || { remainingBalance: 0 }),

        // 3. Salary History (Last 6 months)
        prisma.salaryPayment.findMany({
            where: { userId: user.id },
            orderBy: { month: "desc" },
            take: 6,
            select: { month: true, netAmount: true },
        }),

        // 4. Recent Wallet Transactions (Last 5)
        prisma.walletTransaction.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: "desc" },
            take: 5,
        }),
    ]);

    return {
        walletBalance: user.walletBalance,
        remainingLoan: loans._sum.remainingPrincipal || 0,
        remainingMedical: medicalEntitlement?.remainingBalance || 0,
        salaryHistory: salaryHistory.reverse().map((s: { month: string; netAmount: number }) => ({
            name: s.month,
            amount: s.netAmount
        })),
        recentTransactions,
    };
}
