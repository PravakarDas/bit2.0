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

    // 4. Notification Engine (Phase 15): ensure the LEAVE_APPROVED/LEAVE_REJECTED/
    // OVERTIME_REQUEST_APPROVED/OVERTIME_REQUEST_DECLINED EMAIL templates exist.
    // Idempotent, same pattern as LOAN_APPROVED above. Placeholders match the
    // payload leave.actions.ts/overtime-request.actions.ts raise — see
    // BusinessEventsIntegrationReport.md.
    const businessEventTemplates = [
        {
            key: "LEAVE_APPROVED",
            subjectTemplate: "Your leave application has been approved",
            bodyTemplateHtml:
                "<p>Hi {{employee.name}},</p><p>Your {{leaveType}} leave on {{leaveDate}} has been approved by {{approvedBy}}.</p>",
            bodyTemplateText: "Hi {{employee.name}}, your {{leaveType}} leave on {{leaveDate}} has been approved by {{approvedBy}}.",
        },
        {
            key: "LEAVE_REJECTED",
            subjectTemplate: "Your leave application has been rejected",
            bodyTemplateHtml:
                "<p>Hi {{employee.name}},</p><p>Your {{leaveType}} leave on {{leaveDate}} has been rejected by {{rejectedBy}}.</p>",
            bodyTemplateText: "Hi {{employee.name}}, your {{leaveType}} leave on {{leaveDate}} has been rejected by {{rejectedBy}}.",
        },
        {
            key: "OVERTIME_REQUEST_APPROVED",
            subjectTemplate: "Your overtime request has been approved",
            bodyTemplateHtml:
                "<p>Hi {{employee.name}},</p><p>Your overtime request for {{totalOvertime}} hours on {{overtimeDate}} has been approved by {{approvedBy}}.</p>",
            bodyTemplateText:
                "Hi {{employee.name}}, your overtime request for {{totalOvertime}} hours on {{overtimeDate}} has been approved by {{approvedBy}}.",
        },
        {
            key: "OVERTIME_REQUEST_DECLINED",
            subjectTemplate: "Your overtime request has been declined",
            bodyTemplateHtml:
                "<p>Hi {{employee.name}},</p><p>Your overtime request for {{totalOvertime}} hours on {{overtimeDate}} has been declined by {{declinedBy}}. Reason: {{declineReason}}</p>",
            bodyTemplateText:
                "Hi {{employee.name}}, your overtime request for {{totalOvertime}} hours on {{overtimeDate}} has been declined by {{declinedBy}}. Reason: {{declineReason}}",
        },
    ];

    for (const template of businessEventTemplates) {
        const existing = await prisma.notificationTemplate.findFirst({
            where: { key: template.key, channel: "EMAIL", isActive: true },
        });

        if (!existing) {
            await prisma.notificationTemplate.create({
                data: {
                    key: template.key,
                    channel: "EMAIL",
                    subjectTemplate: template.subjectTemplate,
                    bodyTemplateHtml: template.bodyTemplateHtml,
                    bodyTemplateText: template.bodyTemplateText,
                    version: 1,
                    isActive: true,
                },
            });
            console.log(`Created ${template.key}/EMAIL notification template.`);
        } else {
            console.log(`${template.key}/EMAIL notification template already exists — skipped.`);
        }
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
