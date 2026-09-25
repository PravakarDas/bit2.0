"use server";

import { prisma } from "@/lib/prisma";

export async function getEmployeeContacts() {
    return prisma.user.findMany({
        where: {
            status: "APPROVED",
            isArchived: false,
            role: { not: "SUPERADMIN" }
        },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            personalEmail: true,
            phoneNumber: true,
            branch: {
                select: {
                    id: true,
                    name: true
                }
            }
        },
        orderBy: [
            { branch: { name: "asc" } },
            { firstName: "asc" },
            { lastName: "asc" }
        ]
    });
}
