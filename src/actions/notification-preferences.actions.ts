"use server";

import { getDbUser } from "./user.actions";
import { notificationEngineContainer } from "@/lib/services/notification-engine";
import type { NotificationChannel, NotificationPreferenceViewModel } from "@/lib/services/notification-engine";
import { ValidationError } from "@/lib/services/notification-engine";

/**
 * Employee-facing Notification Preferences actions (Phase 13). Every action
 * resolves the caller via `getDbUser()` and scopes reads/writes to that
 * user's own `userId` — an employee can only ever read or change their own
 * preferences. No admin/manager access exists in this phase (a deliberate
 * scope decision — see NotificationPreferencesReport.md). All business logic
 * lives in `NotificationPreferenceService`; these are thin, auth-checking
 * wrappers, same shape as `notification-inbox.actions.ts`.
 */

export async function getMyNotificationPreferences(): Promise<
  { success: true; preferences: NotificationPreferenceViewModel[] } | { success: false; error: string }
> {
  try {
    const user = await getDbUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }
    const preferences = await notificationEngineContainer.preferenceService.listForUser(user.id);
    return { success: true, preferences };
  } catch (error) {
    console.error("getMyNotificationPreferences failed:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to load notification preferences" };
  }
}

export async function setMyNotificationPreference(
  notificationType: string,
  channel: NotificationChannel,
  isEnabled: boolean
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const user = await getDbUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }
    await notificationEngineContainer.preferenceService.setForUser(user.id, notificationType, channel, isEnabled);
    return { success: true };
  } catch (error) {
    console.error("setMyNotificationPreference failed:", error);
    if (error instanceof ValidationError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: error instanceof Error ? error.message : "Failed to update notification preference" };
  }
}
