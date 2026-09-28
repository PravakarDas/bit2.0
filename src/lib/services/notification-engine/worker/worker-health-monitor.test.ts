import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorkerHealthMonitor } from "./worker-health-monitor";
import type { WorkerHeartbeatSnapshot } from "./worker-heartbeat";

function freshHeartbeat(): WorkerHeartbeatSnapshot {
  return { beatCount: 1, lastBeatAt: new Date(), startedAt: new Date(), isStale: false };
}

function staleHeartbeat(): WorkerHeartbeatSnapshot {
  return { beatCount: 1, lastBeatAt: new Date(0), startedAt: new Date(0), isStale: true };
}

describe("WorkerHealthMonitor.resolve", () => {
  it("maps STOPPED -> STOPPED", () => {
    assert.equal(WorkerHealthMonitor.resolve("STOPPED", freshHeartbeat()), "STOPPED");
  });

  it("maps STOPPING -> STOPPED", () => {
    assert.equal(WorkerHealthMonitor.resolve("STOPPING", freshHeartbeat()), "STOPPED");
  });

  it("maps IDLE -> IDLE", () => {
    assert.equal(WorkerHealthMonitor.resolve("IDLE", freshHeartbeat()), "IDLE");
  });

  it("maps PAUSED -> PAUSED", () => {
    assert.equal(WorkerHealthMonitor.resolve("PAUSED", freshHeartbeat()), "PAUSED");
  });

  it("maps RECOVERING -> RECOVERING", () => {
    assert.equal(WorkerHealthMonitor.resolve("RECOVERING", freshHeartbeat()), "RECOVERING");
  });

  it("maps STARTING, CLAIM_JOB, PROCESSING, COMPLETE -> RUNNING when the heartbeat is fresh", () => {
    assert.equal(WorkerHealthMonitor.resolve("STARTING", freshHeartbeat()), "RUNNING");
    assert.equal(WorkerHealthMonitor.resolve("CLAIM_JOB", freshHeartbeat()), "RUNNING");
    assert.equal(WorkerHealthMonitor.resolve("PROCESSING", freshHeartbeat()), "RUNNING");
    assert.equal(WorkerHealthMonitor.resolve("COMPLETE", freshHeartbeat()), "RUNNING");
  });

  it("downgrades a RUNNING-mapped state to RECOVERING when the heartbeat is stale", () => {
    assert.equal(WorkerHealthMonitor.resolve("PROCESSING", staleHeartbeat()), "RECOVERING");
  });

  it("does NOT downgrade IDLE/PAUSED/STOPPED even with a stale heartbeat — idle-and-quiet is not unhealthy", () => {
    assert.equal(WorkerHealthMonitor.resolve("IDLE", staleHeartbeat()), "IDLE");
    assert.equal(WorkerHealthMonitor.resolve("PAUSED", staleHeartbeat()), "PAUSED");
    assert.equal(WorkerHealthMonitor.resolve("STOPPED", staleHeartbeat()), "STOPPED");
  });
});
