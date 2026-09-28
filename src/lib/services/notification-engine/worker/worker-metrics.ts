import { SystemClock, type IClock } from "../utils";

export interface WorkerMetricsSnapshot {
  jobsProcessed: number;
  jobsFailed: number;
  jobsRetried: number;
  averageRuntimeMs: number;
  currentRuntimeMs: number | null;
  uptimeMs: number;
}

/**
 * In-memory only (no persistence — see worker-heartbeat.ts's doc comment
 * for the same reasoning: no new Prisma model this phase). Tracks exactly
 * the six figures this phase requests: Jobs Processed, Jobs Failed, Jobs
 * Retried, Average Runtime, Current Runtime, Worker Uptime.
 *
 * "Processed" counts every job that reached a terminal outcome for this
 * attempt (success, permanent failure, or scheduled for retry) — "Failed"
 * and "Retried" are each also counted independently so a caller can see
 * the breakdown, not just the total.
 */
export class WorkerMetricsCollector {
  private jobsProcessed = 0;
  private jobsFailed = 0;
  private jobsRetried = 0;
  private totalRuntimeMs = 0;
  private currentJobStartedAt: Date | null = null;
  private readonly startedAt: Date;

  constructor(private readonly clock: IClock = new SystemClock()) {
    this.startedAt = this.clock.now();
  }

  startJob(): void {
    this.currentJobStartedAt = this.clock.now();
  }

  recordSuccess(runtimeMs: number): void {
    this.jobsProcessed += 1;
    this.totalRuntimeMs += runtimeMs;
    this.currentJobStartedAt = null;
  }

  recordFailure(runtimeMs: number): void {
    this.jobsProcessed += 1;
    this.jobsFailed += 1;
    this.totalRuntimeMs += runtimeMs;
    this.currentJobStartedAt = null;
  }

  recordRetried(runtimeMs: number): void {
    this.jobsProcessed += 1;
    this.jobsRetried += 1;
    this.totalRuntimeMs += runtimeMs;
    this.currentJobStartedAt = null;
  }

  /**
   * A cancelled job is released back to QUEUED with no attempt penalty
   * (see NotificationWorker's CANCELLED branch) — it was neither
   * successfully processed, nor a recorded failure, nor a retry decision,
   * so it deliberately does not increment any of those three counters.
   * Still clears the in-flight timer so `currentRuntimeMs` doesn't keep
   * counting a job that's no longer being worked on.
   */
  cancelJob(): void {
    this.currentJobStartedAt = null;
  }

  getSnapshot(): WorkerMetricsSnapshot {
    const now = this.clock.now();
    return {
      jobsProcessed: this.jobsProcessed,
      jobsFailed: this.jobsFailed,
      jobsRetried: this.jobsRetried,
      averageRuntimeMs: this.jobsProcessed === 0 ? 0 : this.totalRuntimeMs / this.jobsProcessed,
      currentRuntimeMs: this.currentJobStartedAt ? now.getTime() - this.currentJobStartedAt.getTime() : null,
      uptimeMs: now.getTime() - this.startedAt.getTime(),
    };
  }
}
