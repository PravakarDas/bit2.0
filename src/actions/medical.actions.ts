"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getDbUser } from "./user.actions";
import { getSystemSettings } from "./settings.actions";
import { ClaimStatus } from "@prisma/client";

/**
 * Get current year's medical entitlement for the logged-in user.
 * Adjusts totalLimit based on current global settings.
 */
export async function getMedicalEntitlement() {
    const user = await getDbUser();
    if (!user) throw new Error("Unauthorized");

    const settings = await getSystemSettings();
    const year = new Date().getFullYear();

    let entitlement = await prisma.medicalEntitlement.findUnique({
        where: {
            userId_year: {
                userId: user.id,
                year: year,
            },
        },
    });

    if (!entitlement) {
        entitlement = await prisma.medicalEntitlement.create({
            data: {
                userId: user.id,
                year: year,
                totalLimit: settings.medicalClaimLimit,
                remainingBalance: settings.medicalClaimLimit,
            },
        });
    }

    return entitlement;
}

/**
 * Submit a new medical claim.
 */
export async function submitMedicalClaim(data: {
    amount: number;
    description: string;
    attachmentUrl?: string;
}) {
    const user = await getDbUser();
    if (!user) throw new Error("Unauthorized");

    const entitlement = await getMedicalEntitlement();

    if (data.amount > entitlement.remainingBalance) {
        return {
            success: false,
            error: `Claim amount ৳${data.amount} exceeds remaining balance of ৳${entitlement.remainingBalance}`,
        };
    }

    try {
        const claim = await prisma.medicalClaim.create({
            data: {
                userId: user.id,
                amount: data.amount,
                description: data.description,
                attachmentUrl: data.attachmentUrl,
                status: "PENDING",
                medicalEntitlementId: entitlement.id,
            },
        });

        revalidatePath("/medical");
        return { success: true, claim };
    } catch (error) {
        console.error("Error submitting claim:", error);
        return { success: false, error: "Failed to submit claim" };
    }
}

export async function getPendingMedicalClaims() {
    const year = new Date().getFullYear();
    return await prisma.medicalClaim.findMany({
        where: { status: "PENDING" },
        include: {
            user: {
                include: {
                    medicalEntitlements: {
                        where: { year: year }
                    }
                }
            }
        },
        orderBy: { createdAt: "desc" },
    });
}

export async function approveMedicalClaim(claimId: string) {
    return await prisma.$transaction(async (tx) => {
        const claim = await tx.medicalClaim.findUnique({
            where: { id: claimId },
        });

        if (!claim || claim.status !== "PENDING") {
            throw new Error("Claim not found or not pending");
        }

        const year = new Date(claim.createdAt).getFullYear();
        const entitlement = await tx.medicalEntitlement.findUnique({
            where: {
                userId_year: {
                    userId: claim.userId,
                    year: year,
                },
            },
        });

        if (!entitlement || entitlement.remainingBalance < claim.amount) {
            throw new Error("Insufficient entitlement balance");
        }

        await tx.medicalClaim.update({
            where: { id: claimId },
            data: { status: "APPROVED" },
        });

        await tx.medicalEntitlement.update({
            where: { id: entitlement.id },
            data: {
                remainingBalance: { decrement: claim.amount },
            },
        });

        revalidatePath("/admin/medical-claims");
        revalidatePath("/medical");
        return { success: true };
    });
}

export async function rejectMedicalClaim(claimId: string) {
    await prisma.medicalClaim.update({
        where: { id: claimId },
        data: { status: "REJECTED" },
    });
    revalidatePath("/admin/medical-claims");
    revalidatePath("/medical");
    return { success: true };
}

export async function getMyMedicalClaims() {
    const user = await getDbUser();
    if (!user) throw new Error("Unauthorized");

    return await prisma.medicalClaim.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
    });
}
