import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorkerMetricsCollector } from "./worker-metrics";

class FakeClock {
  constructor(private current: Date) {}
  now(): Date {
    return this.current;
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

describe("WorkerMetricsCollector", () => {
  it("starts at all zeros with null currentRuntimeMs", () => {
    const clock = new FakeClock(new Date());
    const metrics = new WorkerMetricsCollector(clock);
    const snapshot = metrics.getSnapshot();
    assert.equal(snapshot.jobsProcessed, 0);
    assert.equal(snapshot.jobsFailed, 0);
    assert.equal(snapshot.jobsRetried, 0);
    assert.equal(snapshot.averageRuntimeMs, 0);
    assert.equal(snapshot.currentRuntimeMs, null);
  });

  it("reports currentRuntimeMs while a job is in flight (startJob called, not yet recorded)", () => {
    const clock = new FakeClock(new Date("2026-01-01T00:00:00.000Z"));
    const metrics = new WorkerMetricsCollector(clock);
    metrics.startJob();
    clock.advance(250);
    assert.equal(metrics.getSnapshot().currentRuntimeMs, 250);
  });

  it("recordSuccess increments jobsProcessed only, and clears currentRuntimeMs", () => {
    const clock = new FakeClock(new Date());
    const metrics = new WorkerMetricsCollector(clock);
    metrics.startJob();
    metrics.recordSuccess(100);
    const snapshot = metrics.getSnapshot();
    assert.equal(snapshot.jobsProcessed, 1);
    assert.equal(snapshot.jobsFailed, 0);
    assert.equal(snapshot.jobsRetried, 0);
    assert.equal(snapshot.currentRuntimeMs, null);
  });

  it("recordRetried increments both jobsProcessed and jobsRetried", () => {
    const metrics = new WorkerMetricsCollector();
    metrics.startJob();
    metrics.recordRetried(50);
    const snapshot = metrics.getSnapshot();
    assert.equal(snapshot.jobsProcessed, 1);
    assert.equal(snapshot.jobsRetried, 1);
    assert.equal(snapshot.jobsFailed, 0);
  });

  it("recordFailure increments both jobsProcessed and jobsFailed", () => {
    const metrics = new WorkerMetricsCollector();
    metrics.startJob();
    metrics.recordFailure(75);
    const snapshot = metrics.getSnapshot();
    assert.equal(snapshot.jobsProcessed, 1);
    assert.equal(snapshot.jobsFailed, 1);
    assert.equal(snapshot.jobsRetried, 0);
  });

  it("cancelJob does not increment jobsProcessed/Failed/Retried, only clears the in-flight timer", () => {
    const metrics = new WorkerMetricsCollector();
    metrics.startJob();
    metrics.cancelJob();
    const snapshot = metrics.getSnapshot();
    assert.equal(snapshot.jobsProcessed, 0);
    assert.equal(snapshot.jobsFailed, 0);
    assert.equal(snapshot.jobsRetried, 0);
    assert.equal(snapshot.currentRuntimeMs, null);
  });

  it("computes averageRuntimeMs across mixed outcomes", () => {
    const metrics = new WorkerMetricsCollector();
    metrics.startJob();
    metrics.recordSuccess(100);
    metrics.startJob();
    metrics.recordRetried(200);
    metrics.startJob();
    metrics.recordFailure(300);
    assert.equal(metrics.getSnapshot().averageRuntimeMs, 200); // (100+200+300)/3
  });

  it("tracks uptimeMs from construction", () => {
    const clock = new FakeClock(new Date("2026-01-01T00:00:00.000Z"));
    const metrics = new WorkerMetricsCollector(clock);
    clock.advance(10_000);
    assert.equal(metrics.getSnapshot().uptimeMs, 10_000);
  });
});
