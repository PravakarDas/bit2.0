import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ProviderHealthMonitor } from "./provider-health-monitor";
import type { IClock } from "../utils";

class FixedClock implements IClock {
  constructor(private current: Date) {}
  now(): Date {
    return this.current;
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

describe("ProviderHealthMonitor", () => {
  it("reports UNKNOWN for a provider never recorded", () => {
    const monitor = new ProviderHealthMonitor();
    assert.equal(monitor.getState("prov-1"), "UNKNOWN");
    assert.equal(monitor.isUsable("prov-1"), true); // UNKNOWN is optimistically usable — never tried yet
  });

  it("recordSuccess sets HEALTHY and resets the failure counter", () => {
    const monitor = new ProviderHealthMonitor(3);
    monitor.recordFailure("prov-1");
    monitor.recordFailure("prov-1");
    monitor.recordSuccess("prov-1");
    assert.equal(monitor.getState("prov-1"), "HEALTHY");
    assert.equal(monitor.getSnapshot("prov-1").consecutiveFailures, 0);
  });

  it("moves to DEGRADED before the threshold, OFFLINE at the threshold", () => {
    const monitor = new ProviderHealthMonitor(3);
    monitor.recordFailure("prov-1");
    assert.equal(monitor.getState("prov-1"), "DEGRADED");
    monitor.recordFailure("prov-1");
    assert.equal(monitor.getState("prov-1"), "DEGRADED");
    monitor.recordFailure("prov-1");
    assert.equal(monitor.getState("prov-1"), "OFFLINE");
  });

  it("OFFLINE and MAINTENANCE are not usable; HEALTHY/DEGRADED/UNKNOWN are", () => {
    const monitor = new ProviderHealthMonitor(1);
    monitor.recordFailure("prov-1");
    assert.equal(monitor.getState("prov-1"), "OFFLINE");
    assert.equal(monitor.isUsable("prov-1"), false);

    monitor.setState("prov-2", "MAINTENANCE");
    assert.equal(monitor.isUsable("prov-2"), false);

    monitor.setState("prov-3", "DEGRADED");
    assert.equal(monitor.isUsable("prov-3"), true);
  });

  it("MAINTENANCE is sticky — recordSuccess/recordFailure do not override it until manually cleared", () => {
    const monitor = new ProviderHealthMonitor(1);
    monitor.setState("prov-1", "MAINTENANCE");
    monitor.recordSuccess("prov-1");
    assert.equal(monitor.getState("prov-1"), "MAINTENANCE");
    monitor.recordFailure("prov-1");
    assert.equal(monitor.getState("prov-1"), "MAINTENANCE");

    monitor.setState("prov-1", "UNKNOWN");
    monitor.recordSuccess("prov-1");
    assert.equal(monitor.getState("prov-1"), "HEALTHY");
  });

  it("tracks lastFailureAt/lastSuccessAt via the injected clock", () => {
    const clock = new FixedClock(new Date("2026-01-01T00:00:00.000Z"));
    const monitor = new ProviderHealthMonitor(5, clock);
    monitor.recordFailure("prov-1");
    assert.equal(monitor.getSnapshot("prov-1").lastFailureAt?.toISOString(), "2026-01-01T00:00:00.000Z");

    clock.advance(1000);
    monitor.recordSuccess("prov-1");
    assert.equal(monitor.getSnapshot("prov-1").lastSuccessAt?.toISOString(), "2026-01-01T00:00:01.000Z");
  });
});
