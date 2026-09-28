import type { NotificationJob } from "@prisma/client";
import type { NotificationChannel, NotificationJobStatus } from "../types/enums";

export type NotificationJobDTO = NotificationJob;

export type CreateNotificationJobInput = Pick<
  NotificationJob,
  "eventId" | "channel" | "recipientAddress" | "idempotencyKey"
> &
  Partial<Pick<NotificationJob, "recipientUserId" | "maxAttempts" | "nextAttemptAt" | "documentId" | "status">>;

/**
 * Generic field update — intentionally does NOT expose a "claim"/"lease" method
 * shape (that belongs to the queue worker, a later phase). This is a plain
 * column update, nothing more.
 */
export type UpdateNotificationJobInput = Partial<
  Pick<
    NotificationJob,
    "status" | "attemptCount" | "maxAttempts" | "nextAttemptAt" | "lockedAt" | "lockedBy" | "documentId"
  >
>;

export interface NotificationJobQueryCriteria {
  status?: NotificationJobStatus;
  channel?: NotificationChannel;
  eventId?: string;
  recipientUserId?: string;
  take?: number;
  skip?: number;
}
