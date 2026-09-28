import type { NotificationPreference } from "@prisma/client";

export type NotificationPreferenceDTO = NotificationPreference;

/** `userId`/`notificationType`/`channel` together identify the row (see the model's `@@unique`) — `isEnabled` is the only field a caller ever sets. */
export type UpsertNotificationPreferenceInput = Pick<
  NotificationPreference,
  "userId" | "notificationType" | "channel" | "isEnabled"
>;
