import type { NotificationJobDTO } from "../dto";
import type { ExecutionContext } from "./execution-context";
import type { ClaimResult, ProcessResult } from "./notification-worker";

/**
 * Extracted from `NotificationWorker`'s already-existing public shape, same
 * reasoning as `IQueueEngine` (see queue/queue-engine.interface.ts) — lets
 * `WorkerRuntime` depend on the abstraction, which is what makes "mock
 * Provider Adapter"-level and worker-level unit testing of the *runtime*
 * (lifecycle/loop/pause/stop, independent of dispatch correctness, already
 * covered by NotificationWorker's own tests) possible without a
 * TypeScript private-field structural-typing conflict.
 */
export interface INotificationWorker {
  claim(): Promise<ClaimResult>;
  execute(job: NotificationJobDTO, context: ExecutionContext): Promise<ProcessResult>;
  processNext(): Promise<ProcessResult | { kind: "NO_JOB" } | { kind: "CLAIM_ERROR"; error: unknown }>;
  renewLease(jobId: string): Promise<void>;
  releaseJob(jobId: string): Promise<void>;
}
