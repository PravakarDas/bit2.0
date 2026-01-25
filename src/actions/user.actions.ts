"use server";

import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { Role, UserStatus } from "@prisma/client";

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

        // 1. Try to find user by clerkId
        let user = await prisma.user.findUnique({
            where: { clerkId: authUser.id },
        });

        if (user) {
            // Update email if it changed in Clerk
            if (user.email !== email) {
                user = await prisma.user.update({
                    where: { id: user.id },
                    data: { email },
                });
            }
            return user;
        }

        // 2. Try to find user by email (in case clerkId changed)
        user = await prisma.user.findUnique({
            where: { email },
        });

        if (user) {
            // "Claim" the user with the new clerkId
            return await prisma.user.update({
                where: { id: user.id },
                data: { clerkId: authUser.id },
            });
        }

        // 3. Create a new user if not found by either
        return await prisma.user.create({
            data: {
                clerkId: authUser.id,
                email: email,
                role: role,
                status: status,
            },
        });
    } catch (error) {
        console.error("Error syncing user with database:", error);
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
