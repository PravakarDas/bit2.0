"use server";

import { getDbUser } from "./user.actions";
import { notificationEngineContainer } from "@/lib/services/notification-engine";
import type { InboxListFilters, ManualActionResult, PageRequest } from "@/lib/services/notification-engine";

/** Normalizes `ManualActionResult`'s `reason` field to the `error` field every other action in this codebase returns on failure (see CLAUDE.md's Error Handling Conventions). */
function toActionResult(result: ManualActionResult): { success: true } | { success: false; error: string } {
  return result.success ? { success: true } : { success: false, error: result.reason };
}

/**
 * Employee-facing Notification Center actions (Phase 12). Every action
 * resolves the caller via `getDbUser()` and scopes every read/write to that
 * user's own `recipientUserId` — an employee can never see or touch another
 * employee's notifications. All business logic lives in
 * `NotificationInboxService`; these are thin, auth-checking wrappers, same
 * shape as every other file in this folder (see CLAUDE.md's Backend
 * Patterns).
 */

export async function getMyNotifications(filters: InboxListFilters, page: PageRequest) {
  try {
    const user = await getDbUser();
    if (!user) {
      return { success: false as const, error: "Unauthorized" };
    }
    const result = await notificationEngineContainer.inboxService.listForUser(user.id, filters, page);
    return { success: true as const, ...result };
  } catch (error) {
    console.error("getMyNotifications failed:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to load notifications" };
  }
}

export async function getMyNotificationDetail(jobId: string) {
  try {
    const user = await getDbUser();
    if (!user) {
      return { success: false as const, error: "Unauthorized" };
    }
    const detail = await notificationEngineContainer.inboxService.getDetailForUser(jobId, user.id);
    if (!detail) {
      return { success: false as const, error: "Notification not found" };
    }
    return { success: true as const, notification: detail };
  } catch (error) {
    console.error("getMyNotificationDetail failed:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to load notification" };
  }
}

export async function getMyNotificationCounts() {
  try {
    const user = await getDbUser();
    if (!user) {
      return { success: false as const, error: "Unauthorized" };
    }
    const counts = await notificationEngineContainer.inboxService.getCounts(user.id);
    return { success: true as const, counts };
  } catch (error) {
    console.error("getMyNotificationCounts failed:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to load notification counts" };
  }
}

export async function markNotificationRead(jobId: string) {
  try {
    const user = await getDbUser();
    if (!user) {
      return { success: false as const, error: "Unauthorized" };
    }
    return toActionResult(await notificationEngineContainer.inboxService.markRead(jobId, user.id));
  } catch (error) {
    console.error("markNotificationRead failed:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to mark notification as read" };
  }
}

export async function markAllNotificationsRead() {
  try {
    const user = await getDbUser();
    if (!user) {
      return { success: false as const, error: "Unauthorized" };
    }
    return toActionResult(await notificationEngineContainer.inboxService.markAllRead(user.id));
  } catch (error) {
    console.error("markAllNotificationsRead failed:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to mark all notifications as read" };
  }
}

export async function archiveNotification(jobId: string) {
  try {
    const user = await getDbUser();
    if (!user) {
      return { success: false as const, error: "Unauthorized" };
    }
    return toActionResult(await notificationEngineContainer.inboxService.archive(jobId, user.id));
  } catch (error) {
    console.error("archiveNotification failed:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to archive notification" };
  }
}

export async function unarchiveNotification(jobId: string) {
  try {
    const user = await getDbUser();
    if (!user) {
      return { success: false as const, error: "Unauthorized" };
    }
    return toActionResult(await notificationEngineContainer.inboxService.unarchive(jobId, user.id));
  } catch (error) {
    console.error("unarchiveNotification failed:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to unarchive notification" };
  }
}

export async function deleteArchivedNotification(jobId: string) {
  try {
    const user = await getDbUser();
    if (!user) {
      return { success: false as const, error: "Unauthorized" };
    }
    return toActionResult(await notificationEngineContainer.inboxService.deleteArchived(jobId, user.id));
  } catch (error) {
    console.error("deleteArchivedNotification failed:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to delete notification" };
  }
}
