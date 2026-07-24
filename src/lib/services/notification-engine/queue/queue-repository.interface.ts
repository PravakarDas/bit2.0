import type { CreateNotificationJobInput, NotificationJobDTO } from "../dto";
import type { NotificationJobStatus } from "../types/enums";
import type { QueueSearchCriteria, QueueSearchResult, QueueStatistics } from "./queue-query.dto";

export interface PaginationParams {
  take?: number;
  skip?: number;
}

/**
 * Atomic, queue-lifecycle-specific data access for `NotificationJob` —
 * distinct from Phase 2's generic `INotificationJobRepository` (plain CRUD,
 * still used by non-queue callers). Every mutating method here is a single
 * atomic database operation implementing a compare-and-swap guard (Design
 * §19/§25's "conditional status-guarded update" — this IS the optimistic
 * concurrency protection, item 18; there is no separate `version` column).
 *
 * No method here decides retry timing, validates a business rule, or
 * enqueues follow-up work — see QueueEngine for the layer that composes
 * these primitives into the public queue API.
 */
export interface IQueueRepository {
  /** Throws `DuplicateJobError` if `idempotencyKey` already exists — never silently overwrites. */
  enqueue(input: CreateNotificationJobInput): Promise<NotificationJobDTO>;

  findById(jobId: string): Promise<NotificationJobDTO | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<NotificationJobDTO | null>;

  /**
   * Atomically claims and locks a single eligible job (QUEUED, or
   * RETRY_SCHEDULED whose `nextAttemptAt` has passed) via PostgreSQL's
   * `SELECT ... FOR UPDATE SKIP LOCKED`. Returns `null` if nothing is
   * eligible — never blocks waiting for a locked row.
   */
  claimNext(workerId: string, now?: Date): Promise<NotificationJobDTO | null>;

  /** Same eligibility/locking as `claimNext`, up to `batchSize` rows in one round trip. */
  claimBatch(workerId: string, batchSize: number, now?: Date): Promise<NotificationJobDTO[]>;

  /** PROCESSING -> QUEUED, only if `workerId` currently holds the lock. Throws `InvalidQueueTransitionError` otherwise. */
  release(jobId: string, workerId: string): Promise<NotificationJobDTO>;

  /** PROCESSING -> SENT, only if `workerId` currently holds the lock. */
  markSent(jobId: string, workerId: string): Promise<NotificationJobDTO>;

  /** SENT -> COMPLETED. No lock ownership check — by this point the job is no longer claimed by anyone. */
  markCompleted(jobId: string): Promise<NotificationJobDTO>;

  /** PROCESSING -> DEAD_LETTER (the FAILED->DEAD_LETTER cascade — see QueueStateMachine's doc comment), only if `workerId` currently holds the lock. */
  markDeadLetter(jobId: string, workerId: string): Promise<NotificationJobDTO>;

  /**
   * PROCESSING -> RETRY_SCHEDULED or PROCESSING -> DEAD_LETTER, only if
   * `workerId` currently holds the lock. `nextStatus`/`nextAttemptAt`/
   * `attemptCount` are computed by the caller (`QueueEngine`, via
   * `RetryScheduler`) — this method only persists the already-made decision.
   */
  scheduleRetry(
    jobId: string,
    workerId: string,
    input: { nextStatus: "RETRY_SCHEDULED" | "DEAD_LETTER"; nextAttemptAt: Date; attemptCount: number }
  ): Promise<NotificationJobDTO>;

  /** QUEUED or RETRY_SCHEDULED -> DEAD_LETTER. No lock ownership check — a queued/retry-pending job isn't held by any worker. */
  cancel(jobId: string): Promise<NotificationJobDTO>;

  /** Bulk PROCESSING -> QUEUED for any row whose lease is older than `leaseDurationMs`. Returns the number of rows recovered. */
  recoverExpiredLocks(leaseDurationMs: number, now?: Date): Promise<number>;

  findQueued(pagination?: PaginationParams): Promise<NotificationJobDTO[]>;
  findProcessing(pagination?: PaginationParams): Promise<NotificationJobDTO[]>;
  /** RETRY_SCHEDULED rows whose `nextAttemptAt` has already passed — read-only; does NOT promote/claim them (see queue-state-machine.ts's doc comment). */
  findRetryCandidates(pagination?: PaginationParams, now?: Date): Promise<NotificationJobDTO[]>;

  search(criteria: QueueSearchCriteria): Promise<QueueSearchResult>;
  countByStatuses(statuses: NotificationJobStatus[]): Promise<number>;
  getStatistics(): Promise<QueueStatistics>;
}
