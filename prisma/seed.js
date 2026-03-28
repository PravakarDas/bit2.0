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
