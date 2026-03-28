"use server";

import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { Prisma, Role, UserStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

function isMissingProfessionalLinksColumn(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
        return false;
    }

    if (error.code !== "P2022") {
        return false;
    }

    const column = (error.meta as { column?: string } | undefined)?.column || "";
    return column.includes("User.fiverrLink") || column.includes("User.upworkLink");
}

async function ensureProfessionalLinksColumns() {
    await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fiverrLink" TEXT');
    await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "upworkLink" TEXT');
}

/**
 * syncUserWithDb:
 * Fetches the current user from Clerk and ensures they exist in our PostgreSQL database.
 * Hardcoded Rule: pravakar459@gmail.com becomes SUPERADMIN / APPROVED.
 * Others become EMPLOYEE / PENDING.
 */
export async function syncUserWithDb() {
    const authUser = await currentUser();

    if (!authUser) return null;

    const email = authUser.emailAddresses[0]?.emailAddress;
    if (!email) return null;

    try {
        const isSuperAdmin = email === "pravakar459@gmail.com";
        const role = isSuperAdmin ? Role.SUPERADMIN : Role.EMPLOYEE;
        const status = isSuperAdmin ? UserStatus.APPROVED : UserStatus.PENDING;

        // Extract name data from Clerk
        const firstName = authUser.firstName || null;
        const lastName = authUser.lastName || null;
        const imageUrl = authUser.imageUrl || null;

        // 1. Try to find user by clerkId
        let user = await prisma.user.findUnique({
            where: { clerkId: authUser.id },
        });

        if (user) {
            // Update email and name if they changed in Clerk
            if (user.email !== email || user.firstName !== firstName || user.lastName !== lastName || user.imageUrl !== imageUrl) {
                user = await prisma.user.update({
                    where: { id: user.id },
                    data: { 
                        email,
                        firstName,
                        lastName,
                        imageUrl
                    },
                });
                // Revalidate paths to update UI immediately
                revalidatePath("/admin/employees");
                revalidatePath(`/admin/employees/${user.id}`);
                revalidatePath("/profile");
            }
            return user;
        }

        // 2. Try to find user by email (in case clerkId changed)
        user = await prisma.user.findUnique({
            where: { email },
        });

        if (user) {
            // "Claim" the user with the new clerkId and update name
            const updatedUser = await prisma.user.update({
                where: { id: user.id },
                data: { 
                    clerkId: authUser.id,
                    firstName,
                    lastName,
                    imageUrl
                },
            });
            // Revalidate paths to update UI immediately
            revalidatePath("/admin/employees");
            revalidatePath(`/admin/employees/${updatedUser.id}`);
            revalidatePath("/profile");
            return updatedUser;
        }

        // 3. Create a new user if not found by either
        return await prisma.user.create({
            data: {
                clerkId: authUser.id,
                email: email,
                firstName,
                lastName,
                imageUrl,
                role: role,
                status: status,
            },
        });
    } catch (error) {
        console.error("Error syncing user with database:", error);

        if (isMissingProfessionalLinksColumn(error)) {
            try {
                await ensureProfessionalLinksColumns();
                return await prisma.user.findUnique({
                    where: { clerkId: authUser.id },
                });
            } catch (repairError) {
                console.error("Failed to auto-repair professional links columns:", repairError);
            }
        }

        // Fallback: final attempt to fetch by clerkId
        return await prisma.user.findUnique({
            where: { clerkId: authUser.id },
        });
    }
}

export async function getDbUser() {
    const authUser = await currentUser();
    if (!authUser) return null;

    return await prisma.user.findUnique({
        where: { clerkId: authUser.id },
    });
}

export async function getUserById(id: string) {
    return await prisma.user.findUnique({
        where: { id },
    });
}

export async function getUsers() {
    return await prisma.user.findMany({
        where: {
            status: "APPROVED",
            isArchived: false
        },
        include: {
            branch: {
                select: {
                    id: true,
                    name: true
                }
            }
        },
        orderBy: [
            { firstName: "asc" },
            { lastName: "asc" },
            { email: "asc" }
        ]
    });
}

/**
 * Toggle user manager status (for EMPLOYEE role only)
 */
export async function toggleManagerStatus(userId: string) {
    const admin = await getDbUser();
    if (!admin || admin.role !== "SUPERADMIN") {
        throw new Error("Unauthorized");
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { 
                id: true, 
                isManager: true, 
                role: true, 
                firstName: true, 
                lastName: true 
            }
        });

        if (!user) {
            return { success: false, error: "User not found" };
        }

        // Only allow manager toggle for EMPLOYEE role
        if (user.role !== "EMPLOYEE") {
            return { 
                success: false, 
                error: "Manager status can only be set for employees" 
            };
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { 
                isManager: !user.isManager, 
                updatedAt: new Date() 
            },
        });

        revalidatePath("/admin/role-management");
        revalidatePath("/admin/employees");

        return {
            success: true,
            message: `Successfully ${user.isManager ? 'removed manager status from' : 'made'} ${user.firstName} ${user.lastName} ${user.isManager ? '' : 'a manager'}`,
            isManager: updatedUser.isManager
        };
    } catch (error) {
        console.error("Error toggling manager status:", error);
        return { success: false, error: "Failed to update manager status" };
    }
}

/**
 * Change user role
 */
export async function changeUserRole(userId: string, newRole: Role) {
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

        // If changing from EMPLOYEE role, reset manager status
        const updateData: { role: Role; updatedAt: Date; isManager?: boolean } = {
            role: newRole,
            updatedAt: new Date()
        };

        if (currentUser.role === "EMPLOYEE" && newRole !== "EMPLOYEE") {
            updateData.isManager = false;
        }

        // Update user role
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
        });

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
 * Toggle user archive status
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
