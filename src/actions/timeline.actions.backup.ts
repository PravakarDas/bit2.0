"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { createAdminNotification } from "./notification.actions";

// Helper function to get day name from date
function getDayName(date: Date): string {
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  return days[date.getDay()];
}

// Helper function to convert time duration (HH:MM) to minutes
function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

// Helper function to convert minutes to time duration (HH:MM)
function minutesToTime(minutes: number): string {
  const hours = Math.floor(Math.abs(minutes) / 60);
  const mins = Math.abs(minutes) % 60;
  const sign = minutes < 0 ? '-' : '';
  return `${sign}${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

// Helper function to check if user has approved leave on a specific date
async function hasApprovedLeave(userId: string, date: Date): Promise<boolean> {
  const leave = await prisma.leaveApplication.findFirst({
    where: {
      userId,
      leaveDate: {
        gte: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        lt: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
      },
      status: 'APPROVED'
    }
  });
  return !!leave;
}

// Generate daily time records for all employees for a date range
export async function generateTimeRecords(startDate: Date, endDate: Date) {
  try {
    console.log(`Generating time records from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    // Get all active users with their branch information
    const users = await prisma.user.findMany({
      where: {
        status: 'APPROVED',
        employeeStatus: 'ACTIVE',
        isArchived: false
      },
      include: {
        branch: true
      }
    });

    let recordsCreated = 0;
    
    // For each user and each date in range
    for (const user of users) {
      if (!user.branch) continue; // Skip users without branch
      
      const currentDate = new Date(startDate);
      
      while (currentDate <= endDate) {
        // Check if record already exists
        const existingRecord = await prisma.dailyTimeRecord.findUnique({
          where: {
            userId_date: {
              userId: user.id,
              date: new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate())
            }
          }
        });

        if (!existingRecord) {
          const dayName = getDayName(currentDate);
          const isWeeklyOff = user.branch.weeklyOffDays.includes(dayName);
          const hasLeave = await hasApprovedLeave(user.id, currentDate);
          
          // If it's weekly off or has leave, set required times to null/0
          let requiredCheckIn = null;
          let requiredCheckOut = null;
          let requiredBreakTime = null;
          let requiredActiveTime = null;
          
          if (!isWeeklyOff && !hasLeave) {
            // Create DateTime objects for required times
            const dateOnly = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
            
            const [checkInHour, checkInMin] = user.branch.checkInTime.split(':').map(Number);
            const [checkOutHour, checkOutMin] = user.branch.checkOutTime.split(':').map(Number);
            
            requiredCheckIn = new Date(dateOnly);
            requiredCheckIn.setHours(checkInHour, checkInMin, 0, 0);
            
            requiredCheckOut = new Date(dateOnly);
            requiredCheckOut.setHours(checkOutHour, checkOutMin, 0, 0);
            
            requiredBreakTime = user.branch.breakDuration;
            
            // Calculate required active time
            const workMinutes = (requiredCheckOut.getTime() - requiredCheckIn.getTime()) / (1000 * 60);
            const breakMinutes = timeToMinutes(user.branch.breakDuration);
            const activeMinutes = workMinutes - breakMinutes;
            requiredActiveTime = minutesToTime(activeMinutes);
          }

          await prisma.dailyTimeRecord.create({
            data: {
              userId: user.id,
              date: new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()),
              requiredCheckIn,
              requiredCheckOut,
              requiredBreakTime,
              requiredActiveTime
            }
          });
          
          recordsCreated++;
        }

        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    console.log(`Created ${recordsCreated} new time records`);
    revalidatePath('/admin/timeline');
    revalidatePath('/dashboard');
    
    return { success: true, recordsCreated };
  } catch (error) {
    console.error('Error generating time records:', error);
    return { success: false, error: 'Failed to generate time records' };
  }
}

// Generate daily time record for a specific date (for automated daily generation)
export async function generateDailyTimeRecords(targetDate?: Date) {
  try {
    const today = targetDate || new Date();
    const dateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    console.log(`Generating daily time records for ${dateOnly.toISOString()}`);
    
    // Check if records already exist for this date
    const existingRecordsCount = await prisma.dailyTimeRecord.count({
      where: {
        date: dateOnly
      }
    });
    
    if (existingRecordsCount > 0) {
      console.log(`Records already exist for ${dateOnly.toDateString()}, skipping generation`);
      return { success: true, message: 'Records already exist for this date', recordsCreated: 0 };
    }
    
    // Get all active users with their branch information
    const users = await prisma.user.findMany({
      where: {
        status: 'APPROVED',
        employeeStatus: 'ACTIVE',
        isArchived: false
      },
      include: {
        branch: true
      }
    });

    let recordsCreated = 0;
    
    for (const user of users) {
      if (!user.branch) continue; // Skip users without branch
      
      const dayName = getDayName(dateOnly);
      const isWeeklyOff = user.branch.weeklyOffDays.includes(dayName);
      
      // Check if user has approved leave for this date
      // Leave must be applied at least 1 day before
      const hasLeave = await prisma.leaveApplication.findFirst({
        where: {
          userId: user.id,
          leaveDate: {
            gte: dateOnly,
            lt: new Date(dateOnly.getTime() + 24 * 60 * 60 * 1000) // Next day
          },
          status: 'APPROVED',
          createdAt: {
            lt: dateOnly // Must be created before the target date
          }
        }
      });
      
      // If it's weekly off or has approved leave, set required times to null/0
      let requiredCheckIn = null;
      let requiredCheckOut = null;
      let requiredBreakTime = null;
      let requiredActiveTime = null;
      
      if (!isWeeklyOff && !hasLeave) {
        // Create DateTime objects for required times
        const [checkInHour, checkInMin] = user.branch.checkInTime.split(':').map(Number);
        const [checkOutHour, checkOutMin] = user.branch.checkOutTime.split(':').map(Number);
        
        requiredCheckIn = new Date(dateOnly);
        requiredCheckIn.setHours(checkInHour, checkInMin, 0, 0);
        
        requiredCheckOut = new Date(dateOnly);
        requiredCheckOut.setHours(checkOutHour, checkOutMin, 0, 0);
        
        requiredBreakTime = user.branch.breakDuration;
        
        // Calculate required active time
        const workMinutes = (requiredCheckOut.getTime() - requiredCheckIn.getTime()) / (1000 * 60);
        const breakMinutes = timeToMinutes(user.branch.breakDuration);
        const activeMinutes = workMinutes - breakMinutes;
        requiredActiveTime = minutesToTime(activeMinutes);
      }

      await prisma.dailyTimeRecord.create({
        data: {
          userId: user.id,
          date: dateOnly,
          requiredCheckIn,
          requiredCheckOut,
          requiredBreakTime,
          requiredActiveTime
        }
      });
      
      recordsCreated++;
    }

    console.log(`Created ${recordsCreated} time records for ${dateOnly.toDateString()}`);
    
    return { success: true, recordsCreated, date: dateOnly.toISOString() };
  } catch (error) {
    console.error('Error generating daily time records:', error);
    return { success: false, error: 'Failed to generate daily time records', details: error };
  }
}

// Check for missing dates and backfill them
export async function backfillMissingTimeRecords() {
  try {
    // Find the last date that has timeline records
    const lastRecord = await prisma.dailyTimeRecord.findFirst({
      orderBy: {
        date: 'desc'
      },
      select: {
        date: true
      }
    });
    
    const today = new Date();
    const startDate = lastRecord ? new Date(lastRecord.date) : today;
    
    // If last record is today or future, no backfill needed
    if (startDate >= today) {
      return { success: true, message: 'No backfill needed', recordsCreated: 0 };
    }
    
    let totalRecordsCreated = 0;
    const missingDates = [];
    
    // Generate records for each missing day
    const currentDate = new Date(startDate);
    currentDate.setDate(currentDate.getDate() + 1); // Start from the day after last record
    
    while (currentDate <= today) {
      const result = await generateDailyTimeRecords(new Date(currentDate));
      if (result.success) {
        totalRecordsCreated += result.recordsCreated || 0;
        if ((result.recordsCreated || 0) > 0) {
          missingDates.push(currentDate.toDateString());
        }
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Notify admin if we had to backfill missing dates
    if (missingDates.length > 0) {
      await createAdminNotification({
        type: 'TIMELINE_BACKFILL_COMPLETED',
        title: 'Timeline Records Backfilled',
        message: `System automatically backfilled timeline records for ${missingDates.length} missing dates.`,
        metadata: {
          missingDates,
          totalRecordsCreated,
          backfillDate: today.toISOString()
        }
      });
    }
    
    return { 
      success: true, 
      totalRecordsCreated, 
      missingDates,
      message: `Backfilled ${missingDates.length} missing dates` 
    };
  } catch (error) {
    console.error('Error backfilling timeline records:', error);
    return { success: false, error: 'Failed to backfill timeline records', details: error };
  }
}

// Get time records for admin view with filters
export async function getTimeRecords({
  branchId,
  userId,
  startDate,
  endDate,
  page = 1,
  limit = 50
}: {
  branchId?: string;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}) {
  try {
    const whereConditions: any = {};
    
    if (userId) {
      whereConditions.userId = userId;
    } else if (branchId) {
      whereConditions.user = {
        branchId: branchId
      };
    }
    
    if (startDate || endDate) {
      whereConditions.date = {};
      if (startDate) whereConditions.date.gte = startDate;
      if (endDate) whereConditions.date.lte = endDate;
    }

    const [records, total] = await Promise.all([
      prisma.dailyTimeRecord.findMany({
        where: whereConditions,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              branch: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        },
        orderBy: [
          { date: 'desc' },
          { user: { firstName: 'asc' } }
        ],
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.dailyTimeRecord.count({ where: whereConditions })
    ]);

    return {
      success: true,
      records,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    console.error('Error fetching time records:', error);
    return { success: false, error: 'Failed to fetch time records' };
  }
}

// Get time records for a specific employee (employee view)
export async function getEmployeeTimeRecords(userId: string, year?: number, month?: number) {
  try {
    const whereConditions: any = { userId };
    
    if (year) {
      if (month !== undefined) {
        // Specific month
        whereConditions.date = {
          gte: new Date(year, month, 1),
          lt: new Date(year, month + 1, 1)
        };
      } else {
        // Entire year
        whereConditions.date = {
          gte: new Date(year, 0, 1),
          lt: new Date(year + 1, 0, 1)
        };
      }
    }

    const records = await prisma.dailyTimeRecord.findMany({
      where: whereConditions,
      orderBy: { date: 'asc' }
    });

    // Calculate summary statistics
    let totalRequiredMinutes = 0;
    let totalActualMinutes = 0;
    let totalOvertimeMinutes = 0;
    let workingDays = 0;
    let presentDays = 0;

    records.forEach((record: any) => {
      if (record.requiredActiveTime) {
        workingDays++;
        totalRequiredMinutes += timeToMinutes(record.requiredActiveTime);
      }
      
      if (record.actualActiveTime) {
        presentDays++;
        totalActualMinutes += timeToMinutes(record.actualActiveTime);
      }
      
      if (record.overtimeUndertime) {
        const otMinutes = timeToMinutes(record.overtimeUndertime);
        totalOvertimeMinutes += otMinutes;
      }
    });

    const summary = {
      workingDays,
      presentDays,
      totalRequiredTime: minutesToTime(totalRequiredMinutes),
      totalActualTime: minutesToTime(totalActualMinutes),
      totalOvertime: minutesToTime(totalOvertimeMinutes),
      attendancePercentage: workingDays > 0 ? (presentDays / workingDays * 100).toFixed(1) : '0'
    };

    return {
      success: true,
      records,
      summary
    };
  } catch (error) {
    console.error('Error fetching employee time records:', error);
    return { success: false, error: 'Failed to fetch time records' };
  }
}

// Update actual times and recalculate overtime (admin function)
export async function updateTimeRecord(recordId: string, data: {
  actualCheckIn?: Date | null;
  actualCheckOut?: Date | null;
  actualBreakTime?: string | null;
}) {
  try {
    const record = await prisma.dailyTimeRecord.findUnique({
      where: { id: recordId }
    });

    if (!record) {
      return { success: false, error: 'Time record not found' };
    }

    // Calculate actual active time and overtime if we have all required data
    let actualActiveTime = null;
    let overtimeUndertime = null;

    if (data.actualCheckIn && data.actualCheckOut && data.actualBreakTime) {
      const workMinutes = (data.actualCheckOut.getTime() - data.actualCheckIn.getTime()) / (1000 * 60);
      const breakMinutes = timeToMinutes(data.actualBreakTime);
      const activeMinutes = workMinutes - breakMinutes;
      actualActiveTime = minutesToTime(activeMinutes);

      // Calculate overtime/undertime if we have required active time
      if (record.requiredActiveTime) {
        const requiredMinutes = timeToMinutes(record.requiredActiveTime);
        const otMinutes = activeMinutes - requiredMinutes;
        overtimeUndertime = minutesToTime(otMinutes);
      }
    }

    await prisma.dailyTimeRecord.update({
      where: { id: recordId },
      data: {
        actualCheckIn: data.actualCheckIn,
        actualCheckOut: data.actualCheckOut,
        actualBreakTime: data.actualBreakTime,
        actualActiveTime,
        overtimeUndertime
      }
    });

    revalidatePath('/admin/timeline');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error updating time record:', error);
    return { success: false, error: 'Failed to update time record' };
  }
}

// Update branch timeline settings
export async function updateBranchTimelineSettings(branchId: string, data: {
  checkInTime: string;
  checkOutTime: string;
  breakDuration: string;
  weeklyOffDays: string[];
}) {
  try {
    await prisma.branch.update({
      where: { id: branchId },
      data: {
        checkInTime: data.checkInTime,
        checkOutTime: data.checkOutTime,
        breakDuration: data.breakDuration,
        weeklyOffDays: data.weeklyOffDays
      }
    });

    // Regenerate future time records for users in this branch
    const today = new Date();
    const endOfYear = new Date(2030, 11, 31);
    
    // Delete future records for this branch's users to regenerate with new settings
    await prisma.dailyTimeRecord.deleteMany({
      where: {
        date: {
          gte: today
        },
        user: {
          branchId: branchId
        }
      }
    });
    
    // Regenerate records with new settings
    await generateTimeRecords(today, endOfYear);

    revalidatePath('/admin/branches');
    revalidatePath('/admin/timeline');
    return { success: true };
  } catch (error) {
    console.error('Error updating branch timeline settings:', error);
    return { success: false, error: 'Failed to update branch settings' };
  }
}