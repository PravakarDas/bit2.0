import type { NotificationJobDTO } from "../dto";

/**
 * Per-job execution state, created fresh for each claimed job (the
 * "Create Execution Context" pipeline step). Carries everything the rest
 * of the pipeline (`JobDispatcher`, `NotificationWorker`) needs without
 * threading five separate parameters through every call.
 *
 * Cancellation (item 14) uses the standard, built-in `AbortController`/
 * `AbortSignal` — no new dependency, and no change to Phase 2's frozen
 * `NotificationChannelAdapter.send(job, content)` signature (that
 * interface is untouched; `JobDispatcher` races the adapter's promise
 * against this context's signal instead of threading the signal into the
 * adapter call itself — see job-dispatcher.ts).
 */
export class ExecutionContext {
  readonly jobId: string;
  readonly workerId: string;
  readonly channel: NotificationJobDTO["channel"];
  readonly attemptNumber: number;
  readonly startedAt: Date;
  private readonly abortController = new AbortController();

  constructor(job: NotificationJobDTO, workerId: string, startedAt: Date = new Date()) {
    this.jobId = job.id;
    this.workerId = workerId;
    this.channel = job.channel;
    this.attemptNumber = job.attemptCount + 1;
    this.startedAt = startedAt;
  }

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  get isCancelled(): boolean {
    return this.abortController.signal.aborted;
  }

  cancel(reason: string): void {
    if (!this.abortController.signal.aborted) {
      this.abortController.abort(reason);
    }
  }

  elapsedMs(now: Date = new Date()): number {
    return now.getTime() - this.startedAt.getTime();
  }
}
