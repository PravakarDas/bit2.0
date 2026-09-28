"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { OvertimeRequestStatus } from "@prisma/client";
import { isArchivedStatus } from "@/lib/employee-status";
import { notificationEngineContainer } from "@/lib/services/notification-engine";

// Helper to convert HH:MM to minutes
function timeStringToMinutes(timeStr: string): number {
  const isNegative = timeStr.startsWith("-");
  const cleanStr = timeStr.replace("-", "");
  const [hours, minutes] = cleanStr.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes;
  return isNegative ? -totalMinutes : totalMinutes;
}

// Helper to convert minutes to HH:MM
function minutesToTimeString(minutes: number): string {
  const isNegative = minutes < 0;
  const absMinutes = Math.abs(minutes);
  const hours = Math.floor(absMinutes / 60);
  const mins = absMinutes % 60;
  const timeStr = `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
  return isNegative ? `-${timeStr}` : timeStr;
}

// Helper to add time strings
function addTimeStrings(time1?: string | null, time2?: string | null): string {
  if (!time1 && !time2) return "00:00";
  if (!time1) return time2 || "00:00";
  if (!time2) return time1 || "00:00";
  
  const minutes1 = timeStringToMinutes(time1);
  const minutes2 = timeStringToMinutes(time2);
  return minutesToTimeString(minutes1 + minutes2);
}

function buildDateTimeFromDateAndTime(baseDate: Date, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const result = new Date(baseDate);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function calculateDurationFromTimes(startTime: string, endTime: string): string {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const startTotal = startHour * 60 + startMinute;
  const endTotal = endHour * 60 + endMinute;

  if (endTotal <= startTotal) {
    throw new Error("Overtime end time must be later than start time");
  }

  return minutesToTimeString(endTotal - startTotal);
}

function minDate(dateA: Date, dateB: Date): Date {
  return dateA.getTime() <= dateB.getTime() ? dateA : dateB;
}

function maxDate(dateA: Date, dateB: Date): Date {
  return dateA.getTime() >= dateB.getTime() ? dateA : dateB;
}

/**
 * Employee: Submit overtime request
 */
export async function submitOvertimeRequest(data: {
  overtimeDate: Date;
  requestedOTstart: string;
  requestedOTend: string;
  reason: string;
  taskNo?: string;
}) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true, firstName: true, lastName: true, role: true, isArchived: true, employeeStatus: true },
    });

    if (!user) {
      return { success: false, error: "User not found" };
    }

    // Ensure employee role
    if (user.role !== "EMPLOYEE") {
      return { success: false, error: "Only employees can submit overtime requests" };
    }

    // Check if employee is archived
    if (user.isArchived || isArchivedStatus(user.employeeStatus)) {
      return { success: false, error: "Archived employees cannot submit overtime requests" };
    }

    // Validate overtime start/end format (HH:MM)
    const timeRegex = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;
    if (!timeRegex.test(data.requestedOTstart) || !timeRegex.test(data.requestedOTend)) {
      return { success: false, error: "Invalid time format. Use HH:MM" };
    }

    const requestedOTStartDate = buildDateTimeFromDateAndTime(data.overtimeDate, data.requestedOTstart);
    const requestedOTEndDate = buildDateTimeFromDateAndTime(data.overtimeDate, data.requestedOTend);

    let totalOvertime: string;
    try {
      totalOvertime = calculateDurationFromTimes(data.requestedOTstart, data.requestedOTend);
    } catch (error) {
      if (error instanceof Error) {
        return { success: false, error: error.message };
      }
      return { success: false, error: "Invalid overtime time range" };
    }

    // Check if there's already a pending request for this date
    const existingRequest = await prisma.overtimeRequest.findFirst({
      where: {
        userId: user.id,
        overtimeDate: data.overtimeDate,
        status: "PENDING",
      },
    });

    if (existingRequest) {
      return { success: false, error: "You already have a pending request for this date" };
    }

    // Create overtime request
    const overtimeRequest = await prisma.overtimeRequest.create({
      data: {
        userId: user.id,
        overtimeDate: data.overtimeDate,
        totalOvertime,
        requestedOTstart: requestedOTStartDate,
        requestedOTend: requestedOTEndDate,
        reason: data.reason,
        taskNo: data.taskNo,
      },
    });

    revalidatePath("/employee/overtime-requests");
    
    return { success: true, data: overtimeRequest };
  } catch (error) {
    console.error("Error submitting overtime request:", error);
    return { success: false, error: "Failed to submit overtime request" };
  }
}

/**
 * Admin: Get all overtime requests (with optional filters)
 */
export async function getOvertimeRequests(filters?: {
  status?: OvertimeRequestStatus;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
}) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return { success: false, error: "Unauthorized" };
    }

    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { role: true },
    });

    if (!user || (user.role !== "SUPERADMIN" && user.role !== "HR")) {
      return { success: false, error: "Unauthorized: Admin access required" };
    }

    // Build where clause
    interface WhereClause {
      status?: OvertimeRequestStatus;
      userId?: string;
      overtimeDate?: {
        gte?: Date;
        lte?: Date;
      };
    }

    const where: WhereClause = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.userId) {
      where.userId = filters.userId;
    }

    if (filters?.startDate || filters?.endDate) {
      where.overtimeDate = {};
      if (filters.startDate) {
        where.overtimeDate.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.overtimeDate.lte = filters.endDate;
      }
    }

    const requests = await prisma.overtimeRequest.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            attendanceId: true,
            branch: {
              select: {
                name: true,
              },
            },
            department: {
              select: {
                name: true,
              },
            },
            designation: {
              select: {
                name: true,
              },
            },
          },
        },
        managerVerifiedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        requestedAt: "desc",
      },
    });

    return { success: true, data: requests };
  } catch (error) {
    console.error("Error fetching overtime requests:", error);
    return { success: false, error: "Failed to fetch overtime requests" };
  }
}

/**
 * Employee: Get own overtime requests
 */
export async function getMyOvertimeRequests() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return { success: false, error: "Unauthorized" };
    }

    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });

    if (!user) {
      return { success: false, error: "User not found" };
    }

    const requests = await prisma.overtimeRequest.findMany({
      where: {
        userId: user.id,
      },
      include: {
        managerVerifiedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        requestedAt: "desc",
      },
    });

    return { success: true, data: requests };
  } catch (error) {
    console.error("Error fetching my overtime requests:", error);
    return { success: false, error: "Failed to fetch overtime requests" };
  }
}

/**
 * Admin: Approve overtime request
 */
export async function approveOvertimeRequest(requestId: string) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return { success: false, error: "Unauthorized" };
    }

    const admin = await prisma.user.findUnique({
      where: { clerkId },
      select: { role: true, firstName: true, lastName: true },
    });

    if (!admin || (admin.role !== "SUPERADMIN" && admin.role !== "HR")) {
      return { success: false, error: "Unauthorized: Admin access required" };
    }

    // Get the overtime request
    const request = await prisma.overtimeRequest.findUnique({
      where: { id: requestId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!request) {
      return { success: false, error: "Request not found" };
    }

    // Allow approval for manager-verified or pending requests
    if (request.status !== "PENDING" && request.status !== "MANAGER_VERIFIED") {
      return { success: false, error: "Request has already been processed" };
    }

    // Start a transaction to update both the request and the timeline
    const result = await prisma.$transaction(async (tx) => {
      // Update the overtime request
      const updatedRequest = await tx.overtimeRequest.update({
        where: { id: requestId },
        data: {
          status: "APPROVED",
          reviewedBy: clerkId,
          reviewedAt: new Date(),
        },
      });

      // Get or create the daily time record for this date
      const startOfDay = new Date(request.overtimeDate);
      startOfDay.setHours(0, 0, 0, 0);

      const timeRecord = await tx.dailyTimeRecord.findUnique({
        where: {
          userId_date: {
            userId: request.userId,
            date: startOfDay,
          },
        },
      });

      if (timeRecord) {
        // Update existing record
        const newRequestedOvertime = addTimeStrings(
          timeRecord.requestedOvertime,
          request.totalOvertime
        );

        // officialOvertimeundertime = overtimeUndertime (office) + requestedOvertime (grand total).
        // The office piece (overtimeUndertime) is unaffected by approving overtime.
        const newOfficialOvertimeundertime = addTimeStrings(
          timeRecord.overtimeUndertime,
          newRequestedOvertime
        );

        await tx.dailyTimeRecord.update({
          where: { id: timeRecord.id },
          data: {
            requestedOvertime: newRequestedOvertime,
            requestedOTstart: timeRecord.requestedOTstart && request.requestedOTstart
              ? minDate(timeRecord.requestedOTstart, request.requestedOTstart)
              : (timeRecord.requestedOTstart || request.requestedOTstart),
            requestedOTend: timeRecord.requestedOTend && request.requestedOTend
              ? maxDate(timeRecord.requestedOTend, request.requestedOTend)
              : (timeRecord.requestedOTend || request.requestedOTend),
            officialOvertimeundertime: newOfficialOvertimeundertime,
          },
        });
      } else {
        // Create new record if it doesn't exist. No attendance yet, so the office
        // piece is 0 and the total equals the requested (work-from-home) overtime.
        await tx.dailyTimeRecord.create({
          data: {
            userId: request.userId,
            date: startOfDay,
            status: "PRESENT",
            requestedOvertime: request.totalOvertime,
            requestedOTstart: request.requestedOTstart,
            requestedOTend: request.requestedOTend,
            overtimeUndertime: "00:00",
            officialOvertimeundertime: request.totalOvertime,
          },
        });
      }

      // Create employee notification
      await tx.employeeNotification.create({
        data: {
          userId: request.userId,
          type: "OVERTIME_REQUEST_APPROVED",
          title: "Overtime Request Approved",
          message: `Your overtime request for ${request.totalOvertime} hours on ${new Date(request.overtimeDate).toLocaleDateString()} has been approved by ${admin.firstName} ${admin.lastName}`,
          relatedDate: request.overtimeDate,
          relatedEntityId: request.id,
        },
      });

      if (request.managerVerifiedById) {
        await tx.employeeNotification.create({
          data: {
            userId: request.managerVerifiedById,
            type: "OVERTIME_REQUEST_APPROVED",
            title: "Overtime Request Approved by Admin",
            message: `The overtime request you verified for ${request.user.firstName} ${request.user.lastName} (${request.totalOvertime} hours on ${new Date(request.overtimeDate).toLocaleDateString()}) has been approved by ${admin.firstName} ${admin.lastName}.`,
            relatedDate: request.overtimeDate,
            relatedEntityId: request.id,
          }
        });
      }

      return updatedRequest;
    });

    revalidatePath("/admin/overtime-requests");
    revalidatePath("/admin/notifications");
    revalidatePath("/employee/overtime-requests");
    revalidatePath("/employee/attendance");

    // Notification Engine integration (Phase 15) — best-effort, after the
    // transaction commits: a business action's own success must never hinge
    // on a notification going out. Same pattern as approveLoan()'s
    // LOAN_APPROVED call (loan.actions.ts).
    if (request.user.email) {
      try {
        await notificationEngineContainer.notificationService.raiseEvent({
          eventType: "OVERTIME_REQUEST_APPROVED",
          dedupeKey: `OVERTIME_REQUEST_APPROVED:${requestId}`,
          sourceDomain: "overtime",
          payload: {
            employee: {
              id: request.user.id,
              name: `${request.user.firstName ?? ""} ${request.user.lastName ?? ""}`.trim() || request.user.email,
            },
            totalOvertime: request.totalOvertime,
            overtimeDate: request.overtimeDate.toISOString(),
            approvedBy: `${admin.firstName ?? ""} ${admin.lastName ?? ""}`.trim(),
          },
          recipients: [
            { channel: "EMAIL", recipientAddress: request.user.email, recipientUserId: request.user.id },
          ],
        });
      } catch (error) {
        console.error("notificationService.raiseEvent(OVERTIME_REQUEST_APPROVED) failed:", error);
      }
    }

    return { success: true, data: result };
  } catch (error) {
    console.error("Error approving overtime request:", error);
    return { success: false, error: "Failed to approve overtime request" };
  }
}

/**
 * Admin: Decline overtime request
 */
export async function declineOvertimeRequest(requestId: string, declineReason: string) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return { success: false, error: "Unauthorized" };
    }

    const admin = await prisma.user.findUnique({
      where: { clerkId },
      select: { role: true, firstName: true, lastName: true },
    });

    if (!admin || (admin.role !== "SUPERADMIN" && admin.role !== "HR")) {
      return { success: false, error: "Unauthorized: Admin access required" };
    }

    // Get the overtime request
    const request = await prisma.overtimeRequest.findUnique({
      where: { id: requestId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!request) {
      return { success: false, error: "Request not found" };
    }

    // Allow decline for manager-verified or pending requests
    if (request.status !== "PENDING" && request.status !== "MANAGER_VERIFIED") {
      return { success: false, error: "Request has already been processed" };
    }

    // Update the overtime request
    const updatedRequest = await prisma.overtimeRequest.update({
      where: { id: requestId },
      data: {
        status: "DECLINED",
        reviewedBy: clerkId,
        reviewedAt: new Date(),
        declineReason,
        adminDeclinedReason: declineReason,
        adminDeclinedAt: new Date(),
      },
    });

    // Create employee notification
    await prisma.employeeNotification.create({
      data: {
        userId: request.userId,
        type: "OVERTIME_REQUEST_DECLINED",
        title: "Overtime Request Declined",
        message: `Your overtime request for ${request.totalOvertime} hours on ${new Date(request.overtimeDate).toLocaleDateString()} has been declined. Reason: ${declineReason}`,
        relatedDate: request.overtimeDate,
        relatedEntityId: request.id,
      },
    });

    if (updatedRequest.managerVerifiedById) {
      await prisma.employeeNotification.create({
        data: {
          userId: updatedRequest.managerVerifiedById,
          type: "OVERTIME_REQUEST_DECLINED",
          title: "Verified Overtime Request Declined by Admin",
          message: `The overtime request you verified for ${request.user.firstName} ${request.user.lastName} (${request.totalOvertime} hours on ${new Date(request.overtimeDate).toLocaleDateString()}) has been declined by ${admin.firstName} ${admin.lastName}. Reason: ${declineReason}`,
          relatedDate: request.overtimeDate,
          relatedEntityId: request.id,
        }
      });
    }

    revalidatePath("/admin/overtime-requests");
    revalidatePath("/admin/notifications");
    revalidatePath("/employee/overtime-requests");

    // Notification Engine integration (Phase 15) — best-effort, after the
    // update commits; see approveOvertimeRequest's identical comment.
    if (request.user.email) {
      try {
        await notificationEngineContainer.notificationService.raiseEvent({
          eventType: "OVERTIME_REQUEST_DECLINED",
          dedupeKey: `OVERTIME_REQUEST_DECLINED:${requestId}`,
          sourceDomain: "overtime",
          payload: {
            employee: {
              id: request.user.id,
              name: `${request.user.firstName ?? ""} ${request.user.lastName ?? ""}`.trim() || request.user.email,
            },
            totalOvertime: request.totalOvertime,
            overtimeDate: request.overtimeDate.toISOString(),
            declinedBy: `${admin.firstName ?? ""} ${admin.lastName ?? ""}`.trim(),
            declineReason,
          },
          recipients: [
            { channel: "EMAIL", recipientAddress: request.user.email, recipientUserId: request.user.id },
          ],
        });
      } catch (error) {
        console.error("notificationService.raiseEvent(OVERTIME_REQUEST_DECLINED) failed:", error);
      }
    }

    return { success: true, data: updatedRequest };
  } catch (error) {
    console.error("Error declining overtime request:", error);
    return { success: false, error: "Failed to decline overtime request" };
  }
}

/**
 * Employee: Cancel own pending overtime request
 */
export async function cancelOvertimeRequest(requestId: string) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return { success: false, error: "Unauthorized" };
    }

    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });

    if (!user) {
      return { success: false, error: "User not found" };
    }

    // Get the overtime request
    const request = await prisma.overtimeRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      return { success: false, error: "Request not found" };
    }

    // Ensure the request belongs to the user
    if (request.userId !== user.id) {
      return { success: false, error: "Unauthorized: You can only cancel your own requests" };
    }

    if (request.status !== "PENDING") {
      return { success: false, error: "Only pending requests can be cancelled" };
    }

    // Delete the request
    await prisma.overtimeRequest.delete({
      where: { id: requestId },
    });

    revalidatePath("/employee/overtime-requests");

    return { success: true };
  } catch (error) {
    console.error("Error cancelling overtime request:", error);
    return { success: false, error: "Failed to cancel overtime request" };
  }
}
