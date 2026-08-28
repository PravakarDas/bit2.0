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
 * `LOAN_APPROVED`/`EMAIL` was the first entry (Phase 10); Phase 15 adds the
 * leave and overtime approve/reject events, the next real business events
 * this project has wired end to end. Channels not yet built (SMS, WhatsApp,
 * ...) are deliberately absent — the preference *model* already supports
 * them (any `NotificationChannel` value is a valid row), only this UI-facing
 * catalog is scoped to what can actually be delivered today.
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
  Object.freeze({
    notificationType: "LEAVE_APPROVED",
    label: "Leave approved",
    description: "Email when a leave application you submitted is approved.",
    channels: Object.freeze(["EMAIL"]) as NotificationChannel[],
  }),
  Object.freeze({
    notificationType: "LEAVE_REJECTED",
    label: "Leave rejected",
    description: "Email when a leave application you submitted is rejected.",
    channels: Object.freeze(["EMAIL"]) as NotificationChannel[],
  }),
  Object.freeze({
    notificationType: "OVERTIME_REQUEST_APPROVED",
    label: "Overtime request approved",
    description: "Email when an overtime request you submitted is approved.",
    channels: Object.freeze(["EMAIL"]) as NotificationChannel[],
  }),
  Object.freeze({
    notificationType: "OVERTIME_REQUEST_DECLINED",
    label: "Overtime request declined",
    description: "Email when an overtime request you submitted is declined.",
    channels: Object.freeze(["EMAIL"]) as NotificationChannel[],
  }),
]);
