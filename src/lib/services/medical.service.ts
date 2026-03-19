import { prisma } from "@/lib/prisma";

export async function checkAndCreateEntitlement(userId: string, year: number) {
    const entitlement = await prisma.medicalEntitlement.findUnique({
        where: { userId_year: { userId, year } },
    });

    if (entitlement) return entitlement;

    const settings = await prisma.systemSettings.findUnique({ where: { id: "global" } });
    const limit = settings?.medicalClaimLimit ?? 500;

    return await prisma.medicalEntitlement.create({
        data: {
            userId,
            year,
            totalLimit: limit,
            remainingBalance: limit,
        },
    });
}

export async function validateAndSubmitClaim(userId: string, data: { amount: number, description: string, attachmentUrl?: string }) {
    const year = new Date().getFullYear();
    const entitlement = await checkAndCreateEntitlement(userId, year);

    const isExceeding = data.amount > entitlement.remainingBalance;

    const claim = await prisma.medicalClaim.create({
        data: {
            userId,
            amount: data.amount,
            description: data.description,
            attachmentUrl: data.attachmentUrl,
            status: isExceeding ? "REJECTED" : "PENDING",
            medicalEntitlementId: entitlement.id,
        },
    });

    if (isExceeding) {
        await prisma.auditLog.create({
            data: {
                changeReason: `Auto-Reject Medical Claim: Exceeds annual limit for user ${userId}. Requested: ${data.amount}, Available: ${entitlement.remainingBalance}`,
                oldEmi: 0,
                newEmi: 0,
            }
        });
    }

    return claim;
}
