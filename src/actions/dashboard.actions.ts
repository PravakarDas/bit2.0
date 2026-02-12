"use server";

import { prisma } from "@/lib/prisma";
import { getDbUser } from "./user.actions";
import { Prisma } from "@prisma/client";

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

export async function getAdminDashboardData(branchId?: string, fromDate?: string, toDate?: string) {
    // Default date range to current year if not provided
    const currentYear = new Date().getFullYear();
    const startDate = fromDate ? new Date(fromDate) : new Date(currentYear, 0, 1);
    const endDate = toDate ? new Date(toDate) : new Date(currentYear, 11, 31);
    
    // Common filter conditions
    const employeeFilter = {
        status: "APPROVED" as const,
        isArchived: false,
        role: { not: "SUPERADMIN" as const },
        ...(branchId && branchId !== 'all' ? { branchId } : {})
    };
    
    const dateFilter = {
        createdAt: {
            gte: startDate,
            lte: endDate
        }
    };

    const [
        // Basic Stats
        totalEmployees,
        pendingEmployees,
        totalLoans,
        activeBranches,
        activeBonuses,
        totalPayrollThisMonth,
        totalMedicalClaims,
        
        // Enhanced Analytics
        departmentDistribution,
        monthlyPayrollTrends,
        medicalClaimsVsEntitlements,
        loanRepaymentData,
        leaveUtilization,
        weeklyAttendanceData,
        lateCheckInPenalties,
        branchComparison
    ] = await Promise.all([
        // Total Approved Employees
        prisma.user.count({ where: employeeFilter }),

        // Pending Employees
        prisma.user.count({
            where: { 
                status: "PENDING",
                role: { not: "SUPERADMIN" },
                ...(branchId && branchId !== 'all' ? { branchId } : {})
            }
        }),

        // Active Loans
        prisma.loan.aggregate({
            where: { 
                status: "ACTIVE",
                user: employeeFilter
            },
            _sum: { remainingPrincipal: true, issuedAmount: true },
            _count: { id: true }
        }),

        // Active Branches
        prisma.branch.count({ where: { isActive: true } }),

        // Active Bonuses
        prisma.bonusType.count({ where: { isActive: true } }),

        // This Month's Payroll
        prisma.salaryPayment.aggregate({
            where: {
                month: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
                user: employeeFilter
            },
            _sum: { netAmount: true },
            _count: { id: true }
        }),

        // Medical Claims in date range
        prisma.medicalClaim.aggregate({
            where: {
                ...dateFilter,
                user: employeeFilter
            },
            _sum: { amount: true },
            _count: { id: true }
        }),

        // Department Distribution
        prisma.user.groupBy({
            by: ['departmentId'],
            where: employeeFilter,
            _count: { id: true }
        }).then(async (groups) => {
            const departments = await prisma.department.findMany({
                where: { 
                    id: { in: groups.map(g => g.departmentId).filter(Boolean) as string[] }
                }
            });
            return groups.map(group => ({
                department: departments.find(d => d.id === group.departmentId)?.name || 'No Department',
                count: group._count.id
            }));
        }),

        // Monthly Payroll Trends (Last 6 months)
        Promise.all(
            Array.from({ length: 6 }, (_, i) => {
                const date = new Date();
                date.setMonth(date.getMonth() - i);
                const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                
                return prisma.salaryPayment.aggregate({
                    where: {
                        month,
                        user: employeeFilter
                    },
                    _sum: { netAmount: true },
                    _count: { id: true }
                }).then(result => ({
                    month,
                    amount: result._sum.netAmount || 0,
                    count: result._count
                }));
            })
        ).then(results => results.reverse()),

        // Medical Claims vs Entitlements
        prisma.$queryRaw`
            SELECT 
                COALESCE(SUM(mc.amount), 0) as totalClaims,
                COALESCE(SUM(me."totalLimit"), 0) as totalEntitlements,
                COALESCE(SUM(me."remainingBalance"), 0) as remainingBalance
            FROM "User" u
            LEFT JOIN "MedicalClaim" mc ON u.id = mc."userId" AND mc."createdAt" >= ${startDate} AND mc."createdAt" <= ${endDate}
            LEFT JOIN "MedicalEntitlement" me ON u.id = me."userId" AND me.year = ${currentYear}
            WHERE u.status = 'APPROVED' AND u."isArchived" = false AND u.role != 'SUPERADMIN'
            ${branchId && branchId !== 'all' ? Prisma.sql`AND u."branchId" = ${branchId}` : Prisma.empty}
        `,

        // Loan Repayment Progress
        prisma.loan.findMany({
            where: {
                status: "ACTIVE",
                user: employeeFilter
            },
            select: {
                id: true,
                issuedAmount: true,
                remainingPrincipal: true,
                totalMonths: true,
                createdAt: true,
                user: { select: { email: true } }
            }
        }).then(loans => loans.map(loan => {
            const monthsPassed = Math.floor(
                (Date.now() - loan.createdAt.getTime()) / (30 * 24 * 60 * 60 * 1000)
            );
            const progressPercent = ((loan.issuedAmount - loan.remainingPrincipal) / loan.issuedAmount) * 100;
            return {
                id: loan.id,
                employee: loan.user.email,
                totalAmount: loan.issuedAmount,
                remaining: loan.remainingPrincipal,
                progressPercent: Math.round(progressPercent),
                monthsPassed,
                totalMonths: loan.totalMonths
            };
        })),

        // Leave Utilization
        prisma.$queryRaw`
            SELECT 
                lt.name as leaveType,
                COALESCE(ule."allocatedDays", 0) as allocated,
                COALESCE(ule."usedDays", 0) as used,
                COALESCE((ule."allocatedDays" - ule."usedDays"), 0) as remaining
            FROM "LeaveType" lt
            LEFT JOIN "UserLeaveEntitlement" ule ON lt.id = ule."leaveTypeId"
            LEFT JOIN "User" u ON ule."userId" = u.id
            WHERE ule.year = ${currentYear}
            ${branchId && branchId !== 'all' ? Prisma.sql`AND u."branchId" = ${branchId}` : Prisma.empty}
            GROUP BY lt.name, ule."allocatedDays", ule."usedDays"
        `,

        // Weekly Attendance Data (Current Week)
        (() => {
            const now = new Date();
            const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 1)); // Monday
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6); // Sunday
            
            return prisma.dailyTimeRecord.findMany({
                where: {
                    date: {
                        gte: startOfWeek,
                        lte: endOfWeek
                    },
                    user: employeeFilter
                },
                include: {
                    user: { 
                        select: { 
                            email: true, 
                            department: { select: { name: true } }
                        } 
                    }
                }
            });
        })(),

        // Late Check-in Penalties
        prisma.dailyTimeRecord.groupBy({
            by: ['userId'],
            where: {
                ...dateFilter,
                lateCheckInPenalty: { gt: 0 },
                user: employeeFilter
            },
            _sum: {
                lateCheckInPenalty: true,
                lateCheckInMinutes: true
            },
            _count: { id: true }
        }).then(async (groups) => {
            const userIds = groups.map(g => g.userId);
            const users = await prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, email: true, department: { select: { name: true } } }
            });
            
            return groups.map(group => {
                const user = users.find(u => u.id === group.userId);
                return {
                    employee: user?.email || 'Unknown',
                    department: user?.department?.name || 'No Department',
                    totalPenalty: group._sum.lateCheckInPenalty || 0,
                    totalLateMinutes: group._sum.lateCheckInMinutes || 0,
                    lateInstances: group._count.id
                };
            });
        }),

        // Branch Comparison (if no specific branch selected)
        branchId === 'all' || !branchId ? 
            prisma.branch.findMany({
                where: { isActive: true },
                select: {
                    id: true,
                    name: true,
                    _count: { select: { users: true } },
                    users: {
                        where: { status: "APPROVED", isArchived: false },
                        select: {
                            salaryPayments: {
                                where: {
                                    month: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
                                },
                                select: { netAmount: true }
                            }
                        }
                    }
                }
            }).then(branches => branches.map(branch => ({
                branch: branch.name,
                employees: branch._count.users,
                monthlyPayroll: branch.users.reduce((sum, user) => 
                    sum + (user.salaryPayments[0]?.netAmount || 0), 0
                )
            }))) : 
            Promise.resolve([])
    ]);

    return {
        // Basic Stats
        totalEmployees,
        pendingEmployees,
        activeLoanAmount: totalLoans._sum.remainingPrincipal || 0,
        activeLoanCount: totalLoans._count,
        totalLoanAmount: totalLoans._sum.issuedAmount || 0,
        activeBranches,
        activeBonuses,
        monthlyPayrollAmount: totalPayrollThisMonth._sum.netAmount || 0,
        monthlyPayrollCount: totalPayrollThisMonth._count,
        totalMedicalClaimsAmount: totalMedicalClaims._sum.amount || 0,
        totalMedicalClaimsCount: totalMedicalClaims._count,
        
        // Enhanced Analytics
        departmentDistribution,
        monthlyPayrollTrends,
        medicalClaimsVsEntitlements,
        loanRepaymentData,
        leaveUtilization,
        weeklyAttendanceData,
        lateCheckInPenalties,
        branchComparison,
        
        // Meta
        dateRange: { from: startDate.toISOString(), to: endDate.toISOString() },
        selectedBranch: branchId || 'all'
    };
}

export async function getAllBranches() {
    return await prisma.branch.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' }
    });
}
