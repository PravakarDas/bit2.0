import type { BuildNotificationJobParams } from "../factories";
import type { NotificationJobDTO } from "../dto";
import type { PaginationParams } from "./queue-repository.interface";
import type { QueueSearchCriteria, QueueSearchResult, QueueStatistics } from "./queue-query.dto";

/**
 * Phase 4 addition (additive — see WorkerRuntimeReport.md "Architecture
 * Compliance"). Extracted from `QueueEngine`'s already-existing public
 * method shape — no method added, removed, or changed; this only makes an
 * implicit contract explicit so `NotificationWorker` can depend on the
 * abstraction (Dependency Inversion, the same reason every repository in
 * this module is consumed through an interface) instead of the concrete
 * class, which is what makes "mock QueueEngine" in a unit test possible at
 * all — `QueueEngine` has private constructor-injected fields, so
 * TypeScript's structural typing does not allow a plain fake object to
 * satisfy the class type directly; it does allow one to satisfy this
 * interface.
 */
export interface IQueueEngine {
  enqueue(params: BuildNotificationJobParams): Promise<NotificationJobDTO>;
  claimNext(workerId: string): Promise<NotificationJobDTO | null>;
  claimBatch(workerId: string, batchSize: number): Promise<NotificationJobDTO[]>;
  release(jobId: string, workerId: string): Promise<NotificationJobDTO>;
  renewLease(jobId: string, workerId: string): Promise<NotificationJobDTO>;
  complete(jobId: string, workerId: string): Promise<NotificationJobDTO>;
  archive(jobId: string): Promise<NotificationJobDTO>;
  markFailed(jobId: string, workerId: string): Promise<NotificationJobDTO>;
  scheduleRetry(jobId: string, workerId: string): Promise<NotificationJobDTO>;
  cancel(jobId: string): Promise<NotificationJobDTO>;
  recoverExpiredLocks(leaseDurationMs?: number): Promise<number>;
  findQueued(pagination?: PaginationParams): Promise<NotificationJobDTO[]>;
  findProcessing(pagination?: PaginationParams): Promise<NotificationJobDTO[]>;
  findRetryCandidates(pagination?: PaginationParams): Promise<NotificationJobDTO[]>;
  search(criteria: QueueSearchCriteria): Promise<QueueSearchResult>;
  countQueue(): Promise<number>;
  countQueued(): Promise<number>;
  countProcessing(): Promise<number>;
  countFailures(): Promise<number>;
  getStatistics(): Promise<QueueStatistics>;
}
