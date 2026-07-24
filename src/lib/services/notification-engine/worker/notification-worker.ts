import type { NotificationJobDTO } from "../dto";
import type { IQueueEngine } from "../queue";
import { NoopLogger, type IQueueLogger } from "../queue/logger.interface";
import type { JobDispatcher } from "./job-dispatcher";
import { ExecutionContext } from "./execution-context";
import type { WorkerConfig } from "./worker-config";
import type { WorkerMetricsCollector } from "./worker-metrics";
import type { INotificationWorker } from "./notification-worker.interface";

export type ClaimResult = { kind: "CLAIMED"; job: NotificationJobDTO } | { kind: "NO_JOB" } | { kind: "CLAIM_ERROR"; error: unknown };

export type ProcessResult =
  | { kind: "SUCCESS"; jobId: string; runtimeMs: number }
  | { kind: "RETRY_SCHEDULED"; jobId: string; runtimeMs: number; nextAttemptAt: Date }
  | { kind: "DEAD_LETTERED"; jobId: string; runtimeMs: number }
  | { kind: "CANCELLED"; jobId: string; runtimeMs: number };

/**
 * "Execute one unit of work" — the Execution Pipeline (Claim Job -> Create
 * Execution Context -> Resolve Provider Adapter -> Execute Adapter ->
 * Update Queue -> Record Metrics) for a single job.
 *
 * Split into `claim()` + `execute(job)` (rather than one opaque call)
 * specifically so `WorkerRuntime` can start a lease-renewal timer for the
 * claimed job's id *before* awaiting `execute()`'s full dispatch — a single
 * combined method would give the runtime no opportunity to do that while
 * dispatch is still in flight. `processNext()` composes both for callers
 * that don't need the split (most tests).
 *
 * Deliberately stateless across calls (all mutable state — metrics,
 * lifecycle — lives in `WorkerMetricsCollector`/`WorkerRuntime`, injected
 * in); `WorkerRuntime` owns *when* to call these (the loop/timer/lifecycle),
 * this class owns *what happens* during one job.
 *
 * Depends on `IQueueEngine` (interface), not the concrete `QueueEngine`
 * class — Dependency Inversion, and what makes "mock QueueEngine" in a
 * unit test possible (see notification-worker.interface.ts's doc comment).
 * `implements INotificationWorker` is the same pattern applied one level up.
 */
export class NotificationWorker implements INotificationWorker {
  constructor(
    private readonly queueEngine: IQueueEngine,
    private readonly jobDispatcher: JobDispatcher,
    private readonly metrics: WorkerMetricsCollector,
    private readonly config: WorkerConfig,
    private readonly logger: IQueueLogger = new NoopLogger()
  ) {}

  async claim(): Promise<ClaimResult> {
    try {
      const job = await this.queueEngine.claimNext(this.config.workerId);
      if (!job) {
        return { kind: "NO_JOB" };
      }
      this.logger.info("worker.job_claimed", { jobId: job.id, workerId: this.config.workerId, channel: job.channel, attemptNumber: job.attemptCount + 1 });
      return { kind: "CLAIMED", job };
    } catch (error) {
      this.logger.error("worker.claim_failed", { workerId: this.config.workerId, error: error instanceof Error ? error.message : String(error) });
      return { kind: "CLAIM_ERROR", error };
    }
  }

  /**
   * `context` is constructed by the caller (`WorkerRuntime`), not here —
   * specifically so the caller can hold a reference to it (for
   * `ExecutionContext.cancel()` during shutdown, and for lease-renewal
   * timers keyed on `context.jobId`) from the moment the job is claimed,
   * not only after `execute()` resolves. See worker-runtime.ts's `tick()`.
   */
  async execute(job: NotificationJobDTO, context: ExecutionContext): Promise<ProcessResult> {
    this.metrics.startJob();

    const outcome = await this.jobDispatcher.dispatch(job, context);
    const runtimeMs = context.elapsedMs();

    if (outcome.kind === "SUCCESS") {
      await this.queueEngine.complete(job.id, this.config.workerId);
      this.metrics.recordSuccess(runtimeMs);
      this.logger.info("worker.job_succeeded", { jobId: job.id, workerId: this.config.workerId, runtimeMs });
      return { kind: "SUCCESS", jobId: job.id, runtimeMs };
    }

    if (outcome.kind === "CANCELLED") {
      await this.queueEngine.release(job.id, this.config.workerId);
      this.metrics.cancelJob();
      this.logger.warn("worker.job_cancelled", { jobId: job.id, workerId: this.config.workerId, runtimeMs });
      return { kind: "CANCELLED", jobId: job.id, runtimeMs };
    }

    // PROVIDER_NOT_IMPLEMENTED and FAILURE both route to retry — see
    // job-dispatcher.ts's doc comment for why "no real provider yet" is
    // treated as transient, not a permanent per-recipient failure.
    const updated = await this.queueEngine.scheduleRetry(job.id, this.config.workerId);
    this.metrics.recordRetried(runtimeMs);

    if (updated.status === "DEAD_LETTER") {
      this.logger.warn("worker.job_dead_lettered", { jobId: job.id, workerId: this.config.workerId, runtimeMs, attemptCount: updated.attemptCount });
      return { kind: "DEAD_LETTERED", jobId: job.id, runtimeMs };
    }

    this.logger.info("worker.job_retry_scheduled", {
      jobId: job.id,
      workerId: this.config.workerId,
      runtimeMs,
      attemptCount: updated.attemptCount,
      nextAttemptAt: updated.nextAttemptAt.toISOString(),
    });
    return { kind: "RETRY_SCHEDULED", jobId: job.id, runtimeMs, nextAttemptAt: updated.nextAttemptAt };
  }

  /** Convenience composition of `claim()` + `execute()` for callers that don't need lease renewal mid-flight (most tests). Constructs its own `ExecutionContext` since no caller needs to hold a reference to it. */
  async processNext(): Promise<ProcessResult | { kind: "NO_JOB" } | { kind: "CLAIM_ERROR"; error: unknown }> {
    const claimed = await this.claim();
    if (claimed.kind !== "CLAIMED") {
      return claimed;
    }
    const context = new ExecutionContext(claimed.job, this.config.workerId);
    return this.execute(claimed.job, context);
  }

  /** Lease Renewal (item 9) — called periodically by `WorkerRuntime` while a job is in flight. */
  async renewLease(jobId: string): Promise<void> {
    await this.queueEngine.renewLease(jobId, this.config.workerId);
    this.logger.debug("worker.lease_renewed", { jobId, workerId: this.config.workerId });
  }

  /** Graceful release without penalty — used by `WorkerRuntime` during shutdown if a job is still in flight past the grace period. */
  async releaseJob(jobId: string): Promise<void> {
    await this.queueEngine.release(jobId, this.config.workerId);
    this.logger.warn("worker.job_released_on_shutdown", { jobId, workerId: this.config.workerId });
  }
}
