import { getDbUser } from "@/actions/user.actions";
import { prisma } from "@/lib/prisma";
import { Role, UserStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

/**
 * Get all users with their detailed information for role management
 */
export async function getAllUsersWithDetails() {
    const admin = await getDbUser();
    if (!admin || admin.role !== "SUPERADMIN") {
        throw new Error("Unauthorized");
    }

    try {
        const users = await prisma.user.findMany({
            include: {
                branch: {
                    select: {
                        id: true,
                        name: true,
                    }
                },
                department: {
                    select: {
                        id: true,
                        name: true,
                    }
                },
                designation: {
                    select: {
                        id: true,
                        name: true,
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        return users.map(user => ({
            id: user.id,
            clerkId: user.clerkId,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            imageUrl: user.imageUrl,
            role: user.role,
            status: user.status,
            employeeStatus: user.employeeStatus,
            isArchived: user.isArchived,
            dateOfJoining: user.dateOfJoining,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            branch: user.branch,
            department: user.department,
            designation: user.designation,
        }));
    } catch (error) {
        console.error("Error fetching users:", error);
        throw new Error("Failed to fetch users");
    }
}

/**
 * Update user role with validation and logging
 */
export async function updateUserRole(userId: string, newRole: Role, reason?: string) {
    const admin = await getDbUser();
    if (!admin || admin.role !== "SUPERADMIN") {
        throw new Error("Unauthorized");
    }

    try {
        // Get current user data
        const currentUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, role: true, firstName: true, lastName: true }
        });

        if (!currentUser) {
            return { success: false, error: "User not found" };
        }

        if (currentUser.role === newRole) {
            return { success: false, error: "User already has this role" };
        }

        // Update user role
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { role: newRole, updatedAt: new Date() },
        });

        // Log the role change (we'll create a role change log model later)
        
        revalidatePath("/admin/role-management");
        revalidatePath("/admin/employees");

        return { 
            success: true, 
            user: updatedUser,
            message: `Successfully changed ${currentUser.firstName} ${currentUser.lastName}'s role from ${currentUser.role} to ${newRole}`
        };
    } catch (error) {
        console.error("Error updating user role:", error);
        return { success: false, error: "Failed to update user role" };
    }
}

/**
 * Bulk update user roles
 */
export async function bulkUpdateUserRoles(updates: Array<{ userId: string; newRole: Role }>) {
    const admin = await getDbUser();
    if (!admin || admin.role !== "SUPERADMIN") {
        throw new Error("Unauthorized");
    }

    try {
        const results = [];
        
        for (const update of updates) {
            const result = await updateUserRole(update.userId, update.newRole, "Bulk update");
            results.push({
                userId: update.userId,
                success: result.success,
                error: result.error,
            });
        }

        const successCount = results.filter(r => r.success).length;
        const errorCount = results.filter(r => !r.success).length;

        revalidatePath("/admin/role-management");

        return {
            success: true,
            message: `Bulk update completed: ${successCount} successful, ${errorCount} failed`,
            results
        };
    } catch (error) {
        console.error("Error in bulk update:", error);
        return { success: false, error: "Failed to perform bulk update" };
    }
}

/**
 * Archive/Unarchive user
 */
export async function toggleUserArchiveStatus(userId: string) {
    const admin = await getDbUser();
    if (!admin || admin.role !== "SUPERADMIN") {
        throw new Error("Unauthorized");
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, isArchived: true, firstName: true, lastName: true }
        });

        if (!user) {
            return { success: false, error: "User not found" };
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { isArchived: !user.isArchived, updatedAt: new Date() },
        });

        revalidatePath("/admin/role-management");
        revalidatePath("/admin/employees");

        return {
            success: true,
            message: `Successfully ${user.isArchived ? 'unarchived' : 'archived'} ${user.firstName} ${user.lastName}`,
            isArchived: updatedUser.isArchived
        };
    } catch (error) {
        console.error("Error toggling archive status:", error);
        return { success: false, error: "Failed to update archive status" };
    }
}

/**
 * Get role statistics
 */
export async function getRoleStatistics() {
    const admin = await getDbUser();
    if (!admin || admin.role !== "SUPERADMIN") {
        throw new Error("Unauthorized");
    }

    try {
        const stats = await prisma.user.groupBy({
            by: ['role'],
            _count: {
                _all: true,
            },
            where: {
                isArchived: false,
            },
        });

        const totalUsers = await prisma.user.count({
            where: { isArchived: false }
        });

        const archivedUsers = await prisma.user.count({
            where: { isArchived: true }
        });

        const pendingUsers = await prisma.user.count({
            where: { 
                status: UserStatus.PENDING,
                isArchived: false 
            }
        });

        return {
            roleBreakdown: stats.reduce((acc, stat) => {
                acc[stat.role] = stat._count._all;
                return acc;
            }, {} as Record<Role, number>),
            totalUsers,
            archivedUsers,
            pendingUsers,
        };
    } catch (error) {
        console.error("Error fetching role statistics:", error);
        throw new Error("Failed to fetch role statistics");
    }
}