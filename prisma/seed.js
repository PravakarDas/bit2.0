import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
    // 1. Get a user
    const user = await prisma.user.findFirst();

    if (!user) {
        console.log("No users found. Please sign in first to create a user record.");
        return;
    }

    console.log(`Creating pending loans for user: ${user.email}`);

    // 2. Create some pending loans
    await prisma.loan.createMany({
        data: [
            {
                userId: user.id,
                issuedAmount: 50000,
                remainingPrincipal: 50000,
                gracePeriodMonths: 6,
                totalMonths: 12,
                status: "PENDING",
            },
            {
                userId: user.id,
                issuedAmount: 120000,
                remainingPrincipal: 120000,
                gracePeriodMonths: 3,
                totalMonths: 24,
                status: "PENDING",
            },
        ],
    });

    // 3. Notification Engine (Phase 10): ensure the LOAN_APPROVED/EMAIL
    // template exists. Idempotent — skipped if an active version is already
    // registered. Placeholders match the payload `approveLoan()` (loan.actions.ts)
    // raises: `employee.name`, `amount`, `approvedBy` — see BusinessIntegrationReport.md.
    const existingTemplate = await prisma.notificationTemplate.findFirst({
        where: { key: "LOAN_APPROVED", channel: "EMAIL", isActive: true },
    });

    if (!existingTemplate) {
        await prisma.notificationTemplate.create({
            data: {
                key: "LOAN_APPROVED",
                channel: "EMAIL",
                subjectTemplate: "Your loan has been approved",
                bodyTemplateHtml: "<p>Hi {{employee.name}},</p><p>Your loan of ৳{{amount}} has been approved by {{approvedBy}}.</p>",
                bodyTemplateText: "Hi {{employee.name}}, your loan of ৳{{amount}} has been approved by {{approvedBy}}.",
                version: 1,
                isActive: true,
            },
        });
        console.log("Created LOAN_APPROVED/EMAIL notification template.");
    } else {
        console.log("LOAN_APPROVED/EMAIL notification template already exists — skipped.");
    }

    console.log("Seed successful!");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
