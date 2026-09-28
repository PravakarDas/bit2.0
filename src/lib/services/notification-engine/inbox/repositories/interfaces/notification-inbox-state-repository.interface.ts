import type { InboxStateFlag, NotificationJobInboxStateDTO } from "../../dto";

/**
 * Data access for `NotificationJobInboxState` (Phase 12) — the per-recipient
 * read/archived/deleted flag for a `NotificationJob`. A row is created
 * lazily (via `upsert*`) the first time a recipient interacts with a job;
 * `findJobIdsByFlag` is therefore the only way to answer "which of this
 * user's jobs are read/archived/deleted," since a job with no row here is
 * implicitly none of those.
 */
export interface INotificationInboxStateRepository {
  findByJobIds(jobIds: string[], userId: string): Promise<NotificationJobInboxStateDTO[]>;
  findOne(jobId: string, userId: string): Promise<NotificationJobInboxStateDTO | null>;
  /** Job ids (for this user) whose row has the given flag set true (`DELETED` = `deletedAt IS NOT NULL`). */
  findJobIdsByFlag(userId: string, flag: InboxStateFlag): Promise<string[]>;
  upsertRead(jobId: string, userId: string, readAt: Date): Promise<NotificationJobInboxStateDTO>;
  /** Marks every given job id read for this user in one operation — used by "mark all as read." */
  markManyRead(jobIds: string[], userId: string, readAt: Date): Promise<number>;
  upsertArchived(jobId: string, userId: string, archivedAt: Date): Promise<NotificationJobInboxStateDTO>;
  upsertUnarchived(jobId: string, userId: string): Promise<NotificationJobInboxStateDTO>;
  /** Soft delete — only ever called for an already-archived notification (enforced by the service, not this repository). */
  softDelete(jobId: string, userId: string, deletedAt: Date): Promise<NotificationJobInboxStateDTO>;
}
