"use server";

import { getDbUser } from "./user.actions";
import { notificationEngineContainer } from "@/lib/services/notification-engine";
import type { InboxListFilters, ManualActionResult, PageRequest } from "@/lib/services/notification-engine";

/** Normalizes `ManualActionResult`'s `reason` field to the `error` field every other action in this codebase returns on failure (see CLAUDE.md's Error Handling Conventions). */
function toActionResult(result: ManualActionResult): { success: true } | { success: false; error: string } {
  return result.success ? { success: true } : { success: false, error: result.reason };
}

/**
 * Administrator-facing Notification Center actions (Phase 12). Viewing
 * (list/detail/queue status) follows this codebase's existing
 * SUPERADMIN-or-HR "administrator" convention (see `loan.actions.ts`'s
 * `approveLoan`); the two manual queue actions (`retryNotificationNow`,
 * `requeueDeadLetterNotification`) are SUPERADMIN-only, per this phase's own
 * explicit Security requirement. All business logic lives in
 * `NotificationInboxService` — these are thin, auth-checking wrappers.
 */

function isAdministrator(user: { role: string } | null): boolean {
  return !!user && (user.role === "SUPERADMIN" || user.role === "HR");
}

export async function getAllNotifications(filters: InboxListFilters & { recipientUserId?: string }, page: PageRequest) {
  try {
    const user = await getDbUser();
    if (!isAdministrator(user)) {
      return { success: false as const, error: "Unauthorized" };
    }
    const result = await notificationEngineContainer.inboxService.listForAdmin(filters, page);
    return { success: true as const, ...result };
  } catch (error) {
    console.error("getAllNotifications failed:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to load notifications" };
  }
}

export async function getNotificationDetailForAdmin(jobId: string) {
  try {
    const user = await getDbUser();
    if (!isAdministrator(user)) {
      return { success: false as const, error: "Unauthorized" };
    }
    const detail = await notificationEngineContainer.inboxService.getDetailForAdmin(jobId);
    if (!detail) {
      return { success: false as const, error: "Notification not found" };
    }
    return { success: true as const, notification: detail };
  } catch (error) {
    console.error("getNotificationDetailForAdmin failed:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to load notification" };
  }
}

export async function getNotificationQueueStatus() {
  try {
    const user = await getDbUser();
    if (!isAdministrator(user)) {
      return { success: false as const, error: "Unauthorized" };
    }
    const statistics = await notificationEngineContainer.inboxService.getQueueStatus();
    return { success: true as const, statistics };
  } catch (error) {
    console.error("getNotificationQueueStatus failed:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to load queue status" };
  }
}

export async function retryNotificationNow(jobId: string) {
  try {
    const user = await getDbUser();
    if (!user || user.role !== "SUPERADMIN") {
      return { success: false as const, error: "Unauthorized" };
    }
    return toActionResult(await notificationEngineContainer.inboxService.retryNow(jobId));
  } catch (error) {
    console.error("retryNotificationNow failed:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to retry notification" };
  }
}

export async function requeueDeadLetterNotification(jobId: string) {
  try {
    const user = await getDbUser();
    if (!user || user.role !== "SUPERADMIN") {
      return { success: false as const, error: "Unauthorized" };
    }
    return toActionResult(await notificationEngineContainer.inboxService.requeueDeadLetter(jobId));
  } catch (error) {
    console.error("requeueDeadLetterNotification failed:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to requeue notification" };
  }
}
