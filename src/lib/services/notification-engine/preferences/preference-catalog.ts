import type { NotificationChannel } from "../types/enums";

/**
 * The registry of `(notificationType, channel)` pairs an employee is allowed
 * to self-manage — presentation-facing, not part of the engine's core
 * architecture. Adding a future business event to this list is the only step
 * required to expose it in the Notification Center's preference UI; it does
 * NOT need a new engine component or schema change (Design's own
 * generic-`NotificationPreference` model already covers any `(userId,
 * notificationType, channel)` triple).
 *
 * `LOAN_APPROVED`/`EMAIL` is the only entry today because it is the only real
 * business event + channel this project has wired end to end (Phase 10).
 * Channels not yet built (SMS, WhatsApp, ...) are deliberately absent — the
 * preference *model* already supports them (any `NotificationChannel` value
 * is a valid row), only this UI-facing catalog is scoped to what can actually
 * be delivered today.
 */
export interface ManageableNotificationType {
  notificationType: string;
  label: string;
  description: string;
  channels: NotificationChannel[];
}

export const MANAGEABLE_NOTIFICATION_TYPES: readonly ManageableNotificationType[] = Object.freeze([
  Object.freeze({
    notificationType: "LOAN_APPROVED",
    label: "Loan approved",
    description: "Email when a loan request you submitted is approved.",
    channels: Object.freeze(["EMAIL"]) as NotificationChannel[],
  }),
]);
