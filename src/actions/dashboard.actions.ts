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

export async function getAdminDashboardData() {
    const [
        totalEmployees,
        pendingEmployees,
        totalLoans,
        activeBranches,
        activeBonuses,
        totalPayrollThisMonth,
        totalMedicalClaims
    ] = await Promise.all([
        // Total Approved Employees
        prisma.user.count({
            where: { 
                status: "APPROVED",
                isArchived: false,
                role: { not: "SUPERADMIN" }
            }
        }),

        // Pending Employees
        prisma.user.count({
            where: { 
                status: "PENDING",
                role: { not: "SUPERADMIN" }
            }
        }),

        // Active Loans
        prisma.loan.aggregate({
            where: { status: "ACTIVE" },
            _sum: { remainingPrincipal: true },
            _count: { id: true }
        }),

        // Active Branches
        prisma.branch.count({
            where: { isActive: true }
        }),

        // Active Bonuses
        prisma.bonusType.count({
            where: { isActive: true }
        }),

        // This Month's Payroll
        prisma.salaryPayment.aggregate({
            where: {
                month: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
            },
            _sum: { netAmount: true },
            _count: { id: true }
        }),

        // Medical Claims this year
        prisma.medicalClaim.aggregate({
            where: {
                createdAt: {
                    gte: new Date(new Date().getFullYear(), 0, 1)
                }
            },
            _sum: { amount: true },
            _count: { id: true }
        })
    ]);

    return {
        totalEmployees,
        pendingEmployees,
        activeLoanAmount: totalLoans._sum.remainingPrincipal || 0,
        activeLoanCount: totalLoans._count,
        activeBranches,
        activeBonuses,
        monthlyPayrollAmount: totalPayrollThisMonth._sum.netAmount || 0,
        monthlyPayrollCount: totalPayrollThisMonth._count,
        totalMedicalClaimsAmount: totalMedicalClaims._sum.amount || 0,
        totalMedicalClaimsCount: totalMedicalClaims._count
    };
}
