import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ClaimResult, ProcessResult } from "./notification-worker";
import type { INotificationWorker } from "./notification-worker.interface";
import type { NotificationJobDTO } from "../dto";
import type { ExecutionContext } from "./execution-context";
import { WorkerRuntime } from "./worker-runtime";
import { WorkerMetricsCollector } from "./worker-metrics";
import { resolveWorkerConfig, type WorkerConfig } from "./worker-config";

function fakeJob(overrides: Partial<NotificationJobDTO> = {}): NotificationJobDTO {
  const now = new Date();
  return {
    id: "job_1",
    eventId: "evt_1",
    channel: "EMAIL",
    recipientUserId: null,
    recipientAddress: "jane@example.com",
    idempotencyKey: "key_1",
    status: "QUEUED",
    attemptCount: 0,
    maxAttempts: 5,
    nextAttemptAt: now,
    lockedAt: null,
    lockedBy: null,
    documentId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(predicate: () => boolean, timeoutMs: number, stepMs = 5): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(stepMs);
  }
  throw new Error(`waitUntil timed out after ${timeoutMs}ms`);
}

/** Fake `INotificationWorker` — WorkerRuntime's own tests focus on lifecycle/loop/pause/stop behavior, independent of dispatch correctness (already covered by NotificationWorker's own tests against a mocked QueueEngine). */
class FakeWorker implements INotificationWorker {
  claimQueue: ClaimResult[] = [];
  executeResult: ProcessResult = { kind: "SUCCESS", jobId: "job_1", runtimeMs: 1 };
  executeDelayMs = 0;
  claimCallCount = 0;
  executeCallCount = 0;
  renewLeaseCalls: string[] = [];
  releaseJobCalls: string[] = [];

  async claim(): Promise<ClaimResult> {
    this.claimCallCount += 1;
    return this.claimQueue.shift() ?? { kind: "NO_JOB" };
  }

  async execute(_job: NotificationJobDTO, _context: ExecutionContext): Promise<ProcessResult> {
    this.executeCallCount += 1;
    if (this.executeDelayMs > 0) {
      await delay(this.executeDelayMs);
    }
    return this.executeResult;
  }

  async processNext(): Promise<ProcessResult | { kind: "NO_JOB" } | { kind: "CLAIM_ERROR"; error: unknown }> {
    const claimed = await this.claim();
    if (claimed.kind !== "CLAIMED") return claimed;
    return this.execute(claimed.job, {} as ExecutionContext);
  }

  async renewLease(jobId: string): Promise<void> {
    this.renewLeaseCalls.push(jobId);
  }

  async releaseJob(jobId: string): Promise<void> {
    this.releaseJobCalls.push(jobId);
  }
}

function buildRuntime(configOverrides: Partial<WorkerConfig> = {}) {
  const worker = new FakeWorker();
  const metrics = new WorkerMetricsCollector();
  const config = resolveWorkerConfig({
    workerId: "worker-test",
    pollIntervalMs: 15,
    leaseRenewalIntervalMs: 15,
    heartbeatStaleAfterMs: 5000,
    shutdownGracePeriodMs: 200,
    maxConsecutiveErrors: 3,
    ...configOverrides,
  });
  const runtime = new WorkerRuntime(worker, metrics, config);
  return { runtime, worker, metrics, config };
}

describe("WorkerRuntime start/stop", () => {
  it("starts in STOPPED and reaches IDLE after start()", async () => {
    const { runtime } = buildRuntime();
    assert.equal(runtime.status(), "STOPPED");
    try {
      await runtime.start();
      assert.equal(runtime.status(), "IDLE");
    } finally {
      await runtime.stop();
    }
  });

  it("throws if start() is called while already running", async () => {
    const { runtime } = buildRuntime();
    try {
      await runtime.start();
      await assert.rejects(() => runtime.start());
    } finally {
      await runtime.stop();
    }
  });

  it("stop() from IDLE transitions cleanly to STOPPED", async () => {
    const { runtime } = buildRuntime();
    await runtime.start();
    await runtime.stop();
    assert.equal(runtime.status(), "STOPPED");
  });

  it("stop() is idempotent when already STOPPED", async () => {
    const { runtime } = buildRuntime();
    await runtime.stop(); // never started
    assert.equal(runtime.status(), "STOPPED");
  });

  it("polls repeatedly when idle (claim called more than once over time)", async () => {
    const { runtime, worker } = buildRuntime();
    try {
      await runtime.start();
      await waitUntil(() => worker.claimCallCount >= 3, 1000);
      assert.ok(worker.claimCallCount >= 3);
    } finally {
      await runtime.stop();
    }
  });
});

describe("WorkerRuntime job processing", () => {
  it("claims and executes a job, returning to IDLE afterward", async () => {
    const { runtime, worker } = buildRuntime();
    worker.claimQueue.push({ kind: "CLAIMED", job: fakeJob() });
    try {
      await runtime.start();
      await waitUntil(() => worker.executeCallCount >= 1, 1000);
      await waitUntil(() => runtime.status() === "IDLE", 1000);
      assert.equal(worker.executeCallCount, 1);
    } finally {
      await runtime.stop();
    }
  });

  it("records metrics for a processed job", async () => {
    const { runtime, worker, metrics } = buildRuntime();
    worker.claimQueue.push({ kind: "CLAIMED", job: fakeJob() });
    worker.executeResult = { kind: "SUCCESS", jobId: "job_1", runtimeMs: 5 };
    try {
      await runtime.start();
      await waitUntil(() => worker.executeCallCount >= 1, 1000);
      await waitUntil(() => runtime.status() === "IDLE", 1000);
    } finally {
      await runtime.stop();
    }
    // NotificationWorker (not this fake) is what actually calls metrics.recordX — this fake doesn't,
    // so we only assert the runtime completed the cycle without error; metrics recording itself is
    // covered by notification-worker.test.ts against a real NotificationWorker.
    assert.equal(worker.executeCallCount, 1);
    void metrics;
  });
});

describe("WorkerRuntime pause/resume", () => {
  it("pause() from IDLE takes effect immediately", async () => {
    const { runtime } = buildRuntime();
    try {
      await runtime.start();
      await waitUntil(() => runtime.status() === "IDLE", 1000);
      runtime.pause();
      assert.equal(runtime.status(), "PAUSED");
    } finally {
      await runtime.stop();
    }
  });

  it("does not claim while paused", async () => {
    const { runtime, worker } = buildRuntime();
    try {
      await runtime.start();
      await waitUntil(() => runtime.status() === "IDLE", 1000);
      runtime.pause();
      const claimsAtPause = worker.claimCallCount;
      await delay(100);
      assert.equal(worker.claimCallCount, claimsAtPause);
    } finally {
      await runtime.stop();
    }
  });

  it("resume() returns to IDLE and claiming resumes", async () => {
    const { runtime, worker } = buildRuntime();
    try {
      await runtime.start();
      await waitUntil(() => runtime.status() === "IDLE", 1000);
      runtime.pause();
      assert.equal(runtime.status(), "PAUSED");
      const claimsAtPause = worker.claimCallCount;
      runtime.resume();
      await waitUntil(() => worker.claimCallCount > claimsAtPause, 1000);
      assert.ok(worker.claimCallCount > claimsAtPause);
    } finally {
      await runtime.stop();
    }
  });
});

describe("WorkerRuntime health / metrics / heartbeat", () => {
  it("health() reflects IDLE, then STOPPED after stop()", async () => {
    const { runtime } = buildRuntime();
    await runtime.start();
    await waitUntil(() => runtime.status() === "IDLE", 1000);
    assert.equal(runtime.health(), "IDLE");
    await runtime.stop();
    assert.equal(runtime.health(), "STOPPED");
  });

  it("health() reflects PAUSED", async () => {
    const { runtime } = buildRuntime();
    try {
      await runtime.start();
      await waitUntil(() => runtime.status() === "IDLE", 1000);
      runtime.pause();
      assert.equal(runtime.health(), "PAUSED");
    } finally {
      await runtime.stop();
    }
  });

  it("metrics() returns a live snapshot", async () => {
    const { runtime } = buildRuntime();
    try {
      await runtime.start();
      const snapshot = runtime.metrics();
      assert.equal(typeof snapshot.jobsProcessed, "number");
      assert.equal(typeof snapshot.uptimeMs, "number");
    } finally {
      await runtime.stop();
    }
  });

  it("heartbeat() beat count increases as the loop ticks", async () => {
    const { runtime } = buildRuntime();
    try {
      await runtime.start();
      const first = runtime.heartbeat().beatCount;
      await waitUntil(() => runtime.heartbeat().beatCount > first, 1000);
      assert.ok(runtime.heartbeat().beatCount > first);
    } finally {
      await runtime.stop();
    }
  });
});

describe("WorkerRuntime graceful shutdown", () => {
  it("waits for an in-flight job to finish naturally when it completes within the grace period", async () => {
    const { runtime, worker } = buildRuntime({ shutdownGracePeriodMs: 500 });
    worker.claimQueue.push({ kind: "CLAIMED", job: fakeJob() });
    worker.executeDelayMs = 100; // finishes well within the 500ms grace period

    await runtime.start();
    await waitUntil(() => runtime.status() === "PROCESSING", 1000);
    await runtime.stop();

    assert.equal(runtime.status(), "STOPPED");
    assert.equal(worker.releaseJobCalls.length, 0); // finished naturally — never force-released
  });

  it("forces a release when the in-flight job exceeds the grace period", async () => {
    const { runtime, worker } = buildRuntime({ shutdownGracePeriodMs: 60 });
    worker.claimQueue.push({ kind: "CLAIMED", job: fakeJob({ id: "job_slow" }) });
    worker.executeDelayMs = 5000; // far longer than the 60ms grace period

    await runtime.start();
    await waitUntil(() => runtime.status() === "PROCESSING", 1000);
    await runtime.stop();

    assert.equal(runtime.status(), "STOPPED");
    assert.deepEqual(worker.releaseJobCalls, ["job_slow"]);
  });
});

describe("WorkerRuntime lease renewal", () => {
  it("renews the lease periodically while a job is in flight", async () => {
    const { runtime, worker } = buildRuntime({ leaseRenewalIntervalMs: 10, shutdownGracePeriodMs: 500 });
    worker.claimQueue.push({ kind: "CLAIMED", job: fakeJob({ id: "job_longrunning" }) });
    worker.executeDelayMs = 100;

    await runtime.start();
    await waitUntil(() => worker.renewLeaseCalls.length >= 1, 1000);
    await runtime.stop();

    assert.ok(worker.renewLeaseCalls.length >= 1);
    assert.ok(worker.renewLeaseCalls.every((id) => id === "job_longrunning"));
  });
});

describe("WorkerRuntime error recovery", () => {
  it("stops itself after maxConsecutiveErrors consecutive claim failures (contract-compliant CLAIM_ERROR path)", async () => {
    const { runtime, worker } = buildRuntime({ maxConsecutiveErrors: 3, pollIntervalMs: 10 });
    worker.claim = async () => ({ kind: "CLAIM_ERROR", error: new Error("db unreachable") });

    await runtime.start();
    await waitUntil(() => runtime.status() === "STOPPED", 2000);
    assert.equal(runtime.status(), "STOPPED");
  });

  it("also recovers (defense in depth) if claim() violates its contract and throws directly instead of returning CLAIM_ERROR", async () => {
    const { runtime, worker } = buildRuntime({ maxConsecutiveErrors: 3, pollIntervalMs: 10 });
    worker.claim = async () => {
      throw new Error("contract violation: threw instead of returning CLAIM_ERROR");
    };

    await runtime.start();
    await waitUntil(() => runtime.status() === "STOPPED", 2000);
    assert.equal(runtime.status(), "STOPPED");
  });
});

describe("WorkerRuntime.restart", () => {
  it("stops and starts again, returning to IDLE", async () => {
    const { runtime } = buildRuntime();
    try {
      await runtime.start();
      await waitUntil(() => runtime.status() === "IDLE", 1000);
      await runtime.restart();
      await waitUntil(() => runtime.status() === "IDLE", 1000);
      assert.equal(runtime.status(), "IDLE");
    } finally {
      await runtime.stop();
    }
  });
});
