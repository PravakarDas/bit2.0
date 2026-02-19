"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getDbUser } from "./user.actions";
import { getSystemSettings } from "./settings.actions";
import { ClaimStatus } from "@prisma/client";
import { validateAndSubmitClaim } from "@/lib/services/medical.service";

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
        const claim = await validateAndSubmitClaim(user.id, data);

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

        await tx.auditLog.create({
            data: {
                changeReason: `Medical Claim Approved: ${claim.amount} for user ${claim.userId} (Year: ${year})`,
                oldEmi: null,
                newEmi: null,
            }
        });

        revalidatePath("/admin/medical-claims");
        revalidatePath("/medical");
        return { success: true };
    });
}

export async function rejectMedicalClaim(claimId: string) {
    const claim = await prisma.medicalClaim.update({
        where: { id: claimId },
        data: { status: "REJECTED" },
    });

    await prisma.auditLog.create({
        data: {
            changeReason: `Medical Claim Rejected: ${claim.amount} for user ${claim.userId} (Date: ${new Date().toISOString()})`,
            oldEmi: null,
            newEmi: null,
        }
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

export async function getAllMedicalClaimsHistory() {
    const year = new Date().getFullYear();
    
    const claims = await prisma.medicalClaim.findMany({
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
                    },
                    medicalEntitlements: {
                        where: { year: year }
                    }
                }
            }
        },
        orderBy: { createdAt: "desc" },
    });

    // Calculate statistics
    const stats = {
        total: claims.length,
        pending: claims.filter(c => c.status === "PENDING").length,
        approved: claims.filter(c => c.status === "APPROVED").length,
        rejected: claims.filter(c => c.status === "REJECTED").length,
        totalAmount: claims.reduce((sum, c) => sum + Number(c.amount), 0),
        approvedAmount: claims.filter(c => c.status === "APPROVED").reduce((sum, c) => sum + Number(c.amount), 0),
    };

    return { claims, stats };
}

export async function getAllEmployeeMedicalEntitlements() {
    const currentYear = new Date().getFullYear();
    
    const entitlements = await prisma.medicalEntitlement.findMany({
        where: {
            year: currentYear
        },
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
            },
            claims: {
                where: {
                    status: "APPROVED"
                },
                orderBy: {
                    createdAt: "desc"
                }
            }
        },
        orderBy: {
            createdAt: "desc"
        }
    });

    // Calculate totals used from approved claims
    const entitlementsWithStats = entitlements.map(entitlement => {
        const totalClaimed = entitlement.claims.reduce((sum, claim) => sum + Number(claim.amount), 0);
        const claimsCount = entitlement.claims.length;
        
        return {
            ...entitlement,
            totalClaimed,
            claimsCount,
            utilizationPercentage: entitlement.totalLimit > 0 
                ? ((totalClaimed / entitlement.totalLimit) * 100).toFixed(1)
                : "0.0"
        };
    });

    return entitlementsWithStats;
}

