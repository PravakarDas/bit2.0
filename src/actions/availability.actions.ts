"use server";

import { prisma } from "@/lib/prisma";

export async function getAvailabilityData(year: number, month: number) {
    const monthIndex = Math.max(0, Math.min(11, month - 1));
    const startDate = new Date(year, monthIndex, 1);
    const endDate = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const leaveStart = startDate > today ? startDate : today;

    const [employees, leaveApplications, holidays] = await Promise.all([
        prisma.user.findMany({
            where: {
                status: "APPROVED",
                isArchived: false,
                role: { not: "SUPERADMIN" }
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                personalEmail: true,
                phoneNumber: true,
                branch: {
                    select: {
                        id: true,
                        name: true,
                        weeklyOffDays: true
                    }
                }
            },
            orderBy: [
                { firstName: "asc" },
                { lastName: "asc" },
                { email: "asc" }
            ]
        }),
        prisma.leaveApplication.findMany({
            where: {
                status: "APPROVED",
                leaveDate: {
                    gte: leaveStart,
                    lte: endDate
                }
            },
            select: {
                userId: true,
                leaveDate: true,
                leaveType: {
                    select: {
                        name: true
                    }
                }
            }
        }),
        prisma.publicHoliday.findMany({
            where: {
                isActive: true,
                date: {
                    gte: startDate,
                    lte: endDate
                }
            },
            select: {
                id: true,
                name: true,
                date: true,
                appliesToAllBranches: true,
                applicableBranchIds: true
            },
            orderBy: {
                date: "asc"
            }
        })
    ]);

    const leaves = leaveApplications.map((leave) => ({
        userId: leave.userId,
        date: leave.leaveDate.toISOString(),
        leaveTypeName: leave.leaveType?.name || "Leave"
    }));

    return {
        employees,
        leaves,
        holidays: holidays.map((holiday) => ({
            id: holiday.id,
            name: holiday.name,
            date: holiday.date.toISOString(),
            appliesToAllBranches: holiday.appliesToAllBranches,
            applicableBranchIds: holiday.applicableBranchIds
        }))
    };
}
