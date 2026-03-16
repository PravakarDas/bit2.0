"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { LeaveApplicationStatus, Prisma } from "@prisma/client";
import { getDbUser } from "./user.actions";
import { createAdminNotification } from "./notification.actions";

async function logManagerHolidayAction(params: {
    actorId: string;
    actorName: string;
    action: "CREATE" | "UPDATE" | "DELETE";
    holidayName: string;
    holidayDate: Date;
    holidayId: string;
}) {
    try {
        await prisma.auditLog.create({
            data: {
                userId: params.actorId,
                oldEmi: null,
                newEmi: null,
                changeReason: `Manager holiday ${params.action.toLowerCase()}: ${params.holidayName} on ${params.holidayDate.toISOString().split("T")[0]} (holidayId: ${params.holidayId})`,
            },
        });

        await createAdminNotification({
            type: "SYSTEM_ALERT",
            title: `Manager Holiday ${params.action}`,
            message: `${params.actorName} ${params.action.toLowerCase()}d holiday "${params.holidayName}" for ${params.holidayDate.toISOString().split("T")[0]}`,
            metadata: {
                actorId: params.actorId,
                actorName: params.actorName,
                action: params.action,
                holidayId: params.holidayId,
                holidayName: params.holidayName,
                holidayDate: params.holidayDate.toISOString(),
                source: "holiday_management",
            },
        });
    } catch (error) {
        console.error("Failed to log manager holiday action:", error);
    }
}

// Leave Types Management
export async function getActiveLeaveTypes() {
    return await prisma.leaveType.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" }
    });
}

export async function getAllLeaveTypes() {
    return await prisma.leaveType.findMany({
        orderBy: { name: "asc" }
    });
}

export async function createLeaveType(data: {
    name: string;
    allocatedDays: number;
    requiresApproval: boolean;
    leaveResetPolicy: "ROSTER_EVERY_YEAR" | "FIXED";
    applicableBranches: string[]; // Array of branch IDs
}) {
    try {
        const leaveType = await prisma.leaveType.create({
            data: {
                name: data.name,
                allocatedDays: data.allocatedDays,
                requiresApproval: data.requiresApproval,
                leaveResetPolicy: data.leaveResetPolicy,
                applicableBranches: JSON.stringify(data.applicableBranches)
            }
        });
        
        revalidatePath("/admin/leave-types");
        return { success: true, leaveType };
    } catch (error) {
        console.error("Error creating leave type:", error);
        return { success: false, error: "Failed to create leave type" };
    }
}

export async function updateLeaveType(id: string, data: {
    name?: string;
    allocatedDays?: number;
    requiresApproval?: boolean;
    leaveResetPolicy?: "ROSTER_EVERY_YEAR" | "FIXED";
    applicableBranches?: string[];
    isActive?: boolean;
}) {
    try {
        const updateData: any = { ...data };
        if (data.applicableBranches) {
            updateData.applicableBranches = JSON.stringify(data.applicableBranches);
        }
        
        const leaveType = await prisma.leaveType.update({
            where: { id },
            data: updateData
        });
        
        revalidatePath("/admin/leave-types");
        return { success: true, leaveType };
    } catch (error) {
        console.error("Error updating leave type:", error);
        return { success: false, error: "Failed to update leave type" };
    }
}

export async function toggleLeaveTypeStatus(id: string) {
    try {
        const leaveType = await prisma.leaveType.findUnique({ where: { id } });
        if (!leaveType) {
            return { success: false, error: "Leave type not found" };
        }
        
        const updated = await prisma.leaveType.update({
            where: { id },
            data: { isActive: !leaveType.isActive }
        });
        
        revalidatePath("/admin/leave-types");
        return { success: true, leaveType: updated };
    } catch (error) {
        console.error("Error toggling leave type status:", error);
        return { success: false, error: "Failed to update leave type status" };
    }
}

// User Leave Entitlements Management
export async function getUserLeaveEntitlements(userId: string, year: number = new Date().getFullYear()) {
    return await prisma.userLeaveEntitlement.findMany({
        where: {
            userId,
            year
        },
        include: {
            leaveType: true
        }
    });
}

export async function assignLeaveToUser(userId: string, leaveTypeId: string, allocatedDays?: number) {
    try {
        const currentYear = new Date().getFullYear();
        const leaveType = await prisma.leaveType.findUnique({ where: { id: leaveTypeId } });
        
        if (!leaveType) {
            return { success: false, error: "Leave type not found" };
        }
        
        const daysToAllocate = allocatedDays || leaveType.allocatedDays;
        
        // Check if entitlement already exists
        const existing = await prisma.userLeaveEntitlement.findUnique({
            where: {
                userId_leaveTypeId_year: {
                    userId,
                    leaveTypeId,
                    year: currentYear
                }
            }
        });
        
        if (existing) {
            // Update existing entitlement
            const updated = await prisma.userLeaveEntitlement.update({
                where: { id: existing.id },
                data: { allocatedDays: daysToAllocate }
            });
            
            revalidatePath("/admin/employees");
            return { success: true, entitlement: updated };
        } else {
            // Create new entitlement
            const entitlement = await prisma.userLeaveEntitlement.create({
                data: {
                    userId,
                    leaveTypeId,
                    year: currentYear,
                    allocatedDays: daysToAllocate
                }
            });
            
            revalidatePath("/admin/employees");
            return { success: true, entitlement };
        }
    } catch (error) {
        console.error("Error assigning leave to user:", error);
        return { success: false, error: "Failed to assign leave to user" };
    }
}

export async function removeLeaveFromUser(userId: string, leaveTypeId: string, year: number = new Date().getFullYear()) {
    try {
        await prisma.userLeaveEntitlement.delete({
            where: {
                userId_leaveTypeId_year: {
                    userId,
                    leaveTypeId,
                    year
                }
            }
        });
        
        revalidatePath("/admin/employees");
        return { success: true };
    } catch (error) {
        console.error("Error removing leave from user:", error);
        return { success: false, error: "Failed to remove leave from user" };
    }
}

export async function adjustUserLeaveBalance(entitlementId: string, newAllocatedDays: number) {
    try {
        const entitlement = await prisma.userLeaveEntitlement.update({
            where: { id: entitlementId },
            data: { allocatedDays: newAllocatedDays }
        });
        
        revalidatePath("/admin/employees");
        revalidatePath("/leaves");
        return { success: true, entitlement };
    } catch (error) {
        console.error("Error adjusting leave balance:", error);
        return { success: false, error: "Failed to adjust leave balance" };
    }
}

// Leave Applications
export async function applyForLeave(data: {
    leaveTypeId: string;
    leaveDate: string; // YYYY-MM-DD format
    reason?: string;
    userId: string;
}) {
    try {
        const leaveDate = new Date(data.leaveDate);
        const currentYear = leaveDate.getFullYear();
        
        // Get user with branch information
        const user = await prisma.user.findUnique({
            where: { id: data.userId },
            include: { branch: true }
        });
        
        if (!user) {
            return { success: false, error: "User not found" };
        }
        
        // Check if the selected date is a weekly holiday for this employee's branch
        if (user.branch) {
            const dayOfWeek = leaveDate.getDay(); // 0=Sunday, 6=Saturday
            const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
            const currentDayName = dayNames[dayOfWeek];
            
            if (user.branch.weeklyOffDays?.includes(currentDayName)) {
                return {
                    success: false,
                    error: `Cannot apply for leave on ${currentDayName.toLowerCase()}. This is a weekly holiday for your branch.`,
                    isWeeklyHoliday: true,
                    weeklyHolidayDay: currentDayName
                };
            }
        }
        
        // Check if user has entitlement for this leave type
        const entitlement = await prisma.userLeaveEntitlement.findUnique({
            where: {
                userId_leaveTypeId_year: {
                    userId: data.userId,
                    leaveTypeId: data.leaveTypeId,
                    year: currentYear
                }
            },
            include: {
                leaveType: true
            }
        });
        
        if (!entitlement) {
            return { success: false, error: "You don't have this leave type assigned" };
        }
        
        const remainingDays = entitlement.allocatedDays - entitlement.usedDays;
        if (remainingDays <= 0) {
            return { success: false, error: "No remaining leave days for this type" };
        }
        
        // Check if the selected date is a public holiday for the employee's branch
        const holidayWhereCondition: Prisma.PublicHolidayWhereInput = {
            date: {
                gte: new Date(leaveDate.getFullYear(), leaveDate.getMonth(), leaveDate.getDate()),
                lt: new Date(leaveDate.getFullYear(), leaveDate.getMonth(), leaveDate.getDate() + 1)
            },
            isActive: true
        };

        if (user.branchId) {
            holidayWhereCondition.OR = [
                { appliesToAllBranches: true },
                { applicableBranchIds: { has: user.branchId } }
            ];
        }

        const isHoliday = await prisma.publicHoliday.findFirst({
            where: holidayWhereCondition
        });
        
        if (isHoliday) {
            return { 
                success: false, 
                error: `Cannot apply for leave on ${isHoliday.name} (${leaveDate.toLocaleDateString()}). This is a public holiday.`,
                isHoliday: true,
                holidayName: isHoliday.name
            };
        }
        
        // Check if leave already applied for this date and type
        const existingApplication = await prisma.leaveApplication.findFirst({
            where: {
                userId: data.userId,
                leaveTypeId: data.leaveTypeId,
                leaveDate: leaveDate,
                status: {
                    in: ["PENDING", "APPROVED"]
                }
            }
        });
        
        if (existingApplication) {
            return { success: false, error: "Leave already applied for this date and type" };
        }
        
        // Create leave application
        const application = await prisma.leaveApplication.create({
            data: {
                userId: data.userId,
                leaveTypeId: data.leaveTypeId,
                leaveDate: leaveDate,
                reason: data.reason,
                status: entitlement.leaveType.requiresApproval ? "PENDING" : "APPROVED"
            },
            include: {
                user: true,
                leaveType: true
            }
        });
        
        // Create notification for admins if requires approval
        if (entitlement.leaveType.requiresApproval) {
            await prisma.adminNotification.create({
                data: {
                    type: "LEAVE_APPLICATION_PENDING",
                    title: "New Leave Application",
                    message: `${application.user.firstName} ${application.user.lastName} has applied for ${application.leaveType.name} on ${leaveDate.toLocaleDateString()}`,
                    metadata: {
                        applicationId: application.id,
                        userId: application.userId,
                        userName: `${application.user.firstName} ${application.user.lastName}`,
                        leaveType: application.leaveType.name,
                        leaveDate: application.leaveDate.toISOString(),
                        reason: application.reason
                    },
                },
            });
        }
        
        // If doesn't require approval, automatically deduct from balance
        if (!entitlement.leaveType.requiresApproval) {
            await prisma.userLeaveEntitlement.update({
                where: { id: entitlement.id },
                data: { usedDays: entitlement.usedDays + 1 }
            });
        }
        
        revalidatePath("/leaves");
        revalidatePath("/admin/leave-applications");
        
        return { success: true, application };
    } catch (error) {
        console.error("Error applying for leave:", error);
        return { success: false, error: "Failed to apply for leave" };
    }
}

export async function getPendingLeaveApplications() {
    return await prisma.leaveApplication.findMany({
        where: { status: "PENDING" },
        include: {
            user: true,
            leaveType: true
        },
        orderBy: { createdAt: "asc" }
    });
}

export async function getUserLeaveApplications(userId: string, year: number = new Date().getFullYear()) {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);
    
    return await prisma.leaveApplication.findMany({
        where: {
            userId,
            leaveDate: {
                gte: startDate,
                lte: endDate
            }
        },
        include: {
            leaveType: true
        },
        orderBy: { leaveDate: "desc" }
    });
}

export async function approveLeaveApplication(applicationId: string, approvedBy: string = "SYSTEM", adminNote?: string) {
    try {
        const application = await prisma.leaveApplication.findUnique({
            where: { id: applicationId },
            include: {
                user: true,
                leaveType: true
            }
        });
        
        if (!application) {
            return { success: false, error: "Leave application not found" };
        }
        
        if (application.status !== "PENDING") {
            return { success: false, error: "Leave application is not pending" };
        }
        
        // Find user's entitlement
        const entitlement = await prisma.userLeaveEntitlement.findUnique({
            where: {
                userId_leaveTypeId_year: {
                    userId: application.userId,
                    leaveTypeId: application.leaveTypeId,
                    year: application.leaveDate.getFullYear()
                }
            }
        });
        
        if (!entitlement) {
            return { success: false, error: "User doesn't have entitlement for this leave type" };
        }
        
        const remainingDays = entitlement.allocatedDays - entitlement.usedDays;
        if (remainingDays <= 0) {
            return { success: false, error: "User has no remaining leave days" };
        }
        
        // Approve application and deduct from balance
        await prisma.$transaction([
            prisma.leaveApplication.update({
                where: { id: applicationId },
                data: {
                    status: "APPROVED",
                    approvedBy,
                    approvedAt: new Date()
                }
            }),
            prisma.userLeaveEntitlement.update({
                where: { id: entitlement.id },
                data: { usedDays: entitlement.usedDays + 1 }
            })
        ]);
        
        revalidatePath("/admin/leave-applications");
        revalidatePath("/leaves");
        
        return { success: true };
    } catch (error) {
        console.error("Error approving leave application:", error);
        return { success: false, error: "Failed to approve leave application" };
    }
}

export async function rejectLeaveApplication(applicationId: string, approvedBy: string = "SYSTEM", adminNote?: string) {
    try {
        const application = await prisma.leaveApplication.findUnique({
            where: { id: applicationId }
        });
        
        if (!application) {
            return { success: false, error: "Leave application not found" };
        }
        
        if (application.status !== "PENDING") {
            return { success: false, error: "Leave application is not pending" };
        }
        
        await prisma.leaveApplication.update({
            where: { id: applicationId },
            data: {
                status: "REJECTED",
                approvedBy,
                approvedAt: new Date()
            }
        });
        
        revalidatePath("/admin/leave-applications");
        revalidatePath("/leaves");
        
        return { success: true };
    } catch (error) {
        console.error("Error rejecting leave application:", error);
        return { success: false, error: "Failed to reject leave application" };
    }
}

// Utility function to reset leave balances for new year
export async function resetLeaveBalancesForNewYear() {
    try {
        const currentYear = new Date().getFullYear();
        
        // Get all users with their current entitlements
        const users = await prisma.user.findMany({
            where: { 
                status: "APPROVED",
                isArchived: false 
            },
            include: {
                leaveEntitlements: {
                    where: { year: currentYear - 1 },
                    include: { leaveType: true }
                }
            }
        });
        
        // Create new year entitlements based on previous year's assignments
        const newEntitlements = [];
        for (const user of users) {
            for (const entitlement of user.leaveEntitlements) {
                if (entitlement.leaveType.isActive) {
                    newEntitlements.push({
                        userId: user.id,
                        leaveTypeId: entitlement.leaveTypeId,
                        year: currentYear,
                        allocatedDays: entitlement.leaveType.allocatedDays,
                        usedDays: 0
                    });
                }
            }
        }
        
        if (newEntitlements.length > 0) {
            await prisma.userLeaveEntitlement.createMany({
                data: newEntitlements,
                skipDuplicates: true
            });
        }
        
        return { success: true, created: newEntitlements.length };
    } catch (error) {
        console.error("Error resetting leave balances:", error);
        return { success: false, error: "Failed to reset leave balances" };
    }
}

// Holiday Management Functions
export async function createPublicHoliday(data: {
    name: string;
    date: string; // YYYY-MM-DD format
    description?: string;
    isRecurring?: boolean;
    appliesToAllBranches?: boolean;
    applicableBranchIds?: string[];
}) {
    try {
        const holidayDate = new Date(data.date);
        const appliesToAllBranches = data.appliesToAllBranches !== false;
        const applicableBranchIds = appliesToAllBranches
            ? []
            : [...new Set((data.applicableBranchIds || []).filter(Boolean))];

        if (!appliesToAllBranches && applicableBranchIds.length === 0) {
            return { success: false, error: "Select at least one branch or choose all branches" };
        }
        
        // Check conflicting holiday scope on this date
        const existingHolidays = await prisma.publicHoliday.findMany({
            where: {
                date: {
                    gte: new Date(holidayDate.getFullYear(), holidayDate.getMonth(), holidayDate.getDate()),
                    lt: new Date(holidayDate.getFullYear(), holidayDate.getMonth(), holidayDate.getDate() + 1)
                }
            }
        });
        
        const hasScopeConflict = existingHolidays.some((holiday) => {
            if (holiday.appliesToAllBranches || appliesToAllBranches) {
                return true;
            }

            return holiday.applicableBranchIds.some((branchId) => applicableBranchIds.includes(branchId));
        });

        if (hasScopeConflict) {
            return { success: false, error: "A holiday already exists on this date for one or more selected branches" };
        }
        
        const holiday = await prisma.publicHoliday.create({
            data: {
                name: data.name,
                date: holidayDate,
                description: data.description,
                isRecurring: data.isRecurring || false,
                appliesToAllBranches,
                applicableBranchIds
            }
        });

        const actor = await getDbUser();
        if (actor?.role === "EMPLOYEE" && actor.isManager) {
            const actorName = [actor.firstName, actor.lastName].filter(Boolean).join(" ") || actor.email;
            await logManagerHolidayAction({
                actorId: actor.id,
                actorName,
                action: "CREATE",
                holidayName: holiday.name,
                holidayDate: holiday.date,
                holidayId: holiday.id,
            });
        }
        
        revalidatePath("/admin/holidays");
        return { success: true, holiday };
    } catch (error) {
        console.error("Error creating holiday:", error);
        return { success: false, error: "Failed to create holiday" };
    }
}

export async function getPublicHolidays(year?: number) {
    try {
        const currentYear = year || new Date().getFullYear();
        const startDate = new Date(currentYear, 0, 1);
        const endDate = new Date(currentYear + 1, 0, 1);
        
        return await prisma.publicHoliday.findMany({
            where: {
                date: {
                    gte: startDate,
                    lt: endDate
                },
                isActive: true
            },
            orderBy: { date: "asc" }
        });
    } catch (error) {
        console.error("Error fetching holidays:", error);
        return [];
    }
}

export async function updatePublicHoliday(id: string, data: {
    name?: string;
    date?: string;
    description?: string;
    isRecurring?: boolean;
    isActive?: boolean;
    appliesToAllBranches?: boolean;
    applicableBranchIds?: string[];
}) {
    try {
        const existingHoliday = await prisma.publicHoliday.findUnique({ where: { id } });
        if (!existingHoliday) {
            return { success: false, error: "Holiday not found" };
        }

        const appliesToAllBranches = data.appliesToAllBranches ?? existingHoliday.appliesToAllBranches;
        const applicableBranchIds = appliesToAllBranches
            ? []
            : [...new Set((data.applicableBranchIds ?? existingHoliday.applicableBranchIds).filter(Boolean))];

        if (!appliesToAllBranches && applicableBranchIds.length === 0) {
            return { success: false, error: "Select at least one branch or choose all branches" };
        }

        const updateData: Prisma.PublicHolidayUpdateInput = {};
        
        if (data.name) updateData.name = data.name;
        if (data.date) updateData.date = new Date(data.date);
        if (data.description !== undefined) updateData.description = data.description;
        if (data.isRecurring !== undefined) updateData.isRecurring = data.isRecurring;
        if (data.isActive !== undefined) updateData.isActive = data.isActive;
        updateData.appliesToAllBranches = appliesToAllBranches;
        updateData.applicableBranchIds = applicableBranchIds;

        const targetDate = data.date ? new Date(data.date) : existingHoliday.date;
        const existingHolidays = await prisma.publicHoliday.findMany({
            where: {
                id: { not: id },
                date: {
                    gte: new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()),
                    lt: new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1)
                }
            }
        });

        const hasScopeConflict = existingHolidays.some((holiday) => {
            if (holiday.appliesToAllBranches || appliesToAllBranches) {
                return true;
            }

            return holiday.applicableBranchIds.some((branchId) => applicableBranchIds.includes(branchId));
        });

        if (hasScopeConflict) {
            return { success: false, error: "A holiday already exists on this date for one or more selected branches" };
        }
        
        const holiday = await prisma.publicHoliday.update({
            where: { id },
            data: updateData
        });

        const actor = await getDbUser();
        if (actor?.role === "EMPLOYEE" && actor.isManager) {
            const actorName = [actor.firstName, actor.lastName].filter(Boolean).join(" ") || actor.email;
            await logManagerHolidayAction({
                actorId: actor.id,
                actorName,
                action: "UPDATE",
                holidayName: holiday.name,
                holidayDate: holiday.date,
                holidayId: holiday.id,
            });
        }
        
        revalidatePath("/admin/holidays");
        return { success: true, holiday };
    } catch (error) {
        console.error("Error updating holiday:", error);
        return { success: false, error: "Failed to update holiday" };
    }
}

export async function deletePublicHoliday(id: string) {
    try {
        const existingHoliday = await prisma.publicHoliday.findUnique({ where: { id } });
        if (!existingHoliday) {
            return { success: false, error: "Holiday not found" };
        }

        await prisma.publicHoliday.delete({
            where: { id }
        });

        const actor = await getDbUser();
        if (actor?.role === "EMPLOYEE" && actor.isManager) {
            const actorName = [actor.firstName, actor.lastName].filter(Boolean).join(" ") || actor.email;
            await logManagerHolidayAction({
                actorId: actor.id,
                actorName,
                action: "DELETE",
                holidayName: existingHoliday.name,
                holidayDate: existingHoliday.date,
                holidayId: existingHoliday.id,
            });
        }
        
        revalidatePath("/admin/holidays");
        return { success: true };
    } catch (error) {
        console.error("Error deleting holiday:", error);
        return { success: false, error: "Failed to delete holiday" };
    }
}

export async function checkIfHoliday(date: string, branchId?: string | null) {
    try {
        const targetDate = new Date(date);
        const whereClause: Prisma.PublicHolidayWhereInput = {
            date: {
                gte: new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()),
                lt: new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1)
            },
            isActive: true
        };

        if (branchId) {
            whereClause.OR = [
                { appliesToAllBranches: true },
                { applicableBranchIds: { has: branchId } }
            ];
        }

        const holiday = await prisma.publicHoliday.findFirst({
            where: whereClause
        });
        
        return {
            isHoliday: !!holiday,
            holidayName: holiday?.name,
            holidayDescription: holiday?.description
        };
    } catch (error) {
        console.error("Error checking holiday:", error);
        return { isHoliday: false };
    }
}

export async function checkIfWeeklyHoliday(userId: string, date: string) {
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { branch: true }
        });
        
        if (!user || !user.branch) {
            return { isWeeklyHoliday: false };
        }
        
        const targetDate = new Date(date);
        const dayOfWeek = targetDate.getDay(); // 0=Sunday, 6=Saturday
        const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
        const currentDayName = dayNames[dayOfWeek];
        
        const isWeeklyHoliday = user.branch.weeklyOffDays?.includes(currentDayName) || false;
        
        return {
            isWeeklyHoliday,
            weeklyHolidayDay: isWeeklyHoliday ? currentDayName : undefined,
            branchName: user.branch.name
        };
    } catch (error) {
        console.error("Error checking weekly holiday:", error);
        return { isWeeklyHoliday: false };
    }
}

export async function checkAllHolidays(userId: string, date: string) {
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { branchId: true }
        });

        const [publicHolidayResult, weeklyHolidayResult] = await Promise.all([
            checkIfHoliday(date, user?.branchId),
            checkIfWeeklyHoliday(userId, date)
        ]);
        
        return {
            isPublicHoliday: publicHolidayResult.isHoliday,
            publicHolidayName: publicHolidayResult.holidayName,
            publicHolidayDescription: publicHolidayResult.holidayDescription,
            isWeeklyHoliday: weeklyHolidayResult.isWeeklyHoliday,
            weeklyHolidayDay: weeklyHolidayResult.weeklyHolidayDay,
            branchName: weeklyHolidayResult.branchName,
            hasAnyHoliday: publicHolidayResult.isHoliday || weeklyHolidayResult.isWeeklyHoliday
        };
    } catch (error) {
        console.error("Error checking all holidays:", error);
        return { hasAnyHoliday: false, isPublicHoliday: false, isWeeklyHoliday: false };
    }
}