import type { NotificationJobDTO } from "../dto";
import { NotificationJobFactory, type BuildNotificationJobParams } from "../factories";
import { NotificationJobValidator } from "../validators";
import { NOTIFICATION_ENGINE_DEFAULTS } from "../constants";
import type { IQueueRepository, PaginationParams } from "./queue-repository.interface";
import type { QueueSearchCriteria, QueueSearchResult, QueueStatistics } from "./queue-query.dto";
import { RetryScheduler, type RetrySchedulerOptions } from "./retry-scheduler";
import { DuplicateJobError, InvalidQueueTransitionError } from "./errors";
import { NoopLogger, type IQueueLogger } from "./logger.interface";
import type { IQueueEngine } from "./queue-engine.interface";

/**
 * The Notification Queue Engine — the public API this phase delivers.
 *
 * Composes `IQueueRepository` (atomic persistence — see queue.repository.ts),
 * `RetryScheduler` (pure backoff math), and `NotificationJobFactory`/
 * `NotificationJobValidator` (Phase 2, reused unmodified) into the exact
 * method surface requested for this phase. Contains NO SMTP, NO worker
 * loop, NO template rendering, NO PDF/Drive calls — see
 * QueueEngineReport.md's "Architecture Compliance" section for the full
 * scope boundary and how every method maps back to
 * NotificationEngineDesign.md.
 *
 * `workerId` is accepted as an opaque caller-supplied string throughout —
 * this phase does not generate or manage worker identity; that belongs to
 * the future worker-loop phase (this phase "prepares... without redesign"
 * for it, per this phase's own instructions).
 *
 * `implements IQueueEngine` is a Phase 4 addition (additive — see
 * WorkerRuntimeReport.md) — declares conformance to an interface extracted
 * from this class's own already-existing public shape; no method here
 * changed to accommodate it.
 */
export class QueueEngine implements IQueueEngine {
  constructor(
    private readonly queueRepository: IQueueRepository,
    private readonly logger: IQueueLogger = new NoopLogger(),
    private readonly retryOptions: RetrySchedulerOptions = {}
  ) {}

  // ---------------------------------------------------------------------
  // Enqueue + idempotency (items 9, 10)
  // ---------------------------------------------------------------------

  /**
   * Idempotent by construction: if a job with the same `dedupeKey` +
   * `channel` + `recipientUserId` (Design §17's exact idempotency-key
   * format, via `NotificationJobFactory`) already exists, the existing row
   * is returned instead of inserting a duplicate or throwing — matching
   * Design §17/§18 exactly ("a duplicate raiseEvent call... is a no-op").
   */
  async enqueue(params: BuildNotificationJobParams): Promise<NotificationJobDTO> {
    const input = NotificationJobFactory.build(params);
    NotificationJobValidator.validate(input);

    try {
      const created = await this.queueRepository.enqueue(input);
      this.logger.info("queue.enqueued", { jobId: created.id, channel: created.channel, eventId: created.eventId });
      return created;
    } catch (error) {
      if (error instanceof DuplicateJobError) {
        this.logger.debug("queue.enqueue_duplicate_detected", {
          idempotencyKey: input.idempotencyKey,
          existingJobId: error.existingJobId,
        });
        const existing = await this.queueRepository.findByIdempotencyKey(input.idempotencyKey);
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------
  // Claiming (items 3, 4 — atomic locking)
  // ---------------------------------------------------------------------

  async claimNext(workerId: string): Promise<NotificationJobDTO | null> {
    const job = await this.queueRepository.claimNext(workerId);
    if (job) {
      this.logger.info("queue.job_claimed", { jobId: job.id, workerId, attemptCount: job.attemptCount });
    }
    return job;
  }

  async claimBatch(workerId: string, batchSize: number): Promise<NotificationJobDTO[]> {
    const clampedBatchSize = Math.max(1, Math.min(batchSize, NOTIFICATION_ENGINE_DEFAULTS.queue.maxBatchSize));
    const jobs = await this.queueRepository.claimBatch(workerId, clampedBatchSize);
    this.logger.info("queue.batch_claimed", { workerId, requested: batchSize, claimed: jobs.length });
    return jobs;
  }

  // ---------------------------------------------------------------------
  // Lifecycle transitions (Queue State Machine — item 8)
  // ---------------------------------------------------------------------

  /** PROCESSING -> QUEUED. For a worker relinquishing a job cleanly (no penalty, no attempt consumed). */
  async release(jobId: string, workerId: string): Promise<NotificationJobDTO> {
    const job = await this.queueRepository.release(jobId, workerId);
    this.logger.info("queue.job_released", { jobId, workerId });
    return job;
  }

  /**
   * Phase 4 addition (additive — see WorkerRuntimeReport.md). Extends a held
   * lease's `lockedAt` so a long-running job survives `recoverExpiredLocks`
   * while still genuinely in progress. Status stays PROCESSING.
   */
  async renewLease(jobId: string, workerId: string): Promise<NotificationJobDTO> {
    const job = await this.queueRepository.renewLease(jobId, workerId);
    this.logger.debug("queue.lease_renewed", { jobId, workerId, lockedAt: job.lockedAt?.toISOString() });
    return job;
  }

  /** PROCESSING -> SENT. Records that a delivery attempt succeeded. */
  async complete(jobId: string, workerId: string): Promise<NotificationJobDTO> {
    const job = await this.queueRepository.markSent(jobId, workerId);
    this.logger.info("queue.job_sent", { jobId, workerId });
    return job;
  }

  /** SENT -> COMPLETED. The one legitimate edge into the terminal COMPLETED state (Design §5). */
  async archive(jobId: string): Promise<NotificationJobDTO> {
    const job = await this.queueRepository.markCompleted(jobId);
    this.logger.info("queue.job_archived", { jobId });
    return job;
  }

  /**
   * PROCESSING -> DEAD_LETTER. Models Design §16's "recipient-level
   * permanent failure... skip straight to dead letter" — see
   * queue-state-machine.ts's doc comment for why FAILED is not persisted as
   * an independently-observed resting state.
   */
  async markFailed(jobId: string, workerId: string): Promise<NotificationJobDTO> {
    const job = await this.queueRepository.markDeadLetter(jobId, workerId);
    this.logger.warn("queue.job_dead_lettered", { jobId, workerId, reason: "recipient_level_failure" });
    return job;
  }

  /**
   * Retry Scheduling (item 7) — ONLY calculates and persists eligibility,
   * per this phase's explicit instruction ("Do NOT execute retries"). Reads
   * the job's current `attemptCount`/`maxAttempts`, asks `RetryScheduler`
   * whether another attempt is allowed and when, and persists that decision
   * (PROCESSING -> RETRY_SCHEDULED, or PROCESSING -> DEAD_LETTER if
   * exhausted). Never calls a channel adapter, never re-attempts delivery.
   */
  async scheduleRetry(jobId: string, workerId: string): Promise<NotificationJobDTO> {
    const job = await this.queueRepository.findById(jobId);
    if (!job) {
      throw new InvalidQueueTransitionError(jobId, "RETRY_SCHEDULED", "NOT_FOUND");
    }

    const decision = RetryScheduler.calculate(job.attemptCount, {
      ...this.retryOptions,
      maxAttempts: this.retryOptions.maxAttempts ?? job.maxAttempts,
    });
    const nextAttemptCount = job.attemptCount + 1;

    const updated = await this.queueRepository.scheduleRetry(jobId, workerId, {
      nextStatus: decision.shouldRetry ? "RETRY_SCHEDULED" : "DEAD_LETTER",
      nextAttemptAt: decision.nextAttemptAt ?? new Date(),
      attemptCount: nextAttemptCount,
    });

    if (decision.isExhausted) {
      this.logger.warn("queue.retries_exhausted", { jobId, workerId, attemptCount: nextAttemptCount });
    } else {
      this.logger.info("queue.retry_scheduled", {
        jobId,
        workerId,
        attemptCount: nextAttemptCount,
        nextAttemptAt: decision.nextAttemptAt?.toISOString(),
      });
    }
    return updated;
  }

  /** QUEUED or RETRY_SCHEDULED -> DEAD_LETTER. Administrative cancellation — see queue-state-machine.ts's doc comment. */
  async cancel(jobId: string): Promise<NotificationJobDTO> {
    const job = await this.queueRepository.cancel(jobId);
    this.logger.info("queue.job_cancelled", { jobId });
    return job;
  }

  // ---------------------------------------------------------------------
  // Crash recovery primitives (items 5, 6) — NOT the worker itself
  // ---------------------------------------------------------------------

  /**
   * Reclaims any PROCESSING job whose lease has expired. This is a
   * *primitive* a future worker loop will call on a timer — this phase
   * exposes the operation, it does not schedule it (no cron, no interval,
   * no instrumentation.ts change, per this phase's explicit scope).
   */
  async recoverExpiredLocks(leaseDurationMs?: number): Promise<number> {
    const recoveredCount = await this.queueRepository.recoverExpiredLocks(
      leaseDurationMs ?? NOTIFICATION_ENGINE_DEFAULTS.queue.defaultLeaseDurationMs
    );
    if (recoveredCount > 0) {
      this.logger.warn("queue.expired_locks_recovered", { count: recoveredCount });
    }
    return recoveredCount;
  }

  // ---------------------------------------------------------------------
  // Read-only queries (items 13, 14, 15 — search, filters, pagination)
  // ---------------------------------------------------------------------

  async findQueued(pagination?: PaginationParams): Promise<NotificationJobDTO[]> {
    return this.queueRepository.findQueued(pagination);
  }

  async findProcessing(pagination?: PaginationParams): Promise<NotificationJobDTO[]> {
    return this.queueRepository.findProcessing(pagination);
  }

  async findRetryCandidates(pagination?: PaginationParams): Promise<NotificationJobDTO[]> {
    return this.queueRepository.findRetryCandidates(pagination);
  }

  async search(criteria: QueueSearchCriteria): Promise<QueueSearchResult> {
    return this.queueRepository.search(criteria);
  }

  // ---------------------------------------------------------------------
  // Metrics / statistics (items 11, 12)
  // ---------------------------------------------------------------------

  async countQueue(): Promise<number> {
    return this.queueRepository.countByStatuses(["QUEUED", "PROCESSING", "RETRY_SCHEDULED"]);
  }

  async countQueued(): Promise<number> {
    return this.queueRepository.countByStatuses(["QUEUED"]);
  }

  async countProcessing(): Promise<number> {
    return this.queueRepository.countByStatuses(["PROCESSING"]);
  }

  /** Counts both FAILED (momentary, rarely persisted independently — see queue-state-machine.ts) and DEAD_LETTER (the practical terminal failure state). */
  async countFailures(): Promise<number> {
    return this.queueRepository.countByStatuses(["FAILED", "DEAD_LETTER"]);
  }

  async getStatistics(): Promise<QueueStatistics> {
    return this.queueRepository.getStatistics();
  }
}
