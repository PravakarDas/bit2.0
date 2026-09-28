import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorkerHeartbeat } from "./worker-heartbeat";

class FakeClock {
  constructor(private current: Date) {}
  now(): Date {
    return this.current;
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

describe("WorkerHeartbeat", () => {
  it("starts with zero beats and no lastBeatAt", () => {
    const clock = new FakeClock(new Date("2026-01-01T00:00:00.000Z"));
    const heartbeat = new WorkerHeartbeat(60_000, clock);
    const snapshot = heartbeat.getSnapshot();
    assert.equal(snapshot.beatCount, 0);
    assert.equal(snapshot.lastBeatAt, null);
    assert.equal(snapshot.isStale, false); // no beat yet is not "stale" — nothing to be stale relative to
  });

  it("increments beatCount and records lastBeatAt on beat()", () => {
    const clock = new FakeClock(new Date("2026-01-01T00:00:00.000Z"));
    const heartbeat = new WorkerHeartbeat(60_000, clock);
    heartbeat.beat();
    clock.advance(1000);
    heartbeat.beat();
    const snapshot = heartbeat.getSnapshot();
    assert.equal(snapshot.beatCount, 2);
    assert.equal(snapshot.lastBeatAt?.getTime(), clock.now().getTime());
  });

  it("is not stale immediately after a beat", () => {
    const clock = new FakeClock(new Date("2026-01-01T00:00:00.000Z"));
    const heartbeat = new WorkerHeartbeat(60_000, clock);
    heartbeat.beat();
    assert.equal(heartbeat.getSnapshot().isStale, false);
  });

  it("becomes stale once staleAfterMs has elapsed since the last beat", () => {
    const clock = new FakeClock(new Date("2026-01-01T00:00:00.000Z"));
    const heartbeat = new WorkerHeartbeat(60_000, clock);
    heartbeat.beat();
    clock.advance(60_001);
    assert.equal(heartbeat.getSnapshot().isStale, true);
  });

  it("tracks uptime via startedAt across getSnapshot calls", () => {
    const clock = new FakeClock(new Date("2026-01-01T00:00:00.000Z"));
    const heartbeat = new WorkerHeartbeat(60_000, clock);
    const startedAt = heartbeat.getSnapshot().startedAt;
    clock.advance(5000);
    assert.equal(heartbeat.getSnapshot().startedAt.getTime(), startedAt.getTime());
  });
});
