"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getDbUser } from "./user.actions";
import { createAdminNotification } from "./notification.actions";
import { updateTimelineRecordInTransaction } from "./timeline.actions";
import { Prisma } from "@prisma/client";
import { isArchivedStatus } from "@/lib/employee-status";

function normalizeDateOnly(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function shiftDateByDays(date: Date, days: number): Date {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

function combineDateAndTime(baseDate: Date, timeValue: string): Date {
  const combined = new Date(baseDate);
  const [hours, minutes] = timeValue.split(":").map(Number);
  combined.setHours(hours, minutes, 0, 0);
  return combined;
}

function getApprovalRecordDate(requestedDate: Date): Date {
  // DailyTimeRecord for timeline modification approval should align with the requested shift date.
  // Applying an additional -1 day shift here causes updates to land one day too early.
  return normalizeDateOnly(requestedDate);
}

function getRequestedShiftDate(requestedDate: Date): Date {
  return normalizeDateOnly(requestedDate);
}

function isManagerUser(user: { role: string; isManager?: boolean | null }) {
  return user.role === "EMPLOYEE" && !!user.isManager;
}

function isAdminUser(user: { role: string }) {
  return user.role === "SUPERADMIN" || user.role === "HR";
}

type SubmitTimelineModificationInput = {
  requestedDate: Date;
  requestedCheckIn?: Date | null;
  requestedCheckOut?: Date | null;
  requestedBreakTime?: string | null;
  reason?: string | null;
};

export async function submitTimelineModificationRequest(data: SubmitTimelineModificationInput) {
  try {
    const user = await getDbUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    if (user.role !== "EMPLOYEE") {
      return { success: false, error: "Only employees can submit timeline modification requests" };
    }

    // Check if employee is archived
    if (user.isArchived || isArchivedStatus(user.employeeStatus)) {
      return { success: false, error: "Archived employees cannot submit timeline modification requests" };
    }

    const hasAnyRequestedField = Boolean(
      data.requestedCheckIn || data.requestedCheckOut || (data.requestedBreakTime && data.requestedBreakTime.trim())
    );

    if (!hasAnyRequestedField) {
      return { success: false, error: "Please provide at least one requested modification" };
    }

    const targetDate = normalizeDateOnly(data.requestedDate);
    const today = normalizeDateOnly(new Date());
    if (targetDate > today) {
      return { success: false, error: "You can only request modifications for today or past dates" };
    }

    const existingPending = await prisma.timelineModificationRequest.findFirst({
      where: {
        userId: user.id,
        requestedDate: targetDate,
        status: "PENDING",
      },
    });

    if (existingPending) {
      return { success: false, error: "You already have a pending request for this date" };
    }

    const request = await prisma.timelineModificationRequest.create({
      data: {
        userId: user.id,
        requestedDate: targetDate,
        requestedCheckIn: data.requestedCheckIn ?? null,
        requestedCheckOut: data.requestedCheckOut ?? null,
        requestedBreakTime: data.requestedBreakTime?.trim() || null,
        reason: data.reason?.trim() || null,
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    await prisma.timelineModificationActionLog.create({
      data: {
        actionType: "REQUEST_CREATED",
        actionDetails: `Timeline modification request submitted for ${targetDate.toDateString()}`,
        actorId: user.id,
        targetUserId: user.id,
        requestId: request.id,
        metadata: {
          requestedDate: targetDate,
          requestedCheckIn: data.requestedCheckIn,
          requestedCheckOut: data.requestedCheckOut,
          requestedBreakTime: data.requestedBreakTime || null,
        },
      },
    });

    await createAdminNotification({
      type: "SYSTEM_ALERT",
      title: "Timeline Modification Request Pending",
      message: `${request.user.firstName || "Employee"} ${request.user.lastName || ""} submitted a timeline modification request for ${targetDate.toLocaleDateString()}.`,
      metadata: {
        timelineModificationRequestId: request.id,
        employeeId: user.id,
      },
    });

    revalidatePath("/timeline-modification-requests");
    revalidatePath("/admin/timeline-modification-requests");
    revalidatePath("/manager/timeline-modification-requests");

    return { success: true, data: request };
  } catch (error) {
    console.error("Error submitting timeline modification request:", error);

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
      return {
        success: false,
        error: "Timeline modification feature is not initialized in database yet. Please run Prisma migration first.",
      };
    }

    return { success: false, error: "Failed to submit timeline modification request" };
  }
}

export async function getMyTimelineModificationRequests() {
  try {
    const user = await getDbUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const requests = await prisma.timelineModificationRequest.findMany({
      where: { userId: user.id },
      include: {
        reviewedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: requests };
  } catch (error) {
    console.error("Error fetching own timeline modification requests:", error);
    return { success: false, error: "Failed to fetch timeline modification requests" };
  }
}

export async function getTimelineModificationRequests() {
  try {
    const user = await getDbUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    if (!isAdminUser(user) && !isManagerUser(user)) {
      return { success: false, error: "Unauthorized" };
    }

    const requests = await prisma.timelineModificationRequest.findMany({
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            attendanceId: true,
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
            branch: {
              select: {
                name: true,
              },
            },
          },
        },
        reviewedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: requests };
  } catch (error) {
    console.error("Error fetching timeline modification requests:", error);
    return { success: false, error: "Failed to fetch timeline modification requests" };
  }
}

export async function approveTimelineModificationRequest(requestId: string, reviewerNote?: string) {
  try {
    const reviewer = await getDbUser();
    if (!reviewer) {
      return { success: false, error: "Unauthorized" };
    }

    if (!isAdminUser(reviewer) && !isManagerUser(reviewer)) {
      return { success: false, error: "Unauthorized" };
    }

    const approvalResult = await prisma.$transaction(async (tx) => {
      const request = await tx.timelineModificationRequest.findUnique({
        where: { id: requestId },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              branch: {
                select: {
                  checkInTime: true,
                  checkOutTime: true,
                  breakDuration: true,
                },
              },
            },
          },
        },
      });

      if (!request) {
        throw new Error("Request not found");
      }

      if (request.status !== "PENDING") {
        throw new Error("Request has already been processed");
      }

      const requestedShiftDate = getRequestedShiftDate(new Date(request.requestedDate));
      const recordDate = getApprovalRecordDate(request.requestedDate);
      const branchCheckInTime = request.user.branch?.checkInTime || "09:00";
      const branchCheckOutTime = request.user.branch?.checkOutTime || "18:00";
      const branchBreakDuration = request.user.branch?.breakDuration || "01:00";

      let timeRecord = await tx.dailyTimeRecord.findUnique({
        where: {
          userId_date: {
            userId: request.userId,
            date: recordDate,
          },
        },
      });

      if (!timeRecord) {
        timeRecord = await tx.dailyTimeRecord.create({
          data: {
            userId: request.userId,
            date: recordDate,
            status: "PRESENT",
            requiredCheckIn: combineDateAndTime(requestedShiftDate, branchCheckInTime),
            requiredCheckOut: combineDateAndTime(requestedShiftDate, branchCheckOutTime),
            requiredBreakTime: branchBreakDuration,
            actualCheckIn: request.requestedCheckIn,
            actualCheckOut: request.requestedCheckOut,
            actualBreakTime: request.requestedBreakTime || branchBreakDuration,
            isProcessed: true,
          },
        });
      }

      const timelineUpdateResult = await updateTimelineRecordInTransaction(tx, timeRecord.id, {
        requiredCheckIn: combineDateAndTime(requestedShiftDate, branchCheckInTime),
        requiredCheckOut: combineDateAndTime(requestedShiftDate, branchCheckOutTime),
        requiredBreakTime: branchBreakDuration,
        actualCheckIn: request.requestedCheckIn,
        actualCheckOut: request.requestedCheckOut,
        actualBreakTime: request.requestedBreakTime || branchBreakDuration,
        status: "PRESENT",
        isProcessed: true,
      });

      if (!timelineUpdateResult.success) {
        throw new Error(timelineUpdateResult.error || "Failed to apply timeline changes");
      }

      const updatedRequest = await tx.timelineModificationRequest.update({
        where: { id: requestId },
        data: {
          status: "APPROVED",
          reviewedById: reviewer.id,
          reviewerNote: reviewerNote?.trim() || null,
          reviewedAt: new Date(),
          appliedAt: new Date(),
        },
      });

      await tx.timelineModificationActionLog.create({
        data: {
          actionType: "REQUEST_APPROVED",
          actionDetails: `Timeline modification request approved by ${reviewer.firstName || "Reviewer"} ${reviewer.lastName || ""}`,
          actorId: reviewer.id,
          targetUserId: request.userId,
          requestId: request.id,
          dailyTimeRecordId: timeRecord.id,
          metadata: {
            reviewerRole: reviewer.role,
            reviewerNote: reviewerNote || null,
            requestedDate: requestedShiftDate,
            timelineRecordDate: recordDate,
          },
        },
      });

      await tx.employeeNotification.create({
        data: {
          userId: request.userId,
          type: "TIMELINE_MODIFICATION_REQUEST_APPROVED",
          title: "Timeline Modification Request Approved",
          message: `Your timeline modification request for ${requestedShiftDate.toLocaleDateString()} has been approved and applied to ${recordDate.toLocaleDateString()}.`,
          relatedDate: recordDate,
          relatedEntityId: request.id,
        },
      });

      return { request, updatedRequest, recordDate };
    }, {
      maxWait: 10000,
      timeout: 120000,
    });

    const { request, updatedRequest, recordDate } = approvalResult;

    if (isManagerUser(reviewer)) {
      await createAdminNotification({
        type: "SYSTEM_ALERT",
        title: "Manager Approved Timeline Modification Request",
        message: `Manager ${reviewer.firstName || ""} ${reviewer.lastName || ""} approved timeline modification request of ${request.user.firstName || "Employee"} ${request.user.lastName || ""} for ${recordDate.toLocaleDateString()}.`,
        metadata: {
          requestId: request.id,
          managerId: reviewer.id,
          employeeId: request.userId,
          action: "APPROVED",
          requestedDate: request.requestedDate,
          timelineRecordDate: recordDate,
        },
      });
    }

    revalidatePath("/timeline-modification-requests");
    revalidatePath("/admin/timeline-modification-requests");
    revalidatePath("/manager/timeline-modification-requests");
    revalidatePath("/admin/timeline");
    revalidatePath("/manager/timeline");

    return { success: true, data: updatedRequest };
  } catch (error) {
    console.error("Error approving timeline modification request:", error);
    if (error instanceof Error && error.message) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to approve timeline modification request" };
  }
}

export async function rejectTimelineModificationRequest(requestId: string, reviewerNote: string) {
  try {
    const reviewer = await getDbUser();
    if (!reviewer) {
      return { success: false, error: "Unauthorized" };
    }

    if (!isAdminUser(reviewer) && !isManagerUser(reviewer)) {
      return { success: false, error: "Unauthorized" };
    }

    if (!reviewerNote || reviewerNote.trim() === "") {
      return { success: false, error: "Rejection reason is required" };
    }

    const request = await prisma.timelineModificationRequest.findUnique({
      where: { id: requestId },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!request) {
      return { success: false, error: "Request not found" };
    }

    if (request.status !== "PENDING") {
      return { success: false, error: "Request has already been processed" };
    }

    const updatedRequest = await prisma.timelineModificationRequest.update({
      where: { id: requestId },
      data: {
        status: "REJECTED",
        reviewedById: reviewer.id,
        reviewerNote: reviewerNote.trim(),
        reviewedAt: new Date(),
      },
    });

    await prisma.timelineModificationActionLog.create({
      data: {
        actionType: "REQUEST_REJECTED",
        actionDetails: `Timeline modification request rejected by ${reviewer.firstName || "Reviewer"} ${reviewer.lastName || ""}`,
        actorId: reviewer.id,
        targetUserId: request.userId,
        requestId: request.id,
        metadata: {
          reviewerRole: reviewer.role,
          reviewerNote: reviewerNote.trim(),
        },
      },
    });

    await prisma.employeeNotification.create({
      data: {
        userId: request.userId,
        type: "TIMELINE_MODIFICATION_REQUEST_REJECTED",
        title: "Timeline Modification Request Rejected",
        message: `Your timeline modification request for ${new Date(request.requestedDate).toLocaleDateString()} was rejected. Reason: ${reviewerNote.trim()}`,
        relatedDate: new Date(request.requestedDate),
        relatedEntityId: request.id,
      },
    });

    if (isManagerUser(reviewer)) {
      await createAdminNotification({
        type: "SYSTEM_ALERT",
        title: "Manager Rejected Timeline Modification Request",
        message: `Manager ${reviewer.firstName || ""} ${reviewer.lastName || ""} rejected timeline modification request of ${request.user.firstName || "Employee"} ${request.user.lastName || ""}.`,
        metadata: {
          requestId: request.id,
          managerId: reviewer.id,
          employeeId: request.userId,
          action: "REJECTED",
          reviewerNote: reviewerNote.trim(),
        },
      });
    }

    revalidatePath("/timeline-modification-requests");
    revalidatePath("/admin/timeline-modification-requests");
    revalidatePath("/manager/timeline-modification-requests");

    return { success: true, data: updatedRequest };
  } catch (error) {
    console.error("Error rejecting timeline modification request:", error);
    return { success: false, error: "Failed to reject timeline modification request" };
  }
}

export async function cancelTimelineModificationRequest(requestId: string) {
  try {
    const user = await getDbUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const request = await prisma.timelineModificationRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      return { success: false, error: "Request not found" };
    }

    if (request.userId !== user.id) {
      return { success: false, error: "Unauthorized" };
    }

    if (request.status !== "PENDING") {
      return { success: false, error: "Only pending requests can be cancelled" };
    }

    await prisma.timelineModificationRequest.delete({
      where: { id: requestId },
    });

    await prisma.timelineModificationActionLog.create({
      data: {
        actionType: "REQUEST_CANCELLED",
        actionDetails: "Timeline modification request cancelled by employee",
        actorId: user.id,
        targetUserId: user.id,
        requestId,
      },
    });

    revalidatePath("/timeline-modification-requests");
    revalidatePath("/admin/timeline-modification-requests");
    revalidatePath("/manager/timeline-modification-requests");

    return { success: true };
  } catch (error) {
    console.error("Error cancelling timeline modification request:", error);
    return { success: false, error: "Failed to cancel timeline modification request" };
  }
}
