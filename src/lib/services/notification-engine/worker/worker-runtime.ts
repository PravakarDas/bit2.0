import { QueueError } from "../errors";
import { NoopLogger, type IQueueLogger } from "../queue/logger.interface";
import { ExecutionContext } from "./execution-context";
import type { INotificationWorker } from "./notification-worker.interface";
import { WorkerHeartbeat, type WorkerHeartbeatSnapshot } from "./worker-heartbeat";
import { WorkerHealthMonitor } from "./worker-health-monitor";
import type { WorkerHealthStatus } from "./worker-health-status";
import { WorkerLifecycle } from "./worker-lifecycle";
import type { WorkerLifecycleState } from "./worker-lifecycle-state";
import type { WorkerMetricsCollector, WorkerMetricsSnapshot } from "./worker-metrics";
import type { WorkerConfig } from "./worker-config";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The lifecycle/loop harness — owns *when* `NotificationWorker`'s
 * claim/execute steps run (the interval loop, matching this project's
 * existing `instrumentation.ts` in-process-loop convention per
 * [DECISIONS.md](DECISIONS.md), though NOT wired into `instrumentation.ts`
 * itself this phase — see WorkerRuntimeReport.md "Intentionally
 * Postponed"), the 9-state lifecycle, heartbeat, health, metrics exposure,
 * and graceful shutdown. `NotificationWorker` owns *what happens* during
 * one job.
 *
 * Every mutating public method (`start`/`stop`/`pause`/`resume`/`restart`)
 * is safe to call from outside the tick loop at any time — internal races
 * between an in-flight tick and a concurrent `stop()` are resolved
 * defensively (a transition attempt that's no longer valid because the
 * other path already moved the state on is logged, not thrown — see
 * `safeTransition`) rather than assumed away. This is a disclosed,
 * best-effort simplification, not perfect distributed-systems-grade
 * coordination — reasonable for a single in-process loop with no
 * concurrent callers of its own mutating methods, which is this phase's
 * actual scope.
 */
export class WorkerRuntime {
  private readonly lifecycle = new WorkerLifecycle();
  private readonly heartbeatTracker: WorkerHeartbeat;

  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private leaseRenewalTimer: ReturnType<typeof setInterval> | null = null;
  private currentTickPromise: Promise<void> | null = null;
  private currentContext: ExecutionContext | null = null;

  private stopRequested = false;
  private pauseRequested = false;
  private consecutiveErrors = 0;

  constructor(
    private readonly worker: INotificationWorker,
    private readonly metricsCollector: WorkerMetricsCollector,
    private readonly config: WorkerConfig,
    private readonly logger: IQueueLogger = new NoopLogger()
  ) {
    this.heartbeatTracker = new WorkerHeartbeat(config.heartbeatStaleAfterMs);
  }

  // =========================================================================
  // Public API
  // =========================================================================

  async start(): Promise<void> {
    if (this.lifecycle.state !== "STOPPED") {
      throw new QueueError(`WorkerRuntime.start(): cannot start from state ${this.lifecycle.state} — already running.`);
    }
    this.stopRequested = false;
    this.pauseRequested = false;
    this.consecutiveErrors = 0;

    this.lifecycle.transition("STARTING");
    this.logger.info("worker.starting", { workerId: this.config.workerId });

    this.lifecycle.transition("IDLE");
    this.heartbeatTracker.beat();
    this.logger.info("worker.started", { workerId: this.config.workerId });

    this.scheduleTick(0);
  }

  /** Graceful Shutdown (item 8): finish the current job if possible, update queue state correctly, release the lease, exit cleanly. */
  async stop(): Promise<void> {
    if (this.lifecycle.state === "STOPPED") {
      return;
    }
    this.stopRequested = true;
    this.logger.info("worker.stop_requested", { workerId: this.config.workerId, currentState: this.lifecycle.state });

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    // Prefer letting an in-flight tick reach its own natural safe point (COMPLETE -> IDLE, or RECOVERING -> IDLE).
    if (this.currentTickPromise) {
      await Promise.race([this.currentTickPromise, delay(this.config.shutdownGracePeriodMs)]);
    }

    if (this.lifecycle.state === "CLAIM_JOB" || this.lifecycle.state === "PROCESSING") {
      // Grace period exceeded: cancel + force-release so the job isn't left orphaned until recoverExpiredLocks eventually catches it.
      this.logger.warn("worker.shutdown_grace_period_exceeded", { workerId: this.config.workerId, jobId: this.currentContext?.jobId });
      this.currentContext?.cancel("shutdown grace period elapsed");
      const jobId = this.currentContext?.jobId;
      if (jobId) {
        try {
          await this.worker.releaseJob(jobId);
        } catch (error) {
          this.logger.error("worker.forced_release_failed", {
            jobId,
            workerId: this.config.workerId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      this.stopLeaseRenewalTimer();
      this.safeTransition("STOPPING");
    } else {
      this.safeTransition("STOPPING");
    }

    this.logger.info("worker.stopping", { workerId: this.config.workerId });
    this.safeTransition("STOPPED");
    const finalMetrics = this.metricsCollector.getSnapshot();
    this.logger.info("worker.stopped", {
      workerId: this.config.workerId,
      jobsProcessed: finalMetrics.jobsProcessed,
      jobsFailed: finalMetrics.jobsFailed,
      jobsRetried: finalMetrics.jobsRetried,
      uptimeMs: finalMetrics.uptimeMs,
    });
  }

  /**
   * Requests a pause. If currently IDLE, takes effect immediately. If a job
   * is being claimed/processed, takes effect at the next safe boundary
   * (after the current job reaches COMPLETE/IDLE) — never abandons a job
   * mid-flight just to honor a pause, unlike `stop()`'s forced path.
   */
  pause(): void {
    if (this.lifecycle.state === "PAUSED" || this.stopRequested) {
      return;
    }
    this.pauseRequested = true;
    this.logger.info("worker.pause_requested", { workerId: this.config.workerId, currentState: this.lifecycle.state });
    if (this.lifecycle.state === "IDLE") {
      this.safeTransition("PAUSED");
    }
  }

  resume(): void {
    if (this.lifecycle.state !== "PAUSED") {
      return;
    }
    this.pauseRequested = false;
    this.safeTransition("IDLE");
    this.logger.info("worker.resumed", { workerId: this.config.workerId });
    this.scheduleTick(0);
  }

  async restart(): Promise<void> {
    this.logger.info("worker.restart_requested", { workerId: this.config.workerId });
    await this.stop();
    await this.start();
  }

  status(): WorkerLifecycleState {
    return this.lifecycle.state;
  }

  health(): WorkerHealthStatus {
    return WorkerHealthMonitor.resolve(this.lifecycle.state, this.heartbeatTracker.getSnapshot());
  }

  metrics(): WorkerMetricsSnapshot {
    return this.metricsCollector.getSnapshot();
  }

  heartbeat(): WorkerHeartbeatSnapshot {
    return this.heartbeatTracker.getSnapshot();
  }

  // =========================================================================
  // Internal loop
  // =========================================================================

  private scheduleTick(delayMs: number): void {
    if (this.stopRequested) {
      return;
    }
    this.pollTimer = setTimeout(() => {
      this.currentTickPromise = this.tick().finally(() => {
        this.currentTickPromise = null;
      });
    }, delayMs);
  }

  private async tick(): Promise<void> {
    if (this.stopRequested) {
      return;
    }

    if (this.pauseRequested) {
      this.safeTransition("PAUSED");
      this.heartbeatTracker.beat();
      this.scheduleTick(this.config.pollIntervalMs);
      return;
    }

    this.safeTransition("CLAIM_JOB");

    // `INotificationWorker.claim()`'s contract is to never throw (always
    // return a `ClaimResult`, including `CLAIM_ERROR`) — the real
    // `NotificationWorker.claim()` upholds this. This try/catch is defense
    // in depth against a violation of that contract (a bug in a future
    // implementation, or in a test double): a background loop must never
    // let an unexpected throw escape a timer callback unhandled.
    let claimed: Awaited<ReturnType<typeof this.worker.claim>>;
    try {
      claimed = await this.worker.claim();
    } catch (error) {
      this.logger.error("worker.claim_threw_unexpectedly", {
        workerId: this.config.workerId,
        error: error instanceof Error ? error.message : String(error),
      });
      if (!this.stopRequested) {
        this.handleRecoverableError("claim_threw_unexpectedly");
      }
      return;
    }

    if (this.stopRequested) {
      return;
    }

    if (claimed.kind === "CLAIM_ERROR") {
      this.handleRecoverableError("claim_failed");
      return;
    }

    if (claimed.kind === "NO_JOB") {
      this.safeTransition("IDLE");
      this.consecutiveErrors = 0;
      this.heartbeatTracker.beat();
      this.scheduleTick(this.config.pollIntervalMs);
      return;
    }

    // claimed.kind === "CLAIMED"
    const context = new ExecutionContext(claimed.job, this.config.workerId);
    this.currentContext = context;
    this.safeTransition("PROCESSING");
    this.startLeaseRenewalTimer(claimed.job.id);

    try {
      const result = await this.worker.execute(claimed.job, context);
      this.stopLeaseRenewalTimer();
      this.currentContext = null;

      if (this.stopRequested) {
        return; // stop() already forced STOPPING/STOPPED while we were mid-flight; don't fight it.
      }

      this.consecutiveErrors = 0;
      this.safeTransition("COMPLETE");
      this.logger.debug("worker.cycle_complete", { workerId: this.config.workerId, jobId: claimed.job.id, result: result.kind });
      this.safeTransition("IDLE");
    } catch (error) {
      this.stopLeaseRenewalTimer();
      this.currentContext = null;
      if (this.stopRequested) {
        return;
      }
      this.logger.error("worker.execute_threw", {
        workerId: this.config.workerId,
        jobId: claimed.job.id,
        error: error instanceof Error ? error.message : String(error),
      });
      this.handleRecoverableError("execute_failed");
      return;
    }

    this.heartbeatTracker.beat();
    if (this.stopRequested) {
      return;
    }
    this.scheduleTick(this.config.pollIntervalMs);
  }

  /**
   * Enters RECOVERING and either returns to IDLE (retrying the loop) or, if
   * `maxConsecutiveErrors` has been exceeded, stops the runtime entirely
   * rather than spinning on a persistently broken dependency (e.g. the
   * database being unreachable) forever.
   */
  private handleRecoverableError(reasonEvent: string): void {
    this.consecutiveErrors += 1;
    this.safeTransition("RECOVERING");
    this.logger.warn(`worker.${reasonEvent}`, { workerId: this.config.workerId, consecutiveErrors: this.consecutiveErrors });

    if (this.consecutiveErrors >= this.config.maxConsecutiveErrors) {
      this.logger.error("worker.max_consecutive_errors_exceeded", {
        workerId: this.config.workerId,
        consecutiveErrors: this.consecutiveErrors,
      });
      this.stopRequested = true;
      this.safeTransition("STOPPING");
      this.safeTransition("STOPPED");
      return;
    }

    this.safeTransition("IDLE");
    this.heartbeatTracker.beat();
    this.scheduleTick(this.config.pollIntervalMs);
  }

  /**
   * A `WorkerLifecycle.transition` wrapper that logs instead of throwing on
   * an already-stale transition attempt — the one place this runtime
   * accepts a best-effort race resolution rather than strict validation
   * (see this class's own doc comment for why).
   */
  private safeTransition(to: WorkerLifecycleState): void {
    try {
      this.lifecycle.transition(to);
    } catch (error) {
      this.logger.warn("worker.transition_race_ignored", {
        workerId: this.config.workerId,
        attemptedTo: to,
        actualState: this.lifecycle.state,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private startLeaseRenewalTimer(jobId: string): void {
    this.leaseRenewalTimer = setInterval(() => {
      void this.worker.renewLease(jobId).catch((error: unknown) => {
        this.logger.error("worker.lease_renewal_failed", {
          jobId,
          workerId: this.config.workerId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, this.config.leaseRenewalIntervalMs);
  }

  private stopLeaseRenewalTimer(): void {
    if (this.leaseRenewalTimer) {
      clearInterval(this.leaseRenewalTimer);
      this.leaseRenewalTimer = null;
    }
  }
}
