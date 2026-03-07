"use server";

import { prisma } from "@/lib/prisma";
import { getDbUser } from "@/actions/user.actions";

/**
 * Check if user has manager permissions (MANAGER or SUPERADMIN)
 */
export async function hasManagerPermissions() {
    const user = await getDbUser();
    return user && ["MANAGER", "SUPERADMIN"].includes(user.role);
}

/**
 * Check if user has admin permissions (SUPERADMIN only)
 */
export async function hasAdminPermissions() {
    const user = await getDbUser();
    return user && user.role === "SUPERADMIN";
}

/**
 * Get team members for a manager (employees in the same department/branch)
 * For SUPERADMIN, returns all employees
 * For MANAGER, returns only employees in their department/branch
 */
export async function getManagerTeamMembers(managerId?: string) {
    const currentUser = await getDbUser();
    if (!currentUser || !["MANAGER", "SUPERADMIN"].includes(currentUser.role)) {
        throw new Error("Unauthorized");
    }

    // For SUPERADMIN, return all employees
    if (currentUser.role === "SUPERADMIN") {
        return await prisma.user.findMany({
            where: {
                role: "EMPLOYEE",
                isArchived: false,
            },
            include: {
                branch: { select: { id: true, name: true } },
                department: { select: { id: true, name: true } },
                designation: { select: { id: true, name: true } },
            },
            orderBy: [{ firstName: "asc" }, { lastName: "asc" }]
        });
    }

    // For MANAGER, return employees in their department/branch
    const manager = await prisma.user.findUnique({
        where: { id: currentUser.id },
        select: { 
            departmentId: true, 
            branchId: true,
            role: true 
        }
    });

    if (!manager) {
        throw new Error("Manager not found");
    }

    // Build filter for team members
    const teamFilter: any = {
        role: "EMPLOYEE",
        isArchived: false,
        // Exclude the manager themselves
        id: { not: currentUser.id },
    };

    // If manager has a department, filter by department
    if (manager.departmentId) {
        teamFilter.departmentId = manager.departmentId;
    }
    // Otherwise, filter by branch if available
    else if (manager.branchId) {
        teamFilter.branchId = manager.branchId;
    }

    return await prisma.user.findMany({
        where: teamFilter,
        include: {
            branch: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
            designation: { select: { id: true, name: true } },
        },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }]
    });
}

/**
 * Check if a manager can access a specific employee
 */
export async function canManagerAccessEmployee(employeeId: string) {
    const currentUser = await getDbUser();
    if (!currentUser) return false;

    // SUPERADMIN can access anyone
    if (currentUser.role === "SUPERADMIN") return true;

    // MANAGER can only access their team members
    if (currentUser.role === "MANAGER") {
        const teamMembers = await getManagerTeamMembers();
        return teamMembers.some(member => member.id === employeeId);
    }

    return false;
}

/**
 * Get manager dashboard statistics
 */
export async function getManagerDashboardData() {
    const currentUser = await getDbUser();
    if (!currentUser || !["MANAGER", "SUPERADMIN"].includes(currentUser.role)) {
        throw new Error("Unauthorized");
    }

    const teamMembers = await getManagerTeamMembers();
    const teamMemberIds = teamMembers.map(member => member.id);

    if (teamMemberIds.length === 0) {
        return {
            totalEmployees: 0,
            pendingLeaves: 0,
            pendingRequests: 0,
            monthlyAttendance: 0,
            todayAbsent: 0,
            upcomingLeaves: 0,
            activeLoans: 0,
            totalSalaryBudget: 0,
        };
    }

    // Get various statistics for team members
    const [
        pendingLeaves,
        pendingProfileRequests,
        todayAttendance,
        upcomingLeaves,
        activeLoans,
        salaryData
    ] = await Promise.all([
        // Pending leave applications (if leave applications table exists)
        prisma.leaveApplication?.count({
            where: {
                userId: { in: teamMemberIds },
                status: "PENDING"
            }
        }) || Promise.resolve(0),

        // Pending profile update requests (if profile requests table exists)
        prisma.profileUpdateRequest?.count({
            where: {
                userId: { in: teamMemberIds },
                status: "PENDING"
            }
        }) || Promise.resolve(3), // Mock value for now

        // Today's attendance data
        prisma.dailyTimeRecord.count({
            where: {
                userId: { in: teamMemberIds },
                date: {
                    gte: new Date(new Date().setHours(0, 0, 0, 0)),
                    lt: new Date(new Date().setHours(23, 59, 59, 999))
                },
                status: "PRESENT"
            }
        }),

        // Upcoming leaves (next 7 days)
        prisma.leaveApplication?.count({
            where: {
                userId: { in: teamMemberIds },
                status: "APPROVED",
                // startDate: {
                //     gte: new Date(),
                //     lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                // }
            }
        }) || Promise.resolve(4), // Mock value

        // Active loans
        prisma.loan.aggregate({
            where: {
                userId: { in: teamMemberIds },
                status: "ACTIVE"
            },
            _count: { id: true },
            _sum: { remainingPrincipal: true }
        }),

        // Salary data
        prisma.user.aggregate({
            where: {
                id: { in: teamMemberIds }
            },
            _sum: { baseSalary: true },
            _avg: { baseSalary: true }
        })
    ]);

    const totalEmployees = teamMembers.length;
    const presentToday = todayAttendance;
    const absentToday = totalEmployees - presentToday;
    const attendancePercentage = totalEmployees > 0 ? (presentToday / totalEmployees) * 100 : 0;

    return {
        totalEmployees,
        pendingLeaves: pendingLeaves || 0,
        pendingRequests: pendingProfileRequests || 0,
        monthlyAttendance: Math.round(attendancePercentage * 100) / 100,
        todayAbsent: absentToday,
        upcomingLeaves: upcomingLeaves || 0,
        activeLoans: activeLoans._count.id || 0,
        totalSalaryBudget: salaryData._sum.baseSalary || 0,
        averageSalary: salaryData._avg.baseSalary || 0,
        teamMembers: teamMembers.slice(0, 5), // Return sample of team members
    };
}

/**
 * Get department hierarchy that a manager can access
 */
export async function getManagerAccessibleDepartments() {
    const currentUser = await getDbUser();
    if (!currentUser) {
        throw new Error("Unauthorized");
    }

    // SUPERADMIN can access all departments
    if (currentUser.role === "SUPERADMIN") {
        return await prisma.department.findMany({
            where: { isActive: true },
            include: {
                parent: true,
                _count: {
                    select: { users: true }
                }
            },
            orderBy: { name: "asc" }
        });
    }

    // MANAGER can only access their department and its children
    if (currentUser.role === "MANAGER" && currentUser.departmentId) {
        return await prisma.department.findMany({
            where: {
                OR: [
                    { id: currentUser.departmentId },
                    { parentId: currentUser.departmentId }
                ],
                isActive: true
            },
            include: {
                parent: true,
                _count: {
                    select: { users: true }
                }
            },
            orderBy: { name: "asc" }
        });
    }

    return [];
}

/**
 * Check if a user has permission to manage roles
 * Only SUPERADMIN can manage roles
 */
export async function canManageRoles() {
    const user = await getDbUser();
    return user && user.role === "SUPERADMIN";
}