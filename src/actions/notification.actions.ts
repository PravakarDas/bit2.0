"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { EmployeeStatus, Prisma } from "@prisma/client";
import type { AdminNotification, NotificationStatus } from "@prisma/client";
import { getDbUser } from "./user.actions";
import {
  canManageAdminNotificationInbox,
  canProcessAdminNotificationAction,
  hasNotificationId,
  isValidNotificationDecision,
} from "@/lib/notification-action-authorization";

type NotificationMetadata = {
  requestId?: string;
  applicationId?: string;
  processed?: boolean;
  status?: string;
  action?: "approve" | "decline";
  adminNote?: string | null;
  processedAt?: string;
};

// Create admin notification
export async function createAdminNotification(data: {
  type: 'TIMELINE_GENERATION_FAILED' | 'TIMELINE_BACKFILL_COMPLETED' | 'PROFILE_UPDATE_REQUEST' | 'LEAVE_APPLICATION_PENDING' | 'INCREMENT_REMINDER' | 'WALLET_REQUEST_PENDING' | 'LOAN_APPLICATION_PENDING' | 'EMPLOYEE_REGISTRATION_PENDING' | 'PAYROLL_NOTIFICATION' | 'SYSTEM_ALERT' | 'DEADLINE_REMINDER';
  title: string;
  message: string;
  metadata?: NotificationMetadata | Record<string, unknown>;
}) {
  try {
    const notification = await prisma.adminNotification.create({
      data: {
        type: data.type,
        title: data.title,
        message: data.message,
        metadata: (data.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput
      }
    });
    
    revalidatePath('/admin');
    return { success: true, notification };
  } catch (error) {
    console.error('Error creating admin notification:', error);
    return { success: false, error: 'Failed to create notification' };
  }
}

// Get unread notifications for admin
export async function getUnreadNotifications() {
  const user = await getDbUser();
  if (!canManageAdminNotificationInbox(user)) {
    throw new Error("Unauthorized");
  }

  try {
    const notifications = await prisma.adminNotification.findMany({
      where: {
        status: 'UNREAD'
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    return { success: true, notifications };
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return { success: false, error: 'Failed to fetch notifications' };
  }
}

/**
 * Actual status-setting logic, with no authorization check of its own —
 * only ever called from (a) `markNotificationAsRead`/`markNotificationAsUnread`
 * below, both of which check `canManageAdminNotificationInbox` first, or
 * (b) `handleNotificationAction`, which has already independently verified
 * the caller via `canProcessAdminNotificationAction` (a intentionally wider
 * rule — see notification-action-authorization.ts) before ever reaching
 * this helper. Not exported — never reachable without one of those two
 * checks having already run.
 */
async function setAdminNotificationStatus(notificationId: string, status: NotificationStatus) {
  await prisma.adminNotification.update({
    where: { id: notificationId },
    data: { status }
  });
  revalidatePath('/admin');
}

// Mark notification as read
export async function markNotificationAsRead(notificationId: string) {
  const user = await getDbUser();
  if (!canManageAdminNotificationInbox(user)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    await setAdminNotificationStatus(notificationId, 'READ');
    return { success: true };
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return { success: false, error: 'Failed to mark notification as read' };
  }
}

// Mark all notifications as read
export async function markAllNotificationsAsRead() {
  const user = await getDbUser();
  if (!canManageAdminNotificationInbox(user)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    await prisma.adminNotification.updateMany({
      where: { status: 'UNREAD' },
      data: { status: 'READ' }
    });

    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return { success: false, error: 'Failed to mark notifications as read' };
  }
}

// Mark notification as unread
export async function markNotificationAsUnread(notificationId: string) {
  const user = await getDbUser();
  if (!canManageAdminNotificationInbox(user)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    await setAdminNotificationStatus(notificationId, 'UNREAD');
    return { success: true };
  } catch (error) {
    console.error('Error marking notification as unread:', error);
    return { success: false, error: 'Failed to mark notification as unread' };
  }
}

// Get all notifications (with pagination)
export async function getAllNotifications(
  page = 1,
  limit = 20,
  filter?: 'READ' | 'UNREAD',
  fromDate?: string,
  toDate?: string
): Promise<
  | { success: true; notifications: AdminNotification[]; pagination: { current: number; total: number; count: number } }
  | { success: false; error: string }
> {
  const user = await getDbUser();
  if (!canManageAdminNotificationInbox(user)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const skip = (page - 1) * limit;
    const where: Prisma.AdminNotificationWhereInput = {};

    if (filter) {
      where.status = filter;
    }

    if (fromDate || toDate) {
      const createdAtFilter: Prisma.DateTimeFilter = {};

      if (fromDate) {
        const parsedFromDate = new Date(fromDate);
        parsedFromDate.setHours(0, 0, 0, 0);
        createdAtFilter.gte = parsedFromDate;
      }

      if (toDate) {
        const parsedToDate = new Date(toDate);
        parsedToDate.setHours(23, 59, 59, 999);
        createdAtFilter.lte = parsedToDate;
      }

      where.createdAt = createdAtFilter;
    }
    
    const [notifications, total] = await Promise.all([
      prisma.adminNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.adminNotification.count({ where })
    ]);
    
    return { 
      success: true, 
      notifications, 
      pagination: {
        current: page,
        total: Math.max(1, Math.ceil(total / limit)),
        count: total
      }
    };
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return { success: false, error: 'Failed to fetch notifications' };
  }
}

// Get unread count
export async function getUnreadCount(): Promise<
  | { success: true; count: number }
  | { success: false; error: string }
> {
  const user = await getDbUser();
  if (!canManageAdminNotificationInbox(user)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const count = await prisma.adminNotification.count({
      where: { status: 'UNREAD' }
    });
    
    return { success: true, count };
  } catch (error) {
    console.error('Error getting unread count:', error);
    return { success: false, error: 'Failed to get unread count' };
  }
}

// Delete notification
export async function deleteNotification(notificationId: string) {
  const user = await getDbUser();
  if (!canManageAdminNotificationInbox(user)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    await prisma.adminNotification.delete({
      where: { id: notificationId }
    });
    
    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('Error deleting notification:', error);
    return { success: false, error: 'Failed to delete notification' };
  }
}

// Approve/Decline actions based on notification type and metadata
export async function handleNotificationAction(notificationId: string, action: 'approve' | 'decline', adminNote?: string) {
  try {
    // Phase 17: authorization is verified server-side, before the target
    // notification is even read, and before any delegated business action
    // runs. `handleNotificationAction` previously had NO check at all —
    // every branch below is an admin/HR/manager-approval workflow (no
    // branch is ever legitimately self-service for a plain employee), so a
    // caller who fails this check cannot reach any of them, including the
    // two branches below (LOAN_APPLICATION_PENDING/WALLET_REQUEST_PENDING)
    // that currently have no delegated authorization of their own to fall
    // back on. See NotificationActionAuthorizationReport.md.
    const admin = await getDbUser();
    if (!canProcessAdminNotificationAction(admin)) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!isValidNotificationDecision(action)) {
      return { success: false, error: 'Invalid action' };
    }

    if (!hasNotificationId(notificationId)) {
      return { success: false, error: 'Missing notification ID' };
    }

    const notification = await prisma.adminNotification.findUnique({
      where: { id: notificationId }
    });

    if (!notification) {
      return { success: false, error: 'Notification not found' };
    }

    let result;
    const metadata = (notification.metadata ?? {}) as NotificationMetadata;

    switch (notification.type) {
      case 'PROFILE_UPDATE_REQUEST':
        if (action === 'approve') {
          // Import and use profile actions
          const { approveProfileUpdateRequest } = await import('./profile.actions');
          if (!metadata.requestId) return { success: false, error: 'Missing profile request ID' };
          result = await approveProfileUpdateRequest(metadata.requestId);
        } else {
          const { rejectProfileUpdateRequest } = await import('./profile.actions');
          if (!metadata.requestId) return { success: false, error: 'Missing profile request ID' };
          result = await rejectProfileUpdateRequest(metadata.requestId, adminNote ?? '');
        }
        break;
        
      case 'LEAVE_APPLICATION_PENDING':
        // Phase 16: approveLeaveApplication/rejectLeaveApplication's second
        // parameter is now genuinely an admin note (never an identity/role
        // string — the caller's own identity is resolved and authorized
        // server-side). Previously this call site passed `adminNote` into
        // what was then an `approvedBy` slot — a pre-existing bug, fixed
        // here as part of the same audit, not a behavior this call site
        // ever correctly relied on.
        if (action === 'approve') {
          const { approveLeaveApplication } = await import('./leave.actions');
          if (!metadata.applicationId) return { success: false, error: 'Missing leave application ID' };
          result = await approveLeaveApplication(metadata.applicationId, adminNote);
        } else {
          const { rejectLeaveApplication } = await import('./leave.actions');
          if (!metadata.applicationId) return { success: false, error: 'Missing leave application ID' };
          result = await rejectLeaveApplication(metadata.applicationId, adminNote);
        }
        break;
        
      case 'LOAN_APPLICATION_PENDING':
        // Handle loan approvals
        result = { success: true, message: `Loan application ${action}d successfully` };
        break;
        
      case 'WALLET_REQUEST_PENDING':
        // Handle wallet request approvals
        result = { success: true, message: `Wallet request ${action}d successfully` };
        break;
        
      default:
        return { success: false, error: 'Action not supported for this notification type' };
    }

    if (result?.success) {
      // Mark notification as read and processed after successful action.
      // Calls the internal helper directly (not the exported
      // `markNotificationAsRead`, which is intentionally narrower —
      // SUPERADMIN/HR only) since this function has already authorized the
      // caller above under the correct, wider rule for this specific flow
      // (a manager approving their own legitimately-delegated request).
      await setAdminNotificationStatus(notificationId, 'READ');

      // Update metadata to mark as processed
      const updatedMetadata = {
        ...metadata,
        processed: true,
        processedAt: new Date().toISOString(),
        action: action,
        adminNote: adminNote || null
      };
      
      await prisma.adminNotification.update({
        where: { id: notificationId },
        data: { metadata: updatedMetadata }
      });
    }

    return result;
  } catch (error) {
    console.error('Error handling notification action:', error);
    return { success: false, error: 'Failed to process action' };
  }
}

// Check for employees with upcoming anniversaries and create increment reminder notifications
export async function checkAndCreateIncrementReminders(): Promise<
  | { success: true; remindersCreated: Array<{ userId: string; userName: string; anniversaryDate: Date; yearsOfService: number }> }
  | { success: false; error: string }
> {
  try {
    const today = new Date();
    const oneWeekFromToday = new Date(today);
    oneWeekFromToday.setDate(today.getDate() + 7);
    
    // Get all active employees
    const employees = await prisma.user.findMany({
      where: {
        employeeStatus: EmployeeStatus.ACTIVE,
        dateOfJoining: { not: null }
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        dateOfJoining: true
      }
    });

    const remindersCreated = [];

    for (const employee of employees) {
      if (!employee.dateOfJoining) continue;

      const joiningDate = new Date(employee.dateOfJoining);
      const currentYear = today.getFullYear();
      
      // Calculate this year's anniversary
      const thisYearAnniversary = new Date(currentYear, joiningDate.getMonth(), joiningDate.getDate());
      
      // If this year's anniversary has passed, calculate next year's anniversary
      const anniversaryDate = thisYearAnniversary < today 
        ? new Date(currentYear + 1, joiningDate.getMonth(), joiningDate.getDate())
        : thisYearAnniversary;
      
      // Check if anniversary is exactly 7 days from today
      const daysDifference = Math.ceil((anniversaryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysDifference === 7) {
        // Calculate years of service
        const yearsOfService = anniversaryDate.getFullYear() - joiningDate.getFullYear();
        
        // Check if notification already exists for this employee's anniversary
        const existingNotification = await prisma.adminNotification.findFirst({
          where: {
            type: 'INCREMENT_REMINDER',
            metadata: {
              path: ['userId'],
              equals: employee.id
            },
            createdAt: {
              gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
              lt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
            }
          }
        });

        if (!existingNotification) {
          const notification = await createAdminNotification({
            type: 'INCREMENT_REMINDER',
            title: 'Employee Anniversary Reminder',
            message: `${employee.firstName} ${employee.lastName} will complete ${yearsOfService} year${yearsOfService > 1 ? 's' : ''} of service on ${anniversaryDate.toLocaleDateString()}. Consider salary increment review.`,
            metadata: {
              userId: employee.id,
              userName: `${employee.firstName} ${employee.lastName}`,
              email: employee.email,
              anniversaryDate: anniversaryDate.toISOString(),
              yearsOfService,
              joiningDate: joiningDate.toISOString()
            }
          });
          
          if (notification.success) {
            remindersCreated.push({
              userId: employee.id,
              userName: `${employee.firstName} ${employee.lastName}`,
              anniversaryDate,
              yearsOfService
            });
          }
        }
      }
    }

    return { success: true, remindersCreated };
  } catch (error) {
    console.error('Error checking increment reminders:', error);
    return { success: false, error: 'Failed to check increment reminders' };
  }
}