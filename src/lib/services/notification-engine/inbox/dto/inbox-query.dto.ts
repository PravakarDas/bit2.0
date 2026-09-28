import type { NotificationChannel, NotificationJobStatus } from "../../types/enums";

export interface InboxListFilters {
  /** Omit for "both" — filtering is only meaningful when the caller wants exactly one. */
  readStatus?: "READ" | "UNREAD";
  /** `true` = only archived. `false`/omitted = the default inbox view (archived notifications hidden). */
  archived?: boolean;
  deliveryStatus?: NotificationJobStatus;
  channel?: NotificationChannel;
  createdAfter?: Date;
  createdBefore?: Date;
  /** Matches against `eventType` (title proxy) and the event's `payload` (body proxy) — see notification-center-jobs.repository.ts. */
  search?: string;
}

export interface PageRequest {
  /** 1-indexed. */
  page: number;
  pageSize: number;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
