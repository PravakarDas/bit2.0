import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ClaimResult, ProcessResult } from "./notification-worker";
import type { INotificationWorker } from "./notification-worker.interface";
import type { NotificationJobDTO } from "../dto";
import type { ExecutionContext } from "./execution-context";
import { WorkerRuntime } from "./worker-runtime";
import { WorkerMetricsCollector } from "./worker-metrics";
import { resolveWorkerConfig, type WorkerConfig } from "./worker-config";
import { WorkerLifecycleManager } from "./worker-lifecycle-manager";
import type { IQueueLogger, LogContext } from "../queue/logger.interface";

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

/** Same fake `INotificationWorker` shape as `worker-runtime.test.ts` — duplicated per this module's established "don't share test fakes across files" precedent. */
class FakeWorker implements INotificationWorker {
  claimQueue: ClaimResult[] = [];
  executeResult: ProcessResult = { kind: "SUCCESS", jobId: "job_1", runtimeMs: 1 };

  async claim(): Promise<ClaimResult> {
    return this.claimQueue.shift() ?? { kind: "NO_JOB" };
  }
  async execute(_job: NotificationJobDTO, _context: ExecutionContext): Promise<ProcessResult> {
    return this.executeResult;
  }
  async processNext(): Promise<ProcessResult | { kind: "NO_JOB" } | { kind: "CLAIM_ERROR"; error: unknown }> {
    const claimed = await this.claim();
    if (claimed.kind !== "CLAIMED") return claimed;
    return this.execute(claimed.job, {} as ExecutionContext);
  }
  async renewLease(): Promise<void> {}
  async releaseJob(): Promise<void> {}
}

/** Fake for the one method `WorkerLifecycleManager` needs — `Pick<IQueueEngine, "recoverExpiredLocks">`. */
class FakeExpiredLockRecoverer {
  calls: (number | undefined)[] = [];
  nextResult = 0;
  /** When set, the *next* call throws instead of resolving — for the reaper-error-handling test. */
  throwNext: Error | null = null;

  async recoverExpiredLocks(leaseDurationMs?: number): Promise<number> {
    this.calls.push(leaseDurationMs);
    if (this.throwNext) {
      const error = this.throwNext;
      this.throwNext = null;
      throw error;
    }
    return this.nextResult;
  }
}

class RecordingLogger implements IQueueLogger {
  events: { level: "debug" | "info" | "warn" | "error"; event: string; context?: LogContext }[] = [];
  debug(event: string, context?: LogContext): void {
    this.events.push({ level: "debug", event, context });
  }
  info(event: string, context?: LogContext): void {
    this.events.push({ level: "info", event, context });
  }
  warn(event: string, context?: LogContext): void {
    this.events.push({ level: "warn", event, context });
  }
  error(event: string, context?: LogContext): void {
    this.events.push({ level: "error", event, context });
  }
}

function buildManager(configOverrides: Partial<WorkerConfig> = {}, reaperIntervalMs = 20) {
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
  const queueEngine = new FakeExpiredLockRecoverer();
  const logger = new RecordingLogger();
  const manager = new WorkerLifecycleManager({
    runtime,
    queueEngine,
    leaseDurationMs: 300_000,
    reaperIntervalMs,
    logger,
  });
  return { manager, runtime, worker, queueEngine, logger };
}

describe("WorkerLifecycleManager — startup", () => {
  it("recovers expired leases once on startup, then starts the runtime", async () => {
    const { manager, runtime, queueEngine } = buildManager();
    queueEngine.nextResult = 2;

    await manager.start();
    try {
      assert.equal(queueEngine.calls.length, 1);
      assert.equal(queueEngine.calls[0], 300_000);
      assert.equal(runtime.status(), "IDLE");
      assert.equal(manager.isStarted(), true);
    } finally {
      await manager.stop();
    }
  });

  it("logs worker_lifecycle.started and startup_recovery", async () => {
    const { manager, logger } = buildManager();
    await manager.start();
    try {
      assert.ok(logger.events.some((e) => e.event === "worker_lifecycle.startup_recovery"));
      assert.ok(logger.events.some((e) => e.event === "worker_lifecycle.started"));
    } finally {
      await manager.stop();
    }
  });
});

describe("WorkerLifecycleManager — duplicate startup", () => {
  it("a second start() call is a safe no-op, not a thrown error", async () => {
    const { manager, queueEngine, logger } = buildManager();
    await manager.start();
    try {
      await manager.start(); // second call
      assert.equal(queueEngine.calls.length, 1); // no second recovery sweep, no second runtime.start()
      assert.ok(logger.events.some((e) => e.event === "worker_lifecycle.duplicate_start_prevented"));
    } finally {
      await manager.stop();
    }
  });
});

describe("WorkerLifecycleManager — shutdown", () => {
  it("stop() stops the runtime and clears the reaper interval (no further recovery sweeps)", async () => {
    const { manager, runtime, queueEngine } = buildManager({}, 15);
    await manager.start();
    await waitUntil(() => queueEngine.calls.length >= 2, 500); // at least one periodic sweep has fired

    await manager.stop();
    assert.equal(runtime.status(), "STOPPED");
    assert.equal(manager.isStarted(), false);

    const callCountAtStop = queueEngine.calls.length;
    await delay(60); // long enough for several more ticks if the interval weren't cleared
    assert.equal(queueEngine.calls.length, callCountAtStop);
  });

  it("stop() before start() is a safe no-op", async () => {
    const { manager, runtime } = buildManager();
    await manager.stop();
    assert.equal(runtime.status(), "STOPPED");
  });
});

describe("WorkerLifecycleManager — restart", () => {
  it("restart() stops then starts again, resuming lease recovery", async () => {
    const { manager, runtime, queueEngine } = buildManager();
    await manager.start();
    const callsBeforeRestart = queueEngine.calls.length;

    await manager.restart();
    try {
      assert.equal(runtime.status(), "IDLE");
      assert.equal(manager.isStarted(), true);
      assert.ok(queueEngine.calls.length > callsBeforeRestart); // a fresh startup-recovery sweep ran
    } finally {
      await manager.stop();
    }
  });
});

describe("WorkerLifecycleManager — ongoing lease recovery", () => {
  it("sweeps for expired leases on an interval while running", async () => {
    const { manager, queueEngine } = buildManager({}, 15);
    await manager.start();
    try {
      await waitUntil(() => queueEngine.calls.length >= 3, 500);
      assert.ok(queueEngine.calls.length >= 3);
    } finally {
      await manager.stop();
    }
  });

  it("a reaper sweep failure is logged, not thrown, and does not stop future sweeps", async () => {
    const { manager, queueEngine, logger } = buildManager({}, 15);
    await manager.start();
    try {
      queueEngine.throwNext = new Error("db unreachable");
      await waitUntil(() => logger.events.some((e) => e.event === "worker_lifecycle.reaper_failed"), 500);
      const callsAtFailure = queueEngine.calls.length;
      await waitUntil(() => queueEngine.calls.length > callsAtFailure, 500); // sweeping continues after the failure
    } finally {
      await manager.stop();
    }
  });
});

describe("WorkerLifecycleManager — health", () => {
  it("snapshot() reflects isStarted/lifecycleState/health/heartbeat/metrics before and after start", async () => {
    const { manager } = buildManager();

    const before = manager.snapshot();
    assert.equal(before.isStarted, false);
    assert.equal(before.lifecycleState, "STOPPED");
    assert.equal(before.health, "STOPPED");

    await manager.start();
    try {
      const after = manager.snapshot();
      assert.equal(after.isStarted, true);
      assert.equal(after.lifecycleState, "IDLE");
      assert.equal(after.health, "IDLE");
      assert.equal(typeof after.heartbeat.beatCount, "number");
      assert.equal(typeof after.metrics.jobsProcessed, "number");
    } finally {
      await manager.stop();
    }
  });
});
