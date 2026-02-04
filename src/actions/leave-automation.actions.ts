"use server";

import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, format, subDays } from "date-fns";

/**
 * Main function to process daily leave automation
 * Should be called every day at 22:00 (10 PM)
 */
export async function processDailyLeaveAutomation(targetDate?: Date) {
    const processDate = targetDate ? startOfDay(targetDate) : startOfDay(subDays(new Date(), 1)); // Yesterday by default
    
    console.log(`Processing leave automation for date: ${format(processDate, 'yyyy-MM-dd')}`);
    
    try {
        // Get all active employees
        const activeEmployees = await prisma.user.findMany({
            where: {
                employeeStatus: "ACTIVE",
                isArchived: false,
                branchId: { not: null }
            },
            include: {
                branch: true,
                leaveEntitlements: {
                    where: {
                        year: new Date().getFullYear(),
                        leaveType: {
                            isActive: true,
                            leaveResetPolicy: "ROSTER_EVERY_YEAR"
                        }
                    },
                    include: {
                        leaveType: true
                    },
                    orderBy: {
                        createdAt: 'asc' // First created will be used first
                    }
                }
            }
        });

        for (const employee of activeEmployees) {
            await processEmployeeDailyRecord(employee, processDate);
        }

        console.log(`Completed processing for ${activeEmployees.length} employees`);
        return { success: true, processedEmployees: activeEmployees.length };
    } catch (error) {
        console.error("Error processing daily leave automation:", error);
        return { success: false, error: "Failed to process daily automation" };
    }
}

/**
 * Process daily record for a single employee
 */
async function processEmployeeDailyRecord(employee: any, processDate: Date) {
    const dateStr = format(processDate, 'yyyy-MM-dd');
    
    // Check if already processed
    const existingRecord = await prisma.dailyTimeRecord.findUnique({
        where: {
            userId_date: {
                userId: employee.id,
                date: processDate
            }
        }
    });

    // If record exists and is already processed, skip
    if (existingRecord?.isProcessed) {
        return;
    }

    const dayOfWeek = format(processDate, 'EEEE').toUpperCase();
    const isWeeklyOff = employee.branch?.weeklyOffDays?.includes(dayOfWeek);

    if (isWeeklyOff) {
        await handleWeeklyOffDay(employee, processDate, existingRecord);
    } else {
        await handleWorkDay(employee, processDate, existingRecord);
    }
}

/**
 * Handle weekly off day processing
 */
async function handleWeeklyOffDay(employee: any, processDate: Date, existingRecord: any) {
    const recordData = {
        userId: employee.id,
        date: processDate,
        status: "WEEKLY_OFF" as const,
        requiredCheckIn: null,
        requiredCheckOut: null,
        requiredBreakTime: "00:00",
        actualCheckIn: null,
        actualCheckOut: null,
        actualBreakTime: "00:00",
        requiredActiveTime: "00:00",
        actualActiveTime: "00:00",
        overtimeUndertime: "00:00",
        isProcessed: true
    };

    if (existingRecord) {
        await prisma.dailyTimeRecord.update({
            where: { id: existingRecord.id },
            data: recordData
        });
    } else {
        await prisma.dailyTimeRecord.create({
            data: recordData
        });
    }

    // Create audit log
    await prisma.leaveAuditLog.create({
        data: {
            userId: employee.id,
            action: "WEEKLY_OFF_SET",
            description: `Weekly off day automatically set for ${format(processDate, 'EEEE, MMMM d, yyyy')}`,
            affectedDate: processDate,
            processingSource: "SYSTEM"
        }
    });

    // Create notification
    await prisma.employeeNotification.create({
        data: {
            userId: employee.id,
            type: "WEEKLY_OFF_SET",
            title: "Weekly Off Day",
            message: `${format(processDate, 'EEEE, MMMM d, yyyy')} has been set as your weekly off day.`,
            relatedDate: processDate
        }
    });
}

/**
 * Handle work day processing
 */
async function handleWorkDay(employee: any, processDate: Date, existingRecord: any) {
    // Check if employee has any attendance data for this day
    const hasAttendanceData = existingRecord && (
        existingRecord.actualCheckIn || 
        existingRecord.actualCheckOut || 
        (existingRecord.actualBreakTime && existingRecord.actualBreakTime !== "00:00")
    );

    if (hasAttendanceData) {
        // Employee has attendance data, mark as present and processed
        await prisma.dailyTimeRecord.update({
            where: { id: existingRecord.id },
            data: {
                status: "PRESENT",
                isProcessed: true
            }
        });
        return;
    }

    // Employee is absent - check for available leaves
    const availableLeaveEntitlements = employee.leaveEntitlements.filter((entitlement: any) => 
        (entitlement.allocatedDays - entitlement.usedDays) > 0
    );

    if (availableLeaveEntitlements.length > 0) {
        await handleAutoLeaveDeduction(employee, processDate, existingRecord, availableLeaveEntitlements[0]);
    } else {
        await handleAbsentWithoutLeave(employee, processDate, existingRecord);
    }
}

/**
 * Handle automatic leave deduction
 */
async function handleAutoLeaveDeduction(employee: any, processDate: Date, existingRecord: any, leaveEntitlement: any) {
    // Deduct one day from leave entitlement
    await prisma.userLeaveEntitlement.update({
        where: { id: leaveEntitlement.id },
        data: {
            usedDays: leaveEntitlement.usedDays + 1
        }
    });

    const recordData = {
        userId: employee.id,
        date: processDate,
        status: "ON_LEAVE" as const,
        requiredCheckIn: null,
        requiredCheckOut: null,
        requiredBreakTime: "00:00",
        actualCheckIn: null,
        actualCheckOut: null,
        actualBreakTime: "00:00",
        requiredActiveTime: "00:00",
        actualActiveTime: "00:00",
        overtimeUndertime: "00:00",
        autoDeductedLeaveType: leaveEntitlement.leaveType.name,
        isProcessed: true
    };

    if (existingRecord) {
        await prisma.dailyTimeRecord.update({
            where: { id: existingRecord.id },
            data: recordData
        });
    } else {
        await prisma.dailyTimeRecord.create({
            data: recordData
        });
    }

    const newBalance = leaveEntitlement.allocatedDays - (leaveEntitlement.usedDays + 1);

    // Create audit log
    await prisma.leaveAuditLog.create({
        data: {
            userId: employee.id,
            action: "AUTO_LEAVE_DEDUCTION",
            description: `Auto-deducted 1 day from ${leaveEntitlement.leaveType.name} due to absence on ${format(processDate, 'MMMM d, yyyy')}`,
            affectedDate: processDate,
            leaveTypeId: leaveEntitlement.leaveTypeId,
            previousBalance: leaveEntitlement.allocatedDays - leaveEntitlement.usedDays,
            newBalance: newBalance,
            deductedDays: 1,
            processingSource: "SYSTEM"
        }
    });

    // Create notification
    await prisma.employeeNotification.create({
        data: {
            userId: employee.id,
            type: "AUTO_LEAVE_DEDUCTION",
            title: "Leave Auto-Deducted",
            message: `1 day has been automatically deducted from your ${leaveEntitlement.leaveType.name} for absence on ${format(processDate, 'MMMM d, yyyy')}. Remaining balance: ${newBalance} days.`,
            relatedDate: processDate
        }
    });
}

/**
 * Handle absent without leave
 */
async function handleAbsentWithoutLeave(employee: any, processDate: Date, existingRecord: any) {
    // Set required times based on branch settings
    const checkInTime = employee.branch?.checkInTime || "09:00";
    const checkOutTime = employee.branch?.checkOutTime || "18:00";
    const breakDuration = employee.branch?.breakDuration || "01:00";

    const requiredCheckIn = new Date(processDate);
    const [checkInHour, checkInMinute] = checkInTime.split(':');
    requiredCheckIn.setHours(parseInt(checkInHour), parseInt(checkInMinute), 0, 0);

    const requiredCheckOut = new Date(processDate);
    const [checkOutHour, checkOutMinute] = checkOutTime.split(':');
    requiredCheckOut.setHours(parseInt(checkOutHour), parseInt(checkOutMinute), 0, 0);

    // Calculate required active time
    const totalMinutes = (requiredCheckOut.getTime() - requiredCheckIn.getTime()) / (1000 * 60);
    const breakMinutes = parseInt(breakDuration.split(':')[0]) * 60 + parseInt(breakDuration.split(':')[1]);
    const activeMinutes = totalMinutes - breakMinutes;
    const requiredActiveTime = `${Math.floor(activeMinutes / 60).toString().padStart(2, '0')}:${(activeMinutes % 60).toString().padStart(2, '0')}`;

    const recordData = {
        userId: employee.id,
        date: processDate,
        status: "ABSENT" as const,
        requiredCheckIn,
        requiredCheckOut,
        requiredBreakTime: breakDuration,
        actualCheckIn: null,
        actualCheckOut: null,
        actualBreakTime: "00:00",
        requiredActiveTime,
        actualActiveTime: "00:00",
        overtimeUndertime: `-${requiredActiveTime}`,
        isProcessed: true
    };

    if (existingRecord) {
        await prisma.dailyTimeRecord.update({
            where: { id: existingRecord.id },
            data: recordData
        });
    } else {
        await prisma.dailyTimeRecord.create({
            data: recordData
        });
    }

    // Create audit log
    await prisma.leaveAuditLog.create({
        data: {
            userId: employee.id,
            action: "ABSENT_WITHOUT_LEAVE",
            description: `Employee marked absent on ${format(processDate, 'MMMM d, yyyy')} - no available leave balance for auto-deduction`,
            affectedDate: processDate,
            processingSource: "SYSTEM"
        }
    });

    // Create notification
    await prisma.employeeNotification.create({
        data: {
            userId: employee.id,
            type: "ABSENT_WITHOUT_LEAVE",
            title: "Absent Without Leave",
            message: `You were marked absent on ${format(processDate, 'MMMM d, yyyy')}. No available leave balance for auto-deduction.`,
            relatedDate: processDate
        }
    });
}

/**
 * Process past dates that haven't been processed yet
 */
export async function processBackfillLeaveAutomation(fromDate: Date, toDate?: Date) {
    const endDate = toDate || subDays(new Date(), 1); // Yesterday by default
    const currentDate = new Date(fromDate);
    
    console.log(`Processing backfill from ${format(fromDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}`);
    
    let processedDates = 0;
    
    while (currentDate <= endDate) {
        await processDailyLeaveAutomation(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
        processedDates++;
    }
    
    console.log(`Completed backfill processing for ${processedDates} dates`);
    return { success: true, processedDates };
}

/**
 * Get employee notifications
 */
export async function getEmployeeNotifications(userId: string, limit = 50) {
    return await prisma.employeeNotification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit
    });
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(notificationId: string) {
    return await prisma.employeeNotification.update({
        where: { id: notificationId },
        data: { isRead: true }
    });
}

/**
 * Get employee leave audit logs
 */
export async function getEmployeeLeaveAuditLogs(userId: string, limit = 100) {
    return await prisma.leaveAuditLog.findMany({
        where: { userId },
        include: {
            leaveType: true
        },
        orderBy: { createdAt: 'desc' },
        take: limit
    });
}