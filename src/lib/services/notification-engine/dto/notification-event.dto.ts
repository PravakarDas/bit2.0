import type { NotificationEvent } from "@prisma/client";

/** Read-model — identical to the Prisma row; no separate "entity" class is needed at this layer. */
export type NotificationEventDTO = NotificationEvent;

export type CreateNotificationEventInput = Pick<NotificationEvent, "eventType" | "dedupeKey" | "sourceDomain"> &
  Partial<Pick<NotificationEvent, "payload" | "triggeredByUserId">>;

export interface NotificationEventQueryCriteria {
  eventType?: string;
  sourceDomain?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  take?: number;
  skip?: number;
}
