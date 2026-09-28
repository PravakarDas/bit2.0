import type { NotificationEventDTO, NotificationJobDTO } from "../../../dto";
import type { NotificationChannel, NotificationJobStatus } from "../../../types/enums";
import type { AdminDeliveryAttemptView } from "../../dto";

export interface JobWithEventRow {
  job: NotificationJobDTO;
  event: NotificationEventDTO;
  /**
   * Display name for `job.recipientUserId`, resolved via the same query as
   * `job`/`event` (a single joined read using `NotificationJob`'s existing
   * `recipient` relation — Phase 1, unmodified) — never a per-row lookup.
   * Optional so fakes/tests that don't care about display names aren't
   * forced to populate it.
   */
  recipientName?: string | null;
}

export interface JobsSearchCriteria {
  /** Omitted = admin scope (every recipient). */
  recipientUserId?: string;
  channel?: NotificationChannel;
  status?: NotificationJobStatus;
  createdAfter?: Date;
  createdBefore?: Date;
  /** AND-ed with every other criterion — job.id must be one of these (used to apply read/unread/archived/search filters resolved elsewhere). */
  includeJobIds?: string[];
  /** AND-ed with every other criterion — job.id must NOT be one of these. */
  excludeJobIds?: string[];
  take: number;
  skip: number;
}

/**
 * Read/query access spanning `NotificationJob` + its `NotificationEvent` —
 * distinct from Phase 2's `INotificationJobRepository` (plain single-table
 * CRUD, reused as-is for the two admin mutations this module needs — see
 * notification-inbox.service.ts) because a paginated, joined, filterable
 * list with a total count is a different, list-shaped concern this module
 * is the first caller of. No method here writes to `NotificationJob` —
 * mutations go through the existing `INotificationJobRepository.update()`.
 */
export interface INotificationCenterJobsRepository {
  search(criteria: JobsSearchCriteria): Promise<{ items: JobWithEventRow[]; total: number }>;
  findByIdWithEvent(jobId: string): Promise<JobWithEventRow | null>;
  /** Just the ids (no event join, no pagination) — the cheap query `getCounts` needs, not a page of full rows. */
  findAllJobIds(recipientUserId: string): Promise<string[]>;
  /** One joined query (job's delivery attempts + each attempt's provider name) — avoids the N+1 a naive per-attempt provider lookup would cause. */
  findDeliveryAttemptsWithProvider(jobId: string): Promise<AdminDeliveryAttemptView[]>;
  /** Job ids matching `term` against `eventType` (title proxy) or the event's `payload` (body proxy). */
  findSearchMatchJobIds(term: string, recipientUserId?: string): Promise<string[]>;
}
