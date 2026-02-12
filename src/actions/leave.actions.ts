"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { LeaveApplicationStatus } from "@prisma/client";

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