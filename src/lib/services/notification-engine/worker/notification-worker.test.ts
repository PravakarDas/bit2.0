import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { IQueueEngine } from "../queue";
import type { BuildNotificationJobParams } from "../factories";
import { ChannelAdapterFactory, type ChannelDeliveryOutcome, type NotificationChannelAdapter, type RenderedNotificationContent } from "../factories";
import type { NotificationJobDTO } from "../dto";
import type { PaginationParams } from "../queue";
import type { QueueSearchCriteria, QueueSearchResult, QueueStatistics } from "../queue";
import { JobDispatcher } from "./job-dispatcher";
import { NotificationWorker } from "./notification-worker";
import { WorkerMetricsCollector } from "./worker-metrics";
import { resolveWorkerConfig } from "./worker-config";
import { ExecutionContext } from "./execution-context";

function fakeJob(overrides: Partial<NotificationJobDTO> = {}): NotificationJobDTO {
  const now = new Date();
  return {
    id: "job_1",
    eventId: "evt_1",
    channel: "EMAIL",
    recipientUserId: null,
    recipientAddress: "jane@example.com",
    idempotencyKey: "key_1",
    status: "PROCESSING",
    attemptCount: 0,
    maxAttempts: 5,
    nextAttemptAt: now,
    lockedAt: now,
    lockedBy: "worker-1",
    documentId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Mock QueueEngine — per this phase's explicit testing instruction. Records every call for assertions. */
class MockQueueEngine implements IQueueEngine {
  claimNextQueue: (NotificationJobDTO | null)[] = [];
  claimNextError: unknown = null;
  calls: { method: string; args: unknown[] }[] = [];
  completedJobs: NotificationJobDTO[] = [];
  releasedJobIds: string[] = [];
  renewedLeaseJobIds: string[] = [];
  scheduleRetryResult: NotificationJobDTO | null = null;

  private record(method: string, ...args: unknown[]) {
    this.calls.push({ method, args });
  }

  async enqueue(params: BuildNotificationJobParams): Promise<NotificationJobDTO> {
    this.record("enqueue", params);
    return fakeJob();
  }
  async claimNext(workerId: string): Promise<NotificationJobDTO | null> {
    this.record("claimNext", workerId);
    if (this.claimNextError) throw this.claimNextError;
    return this.claimNextQueue.shift() ?? null;
  }
  async claimBatch(): Promise<NotificationJobDTO[]> {
    return [];
  }
  async release(jobId: string, workerId: string): Promise<NotificationJobDTO> {
    this.record("release", jobId, workerId);
    this.releasedJobIds.push(jobId);
    return fakeJob({ id: jobId, status: "QUEUED" });
  }
  async renewLease(jobId: string, workerId: string): Promise<NotificationJobDTO> {
    this.record("renewLease", jobId, workerId);
    this.renewedLeaseJobIds.push(jobId);
    return fakeJob({ id: jobId });
  }
  async complete(jobId: string, workerId: string): Promise<NotificationJobDTO> {
    this.record("complete", jobId, workerId);
    const job = fakeJob({ id: jobId, status: "SENT" });
    this.completedJobs.push(job);
    return job;
  }
  async archive(jobId: string): Promise<NotificationJobDTO> {
    this.record("archive", jobId);
    return fakeJob({ id: jobId, status: "COMPLETED" });
  }
  async markFailed(jobId: string, workerId: string): Promise<NotificationJobDTO> {
    this.record("markFailed", jobId, workerId);
    return fakeJob({ id: jobId, status: "DEAD_LETTER" });
  }
  async scheduleRetry(jobId: string, workerId: string): Promise<NotificationJobDTO> {
    this.record("scheduleRetry", jobId, workerId);
    return this.scheduleRetryResult ?? fakeJob({ id: jobId, status: "RETRY_SCHEDULED", attemptCount: 1, nextAttemptAt: new Date(Date.now() + 30_000) });
  }
  async cancel(jobId: string): Promise<NotificationJobDTO> {
    this.record("cancel", jobId);
    return fakeJob({ id: jobId, status: "DEAD_LETTER" });
  }
  async recoverExpiredLocks(): Promise<number> {
    return 0;
  }
  async findQueued(_pagination?: PaginationParams): Promise<NotificationJobDTO[]> {
    return [];
  }
  async findProcessing(_pagination?: PaginationParams): Promise<NotificationJobDTO[]> {
    return [];
  }
  async findRetryCandidates(_pagination?: PaginationParams): Promise<NotificationJobDTO[]> {
    return [];
  }
  async search(_criteria: QueueSearchCriteria): Promise<QueueSearchResult> {
    return { items: [], total: 0, take: 0, skip: 0 };
  }
  async countQueue(): Promise<number> {
    return 0;
  }
  async countQueued(): Promise<number> {
    return 0;
  }
  async countProcessing(): Promise<number> {
    return 0;
  }
  async countFailures(): Promise<number> {
    return 0;
  }
  async getStatistics(): Promise<QueueStatistics> {
    return {} as QueueStatistics;
  }
}

class MockAdapter implements NotificationChannelAdapter {
  readonly channel = "EMAIL" as const;
  constructor(private readonly shouldSucceed: boolean) {}
  async send(): Promise<ChannelDeliveryOutcome> {
    if (this.shouldSucceed) return { outcome: "SUCCESS" };
    throw new Error("mock provider failure");
  }
}

function buildWorker(queueEngine: MockQueueEngine, adapterSucceeds: boolean) {
  const factory = new ChannelAdapterFactory();
  factory.register(new MockAdapter(adapterSucceeds));
  const dispatcher = new JobDispatcher(factory);
  const metrics = new WorkerMetricsCollector();
  const config = resolveWorkerConfig({ workerId: "worker-1" });
  const worker = new NotificationWorker(queueEngine, dispatcher, metrics, config);
  return { worker, metrics };
}

describe("NotificationWorker.claim", () => {
  it("returns NO_JOB when the queue has nothing eligible", async () => {
    const queueEngine = new MockQueueEngine();
    const { worker } = buildWorker(queueEngine, true);
    const result = await worker.claim();
    assert.equal(result.kind, "NO_JOB");
  });

  it("returns CLAIMED with the job when the queue has work", async () => {
    const queueEngine = new MockQueueEngine();
    queueEngine.claimNextQueue.push(fakeJob());
    const { worker } = buildWorker(queueEngine, true);
    const result = await worker.claim();
    assert.equal(result.kind, "CLAIMED");
  });

  it("returns CLAIM_ERROR when the queue engine throws", async () => {
    const queueEngine = new MockQueueEngine();
    queueEngine.claimNextError = new Error("db unreachable");
    const { worker } = buildWorker(queueEngine, true);
    const result = await worker.claim();
    assert.equal(result.kind, "CLAIM_ERROR");
  });
});

describe("NotificationWorker.execute", () => {
  it("on adapter success: calls queueEngine.complete and records a success metric", async () => {
    const queueEngine = new MockQueueEngine();
    const { worker, metrics } = buildWorker(queueEngine, true);
    const job = fakeJob();
    const context = new ExecutionContext(job, "worker-1");

    const result = await worker.execute(job, context);
    assert.equal(result.kind, "SUCCESS");
    assert.equal(queueEngine.completedJobs.length, 1);
    assert.equal(metrics.getSnapshot().jobsProcessed, 1);
    assert.equal(metrics.getSnapshot().jobsFailed, 0);
  });

  it("on adapter failure: calls queueEngine.scheduleRetry (not markFailed) and records a retried metric", async () => {
    const queueEngine = new MockQueueEngine();
    const { worker, metrics } = buildWorker(queueEngine, false);
    const job = fakeJob();
    const context = new ExecutionContext(job, "worker-1");

    const result = await worker.execute(job, context);
    assert.equal(result.kind, "RETRY_SCHEDULED");
    assert.ok(queueEngine.calls.some((c) => c.method === "scheduleRetry"));
    assert.equal(queueEngine.calls.some((c) => c.method === "markFailed"), false);
    assert.equal(metrics.getSnapshot().jobsRetried, 1);
  });

  it("on no provider registered: still routes to scheduleRetry (ProviderNotImplementedError is transient), never markFailed", async () => {
    const queueEngine = new MockQueueEngine();
    const factory = new ChannelAdapterFactory(); // nothing registered
    const dispatcher = new JobDispatcher(factory);
    const metrics = new WorkerMetricsCollector();
    const config = resolveWorkerConfig({ workerId: "worker-1" });
    const worker = new NotificationWorker(queueEngine, dispatcher, metrics, config);
    const job = fakeJob();
    const context = new ExecutionContext(job, "worker-1");

    const result = await worker.execute(job, context);
    assert.equal(result.kind, "RETRY_SCHEDULED");
    assert.equal(queueEngine.calls.some((c) => c.method === "markFailed"), false);
  });

  it("when scheduleRetry reports DEAD_LETTER (exhausted), returns DEAD_LETTERED", async () => {
    const queueEngine = new MockQueueEngine();
    queueEngine.scheduleRetryResult = fakeJob({ status: "DEAD_LETTER", attemptCount: 5 });
    const { worker } = buildWorker(queueEngine, false);
    const job = fakeJob();
    const context = new ExecutionContext(job, "worker-1");

    const result = await worker.execute(job, context);
    assert.equal(result.kind, "DEAD_LETTERED");
  });

  it("Phase 8 regression: a dispatch that resolves without throwing but reports a delivery FAILURE (e.g. DeliveryManagerChannelAdapter routing to a real provider that failed) still routes to scheduleRetry, not queueEngine.complete", async () => {
    const queueEngine = new MockQueueEngine();
    const factory = new ChannelAdapterFactory();
    factory.register({
      channel: "EMAIL" as const,
      // Resolves normally (does NOT throw) but reports a delivery failure —
      // exactly what DeliveryManagerChannelAdapter does for a TEMPORARY_FAILURE/
      // PERMANENT_FAILURE/NO_PROVIDER_AVAILABLE DeliveryOutcome. Before Phase 8's
      // fix, NotificationWorker only checked `outcome.kind`, so this would have
      // been incorrectly treated as a job success.
      send: async (): Promise<ChannelDeliveryOutcome> => ({ outcome: "FAILURE", errorCode: "SMTP_NOT_CONFIGURED", errorMessage: "not configured" }),
    });
    const dispatcher = new JobDispatcher(factory);
    const metrics = new WorkerMetricsCollector();
    const config = resolveWorkerConfig({ workerId: "worker-1" });
    const worker = new NotificationWorker(queueEngine, dispatcher, metrics, config);
    const job = fakeJob();
    const context = new ExecutionContext(job, "worker-1");

    const result = await worker.execute(job, context);
    assert.equal(result.kind, "RETRY_SCHEDULED");
    assert.equal(queueEngine.completedJobs.length, 0);
    assert.ok(queueEngine.calls.some((c) => c.method === "scheduleRetry"));
    assert.equal(metrics.getSnapshot().jobsRetried, 1);
  });

  it("on cancellation: calls queueEngine.release (not scheduleRetry/markFailed) and does not count as processed", async () => {
    const queueEngine = new MockQueueEngine();
    const factory = new ChannelAdapterFactory();
    factory.register({
      channel: "EMAIL" as const,
      send: () => new Promise<ChannelDeliveryOutcome>(() => {}), // hangs
    });
    const dispatcher = new JobDispatcher(factory);
    const metrics = new WorkerMetricsCollector();
    const config = resolveWorkerConfig({ workerId: "worker-1" });
    const worker = new NotificationWorker(queueEngine, dispatcher, metrics, config);
    const job = fakeJob();
    const context = new ExecutionContext(job, "worker-1");

    const executePromise = worker.execute(job, context);
    context.cancel("test");
    const result = await executePromise;

    assert.equal(result.kind, "CANCELLED");
    assert.deepEqual(queueEngine.releasedJobIds, [job.id]);
    assert.equal(queueEngine.calls.some((c) => c.method === "scheduleRetry"), false);
    assert.equal(metrics.getSnapshot().jobsProcessed, 0);
  });
});

describe("NotificationWorker.renewLease / releaseJob", () => {
  it("renewLease delegates to queueEngine.renewLease with this worker's id", async () => {
    const queueEngine = new MockQueueEngine();
    const { worker } = buildWorker(queueEngine, true);
    await worker.renewLease("job_5");
    assert.deepEqual(queueEngine.renewedLeaseJobIds, ["job_5"]);
  });

  it("releaseJob delegates to queueEngine.release with this worker's id", async () => {
    const queueEngine = new MockQueueEngine();
    const { worker } = buildWorker(queueEngine, true);
    await worker.releaseJob("job_6");
    assert.deepEqual(queueEngine.releasedJobIds, ["job_6"]);
  });
});

describe("NotificationWorker.processNext", () => {
  it("composes claim + execute end to end", async () => {
    const queueEngine = new MockQueueEngine();
    queueEngine.claimNextQueue.push(fakeJob());
    const { worker } = buildWorker(queueEngine, true);
    const result = await worker.processNext();
    assert.equal(result.kind, "SUCCESS");
  });

  it("returns NO_JOB without calling execute when nothing is claimed", async () => {
    const queueEngine = new MockQueueEngine();
    const { worker } = buildWorker(queueEngine, true);
    const result = await worker.processNext();
    assert.equal(result.kind, "NO_JOB");
    assert.equal(queueEngine.calls.some((c) => c.method === "complete"), false);
  });
});
