"use server";

import { prisma } from "@/lib/prisma";
import { startOfDay, format, subDays } from "date-fns";
import type { DailyTimeRecord, Prisma } from "@prisma/client";
import { syncAllEmployeesTimeDataForDate, type SyncResult } from "./zkteco-sync.actions";

type ActiveEmployee = Prisma.UserGetPayload<{
    include: {
        branch: true;
        leaveEntitlements: {
            include: {
                leaveType: true;
            };
        };
    };
}>;

type EmployeeLeaveEntitlement = ActiveEmployee["leaveEntitlements"][number];

type DailyProcessResult = {
    success: boolean;
    processedEmployees?: number;
    error?: string;
};

type PenaltyReconciliationResult = {
    applied: boolean;
    adjustedAmount: number;
    direction: "DEBIT" | "CREDIT";
};

type LeaveAutomationPipelineResult = {
    success: boolean;
    sync: SyncResult;
    automation: {
        success: boolean;
        mode: "ALL_DATES" | "UNPROCESSED";
        data: unknown;
    };
};

function getMidnightDate(date: Date) {
    const midnight = new Date(date);
    midnight.setHours(0, 0, 0, 0);
    return midnight;
}

function isFilledString(value?: string | null) {
    return Boolean(value && value.trim().length > 0);
}

function isNonZeroTime(value?: Date | null) {
    if (!value) return false;
    return value.getHours() !== 0 || value.getMinutes() !== 0 || value.getSeconds() !== 0;
}

function timeStringToMinutes(timeStr?: string | null) {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return (hours * 60) + minutes;
}

function getRequiredActiveMinutes(existingRecord: DailyTimeRecord | null, requiredCheckIn: Date, requiredCheckOut: Date, requiredBreakTime: string) {
    if (existingRecord?.requiredActiveTime) {
        const minutes = timeStringToMinutes(existingRecord.requiredActiveTime);
        if (minutes > 0) return minutes;
    }

    const totalMinutes = Math.max(0, Math.floor((requiredCheckOut.getTime() - requiredCheckIn.getTime()) / (1000 * 60)));
    const breakMinutes = timeStringToMinutes(requiredBreakTime);
    return Math.max(0, totalMinutes - breakMinutes);
}

function isSameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
}

function isWithinRequiredWindow(employee: ActiveEmployee, processDate: Date, now: Date) {
    if (!isSameDay(processDate, now)) return false;

    const checkInTime = employee.branch?.checkInTime || "09:00";
    const checkOutTime = employee.branch?.checkOutTime || "18:00";

    const requiredCheckIn = new Date(processDate);
    const [checkInHour, checkInMinute] = checkInTime.split(':');
    requiredCheckIn.setHours(parseInt(checkInHour), parseInt(checkInMinute), 0, 0);

    const requiredCheckOut = new Date(processDate);
    const [checkOutHour, checkOutMinute] = checkOutTime.split(':');
    requiredCheckOut.setHours(parseInt(checkOutHour), parseInt(checkOutMinute), 0, 0);

    return now >= requiredCheckIn && now <= requiredCheckOut;
}

function buildDateRange(fromDate: Date, toDate: Date): string[] {
    const dates: string[] = [];
    const currentDate = startOfDay(new Date(fromDate));
    const endDate = startOfDay(new Date(toDate));

    while (currentDate <= endDate) {
        dates.push(format(currentDate, "yyyy-MM-dd"));
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates;
}

async function getUnprocessedDateKeys(): Promise<string[]> {
    const today = startOfDay(new Date());
    const datesToProcess = new Set<string>();

    datesToProcess.add(format(subDays(today, 1), 'yyyy-MM-dd'));
    datesToProcess.add(format(today, 'yyyy-MM-dd'));

    const unprocessedRecords = await prisma.dailyTimeRecord.groupBy({
        by: ['date'],
        where: {
            isProcessed: {
                not: true,
            },
        },
        orderBy: {
            date: 'asc',
        },
    });

    unprocessedRecords.forEach((record) => {
        datesToProcess.add(format(record.date, 'yyyy-MM-dd'));
    });

    return Array.from(datesToProcess).sort();
}

async function reconcileLatePenaltyWallet(
    userId: string,
    processDate: Date,
    lateMinutes: number,
    penaltyAmount: number
): Promise<PenaltyReconciliationResult> {
    if (penaltyAmount <= 0) {
        return { applied: false, adjustedAmount: 0, direction: "DEBIT" };
    }

    const dateKey = format(processDate, "yyyy-MM-dd");
    const penaltyTag = `Late check-in penalty for ${dateKey}`;

    const priorPenaltyTransactions = await prisma.walletTransaction.findMany({
        where: {
            userId,
            type: "ADJUSTMENT",
            description: {
                contains: penaltyTag,
            },
        },
        select: {
            amount: true,
        },
    });

    const alreadyDeducted = priorPenaltyTransactions.reduce((sum, transaction) => {
        if (transaction.amount >= 0) {
            return sum;
        }
        return sum + Math.abs(transaction.amount);
    }, 0);

    const diff = Number((penaltyAmount - alreadyDeducted).toFixed(2));
    if (Math.abs(diff) < 0.01) {
        return { applied: false, adjustedAmount: 0, direction: "DEBIT" };
    }

    const direction = diff > 0 ? "DEBIT" : "CREDIT";
    const adjustmentAmount = Number(Math.abs(diff).toFixed(2));
    const walletAmount = direction === "DEBIT" ? -adjustmentAmount : adjustmentAmount;
    const description = direction === "DEBIT"
        ? `${penaltyTag} (${lateMinutes} min)`
        : `Late check-in penalty correction for ${dateKey}`;

    await prisma.$transaction(async (tx) => {
        await tx.user.update({
            where: { id: userId },
            data: { walletBalance: { increment: walletAmount } },
        });

        await tx.walletTransaction.create({
            data: {
                userId,
                amount: walletAmount,
                type: "ADJUSTMENT",
                description,
            },
        });
    });

    return {
        applied: true,
        adjustedAmount: adjustmentAmount,
        direction,
    };
}

export async function runLeaveAutomationPipeline(options?: {
    mode?: "ALL_DATES" | "UNPROCESSED";
    fromDate?: Date;
    toDate?: Date;
    includeToday?: boolean;
    skipIfWithinWindow?: boolean;
    now?: Date;
}): Promise<LeaveAutomationPipelineResult> {
    const mode = options?.mode ?? "UNPROCESSED";
    const now = options?.now ?? new Date();
    const today = startOfDay(now);

    const dateKeys = mode === "ALL_DATES"
        ? buildDateRange(
            options?.fromDate ?? new Date(0),
            startOfDay(options?.toDate ?? (options?.includeToday ? today : subDays(today, 1))),
        )
        : await getUnprocessedDateKeys();

    const aggregateSync: SyncResult = {
        success: true,
        message: "",
        syncedRecords: 0,
        skippedRecords: 0,
        errors: [],
    };

    const dateResults: Array<{
        date: string;
        syncSuccess: boolean;
        syncMessage: string;
        syncedRecords: number;
        skippedRecords: number;
        automationSuccess: boolean;
        processedEmployees: number;
        automationError?: string;
    }> = [];

    let processedDates = 0;
    let totalProcessedEmployees = 0;
    let failedDate: string | null = null;

    for (const dateKey of dateKeys) {
        const processDate = startOfDay(new Date(dateKey));

        const syncResult = await syncAllEmployeesTimeDataForDate(processDate);
        aggregateSync.syncedRecords += syncResult.syncedRecords;
        aggregateSync.skippedRecords += syncResult.skippedRecords;
        aggregateSync.errors.push(...syncResult.errors);

        if (!syncResult.success) {
            aggregateSync.success = false;
            aggregateSync.message = syncResult.message;
            failedDate = dateKey;
            dateResults.push({
                date: dateKey,
                syncSuccess: false,
                syncMessage: syncResult.message,
                syncedRecords: syncResult.syncedRecords,
                skippedRecords: syncResult.skippedRecords,
                automationSuccess: false,
                processedEmployees: 0,
                automationError: "Skipped due to sync failure",
            });
            break;
        }

        const isToday = isSameDay(processDate, today);
        const automationResult = await processDailyLeaveAutomation(processDate, {
            skipIfWithinWindow: Boolean(options?.skipIfWithinWindow && isToday),
            now: isToday ? now : undefined,
        });

        const processedEmployees = automationResult.success ? (automationResult.processedEmployees || 0) : 0;
        if (!automationResult.success) {
            failedDate = dateKey;
            dateResults.push({
                date: dateKey,
                syncSuccess: true,
                syncMessage: syncResult.message,
                syncedRecords: syncResult.syncedRecords,
                skippedRecords: syncResult.skippedRecords,
                automationSuccess: false,
                processedEmployees,
                automationError: automationResult.error || "Failed to process daily automation",
            });
            break;
        }

        processedDates += 1;
        totalProcessedEmployees += processedEmployees;
        dateResults.push({
            date: dateKey,
            syncSuccess: true,
            syncMessage: syncResult.message,
            syncedRecords: syncResult.syncedRecords,
            skippedRecords: syncResult.skippedRecords,
            automationSuccess: true,
            processedEmployees,
        });
    }

    const automationSuccess = failedDate === null;
    const automationData = {
        success: automationSuccess,
        attemptedDates: dateKeys.length,
        processedDates,
        totalProcessed: totalProcessedEmployees,
        failedDate,
        dateResults,
    };

    if (!aggregateSync.message) {
        aggregateSync.message = `Synced ${aggregateSync.syncedRecords} record(s), skipped ${aggregateSync.skippedRecords} record(s)`;
    }

    return {
        success: aggregateSync.success && automationSuccess,
        sync: aggregateSync,
        automation: {
            success: automationSuccess,
            mode,
            data: automationData,
        },
    };
}

/**
 * Process all unprocessed dates (including today and any dates with null values)
 * This is the main function called by the cron job at 23:00
 */
export async function processAllUnprocessedDates() {
    console.log("Starting comprehensive leave automation processing...");
    
    try {
        const today = startOfDay(new Date());
        const now = new Date();
        
        // Get dates to process: yesterday, today, and any dates with unprocessed records
        const datesToProcess = new Set<string>();
        
        // Add yesterday (default processing)
        datesToProcess.add(format(subDays(today, 1), 'yyyy-MM-dd'));
        
        // Add today (for current day processing)
        datesToProcess.add(format(today, 'yyyy-MM-dd'));
        
        // Find dates with incomplete processing
        const unprocessedRecords = await prisma.dailyTimeRecord.groupBy({
            by: ['date'],
            where: {
                isProcessed: {
                    not: true
                }
            },
            orderBy: {
                date: 'asc'
            }
        });
        
        // Add all dates with unprocessed records
        unprocessedRecords.forEach(record => {
            datesToProcess.add(format(record.date, 'yyyy-MM-dd'));
        });

        let totalProcessed = 0;
        const results: Array<DailyProcessResult & { date: string }> = [];

        // Process each unique date
        for (const dateStr of Array.from(datesToProcess).sort()) {
            const processDate = startOfDay(new Date(dateStr));
            const isToday = isSameDay(processDate, today);
            
            console.log(`Processing leave automation for date: ${dateStr}`);
            
            const result = await processDailyLeaveAutomation(processDate, {
                skipIfWithinWindow: isToday,
                now: isToday ? now : undefined
            });
            
            if (result.success) {
                totalProcessed += result.processedEmployees || 0;
            }
            
            results.push({ date: dateStr, ...result });
        }

        console.log(`Completed processing ${datesToProcess.size} dates, ${totalProcessed} total employee records`);
        return { 
            success: true, 
            datesProcessed: datesToProcess.size,
            totalProcessed,
            results 
        };
    } catch (error) {
        console.error("Error processing all unprocessed dates:", error);
        return { success: false, error: "Failed to process automation" };
    }
}

/**
 * Main function to process daily leave automation for a specific date
 * Should be called every day at 23:00 (11 PM)
 */
export async function processDailyLeaveAutomation(
    targetDate?: Date,
    options?: { skipIfWithinWindow?: boolean; now?: Date }
) {
    const processDate = targetDate ? startOfDay(targetDate) : startOfDay(subDays(new Date(), 1)); // Yesterday by default
    
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
            await processEmployeeDailyRecord(employee, processDate, options);
        }

        return { success: true, processedEmployees: activeEmployees.length };
    } catch (error) {
        console.error("Error processing daily leave automation:", error);
        return { success: false, error: "Failed to process daily automation" };
    }
}

/**
 * Process daily record for a single employee
 */
async function processEmployeeDailyRecord(employee: ActiveEmployee, processDate: Date, options?: { skipIfWithinWindow?: boolean; now?: Date }) {
    
    // Check if already processed
    const existingRecord = await prisma.dailyTimeRecord.findUnique({
        where: {
            userId_date: {
                userId: employee.id,
                date: processDate
            }
        }
    });

    const hasRequiredFilled = Boolean(
        isNonZeroTime(existingRecord?.requiredCheckIn) &&
        isNonZeroTime(existingRecord?.requiredCheckOut) &&
        isFilledString(existingRecord?.requiredBreakTime)
    );

    const hasActualFilled = Boolean(
        isNonZeroTime(existingRecord?.actualCheckIn) &&
        isNonZeroTime(existingRecord?.actualCheckOut) &&
        isFilledString(existingRecord?.actualBreakTime)
    );

    const isFullyFilled = hasRequiredFilled && hasActualFilled;

    // If record exists, is already processed, and fully filled, skip
    if (existingRecord?.isProcessed && isFullyFilled) {
        return;
    }

    const dayOfWeek = format(processDate, 'EEEE').toUpperCase();
    const isWeeklyOff = employee.branch?.weeklyOffDays?.includes(dayOfWeek);

    if (options?.skipIfWithinWindow && options?.now && isWithinRequiredWindow(employee, processDate, options.now)) {
        return;
    }

    if (isWeeklyOff) {
        await handleWeeklyOffDay(employee, processDate, existingRecord);
    } else {
        await handleWorkDay(employee, processDate, existingRecord);
    }
}

/**
 * Handle weekly off day processing
 */
async function handleWeeklyOffDay(employee: ActiveEmployee, processDate: Date, existingRecord: DailyTimeRecord | null) {
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
        officialOvertimeundertime: "00:00",
        requestedOvertime: "00:00",
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
async function handleWorkDay(employee: ActiveEmployee, processDate: Date, existingRecord: DailyTimeRecord | null) {
    const hasRequiredFilled = Boolean(
        isNonZeroTime(existingRecord?.requiredCheckIn) &&
        isNonZeroTime(existingRecord?.requiredCheckOut) &&
        isFilledString(existingRecord?.requiredBreakTime)
    );

    const hasActualFilled = Boolean(
        isNonZeroTime(existingRecord?.actualCheckIn) &&
        isNonZeroTime(existingRecord?.actualCheckOut) &&
        isFilledString(existingRecord?.actualBreakTime)
    );

    if (existingRecord && hasRequiredFilled && hasActualFilled) {
        const requiredCheckIn = existingRecord.requiredCheckIn as Date;
        const requiredCheckOut = existingRecord.requiredCheckOut as Date;
        const requiredBreakTime = existingRecord.requiredBreakTime || "00:00";

        const actualCheckIn = existingRecord.actualCheckIn as Date;
        const lateMinutes = Math.max(0, Math.floor((actualCheckIn.getTime() - requiredCheckIn.getTime()) / (1000 * 60)));
        const requiredActiveMinutes = getRequiredActiveMinutes(
            existingRecord,
            requiredCheckIn,
            requiredCheckOut,
            requiredBreakTime
        );

        const workingDaysInMonth = employee.workingDaysInMonth || 22;
        const dailySalary = workingDaysInMonth > 0 ? (employee.baseSalary / workingDaysInMonth) : 0;
        const perMinuteRate = requiredActiveMinutes > 0 ? (dailySalary / requiredActiveMinutes) : 0;
        const penaltyAmount = lateMinutes > 0 ? Number((perMinuteRate * lateMinutes).toFixed(2)) : 0;

        await prisma.dailyTimeRecord.update({
            where: { id: existingRecord.id },
            data: {
                status: "PRESENT",
                isProcessed: true,
                lateCheckInMinutes: lateMinutes,
                lateCheckInPenalty: penaltyAmount
            }
        });

        if (penaltyAmount > 0) {
            const reconciliation = await reconcileLatePenaltyWallet(
                employee.id,
                processDate,
                lateMinutes,
                penaltyAmount
            );

            if (reconciliation.applied) {
                const message = reconciliation.direction === "DEBIT"
                    ? `A penalty of ৳${reconciliation.adjustedAmount.toFixed(2)} was applied for ${lateMinutes} minutes late on ${format(processDate, 'MMMM d, yyyy')}.`
                    : `A penalty correction of ৳${reconciliation.adjustedAmount.toFixed(2)} was credited for ${format(processDate, 'MMMM d, yyyy')}.`;

                await prisma.employeeNotification.create({
                    data: {
                        userId: employee.id,
                        type: "LATE_CHECKIN_PENALTY",
                        title: "Late Check-in Penalty",
                        message,
                        relatedDate: processDate
                    }
                });
            }
        }
        return;
    }

    // Employee is absent - check for available leaves
    const availableLeaveEntitlements = employee.leaveEntitlements.filter((entitlement) => 
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
async function handleAutoLeaveDeduction(employee: ActiveEmployee, processDate: Date, existingRecord: DailyTimeRecord | null, leaveEntitlement: EmployeeLeaveEntitlement) {
    // Deduct one day from leave entitlement
    await prisma.userLeaveEntitlement.update({
        where: { id: leaveEntitlement.id },
        data: {
            usedDays: leaveEntitlement.usedDays + 1
        }
    });

    const midnight = getMidnightDate(processDate);
    const recordData = {
        userId: employee.id,
        date: processDate,
        status: "ON_LEAVE" as const,
        requiredCheckIn: midnight,
        requiredCheckOut: midnight,
        requiredBreakTime: "00:00",
        actualCheckIn: midnight,
        actualCheckOut: midnight,
        actualBreakTime: "00:00",
        requiredActiveTime: "00:00",
        actualActiveTime: "00:00",
        officialOvertimeundertime: "00:00",
        requestedOvertime: "00:00",
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
async function handleAbsentWithoutLeave(employee: ActiveEmployee, processDate: Date, existingRecord: DailyTimeRecord | null) {
    const midnight = getMidnightDate(processDate);
    const recordData = {
        userId: employee.id,
        date: processDate,
        status: "ABSENT" as const,
        requiredCheckIn: midnight,
        requiredCheckOut: midnight,
        requiredBreakTime: "00:00",
        actualCheckIn: midnight,
        actualCheckOut: midnight,
        actualBreakTime: "00:00",
        requiredActiveTime: "00:00",
        actualActiveTime: "00:00",
        officialOvertimeundertime: "00:00",
        requestedOvertime: "00:00",
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
export async function processBackfillLeaveAutomation(
    fromDate: Date,
    toDate?: Date,
    options?: { includeToday?: boolean; skipIfWithinWindow?: boolean; now?: Date }
) {
    const today = startOfDay(new Date());
    const endDate = toDate ? startOfDay(toDate) : (options?.includeToday ? today : subDays(today, 1));
    const currentDate = startOfDay(new Date(fromDate));
    
    console.log(`Processing backfill from ${format(fromDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}`);
    
    let processedDates = 0;
    
    while (currentDate <= endDate) {
        const isCurrentDay = isSameDay(currentDate, today);
        await processDailyLeaveAutomation(new Date(currentDate), {
            skipIfWithinWindow: isCurrentDay ? options?.skipIfWithinWindow : false,
            now: isCurrentDay ? options?.now : undefined
        });
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