import type { NotificationChannel, NotificationJobStatus } from "../types/enums";
import type { NotificationJobDTO } from "../dto";

/** Filters for `QueueRepository.search` — items 13/14 (search + filters). */
export interface QueueSearchCriteria {
  status?: NotificationJobStatus | NotificationJobStatus[];
  channel?: NotificationChannel;
  eventId?: string;
  recipientUserId?: string;
  /** Substring match against `recipientAddress` — the "search" half of search+filter. */
  recipientAddressContains?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  take?: number;
  skip?: number;
}

/** Item 15 — pagination support: total is returned alongside the page so a caller can compute page count without a second round trip. */
export interface QueueSearchResult {
  items: NotificationJobDTO[];
  total: number;
  take: number;
  skip: number;
}

/** Items 11/12 — queue metrics/statistics: one row per status, always present even if zero (never a sparse map). */
export type QueueStatistics = Record<NotificationJobStatus, number>;
