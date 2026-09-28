import type { NotificationChannel, NotificationJobStatus, AttemptOutcome } from "../../types/enums";

/**
 * One row in a notification list — deliberately lightweight: no rendered
 * template content (Design requirement "avoid loading rendered content
 * unless viewing details" — see `NotificationCenterReport.md`'s
 * "Performance" section). `title` is a static label derived from
 * `eventType`, never a template render.
 */
export interface InboxListItem {
  jobId: string;
  eventId: string;
  eventType: string;
  title: string;
  channel: NotificationChannel;
  deliveryStatus: NotificationJobStatus;
  recipientAddress: string;
  isRead: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Same shape, plus the fields an employee's own view never needs — who it was sent to (always "me"). */
export interface AdminInboxListItem extends InboxListItem {
  recipientUserId: string | null;
  recipientName: string | null;
}

/** Detail view — the one place rendered content and the raw payload are ever loaded. */
export interface InboxDetail extends InboxListItem {
  payload: unknown;
  renderedSubject: string | null;
  renderedBodyHtml: string | null;
  renderedBodyText: string | null;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date;
}

export interface AdminDeliveryAttemptView {
  attemptNumber: number;
  outcome: AttemptOutcome;
  errorCode: string | null;
  errorMessage: string | null;
  attemptedAt: Date;
  providerName: string | null;
}

/** Admin detail view — everything an employee sees, plus queue/worker/delivery-attempt internals. */
export interface AdminInboxDetail extends InboxDetail {
  recipientUserId: string | null;
  recipientName: string | null;
  lockedBy: string | null;
  lockedAt: Date | null;
  deliveryAttempts: AdminDeliveryAttemptView[];
}

export interface InboxCounts {
  unread: number;
  read: number;
  archived: number;
  /** Active (not soft-deleted) notifications — unread + read, i.e. the default inbox view before any archived/deleted filtering. */
  total: number;
}
