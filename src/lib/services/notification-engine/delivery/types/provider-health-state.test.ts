import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isProviderHealthUsable, toDbHealthStatus, fromDbHealthStatus } from "./provider-health-state";
import { NotificationProviderHealthStatus } from "../../types/enums";

describe("isProviderHealthUsable", () => {
  it("HEALTHY, DEGRADED, and UNKNOWN are usable", () => {
    assert.equal(isProviderHealthUsable("HEALTHY"), true);
    assert.equal(isProviderHealthUsable("DEGRADED"), true);
    assert.equal(isProviderHealthUsable("UNKNOWN"), true);
  });

  it("OFFLINE and MAINTENANCE are not usable", () => {
    assert.equal(isProviderHealthUsable("OFFLINE"), false);
    assert.equal(isProviderHealthUsable("MAINTENANCE"), false);
  });
});

describe("toDbHealthStatus / fromDbHealthStatus", () => {
  it("maps HEALTHY and UNKNOWN both to the DB's HEALTHY (lossy, by necessity)", () => {
    assert.equal(toDbHealthStatus("HEALTHY"), NotificationProviderHealthStatus.HEALTHY);
    assert.equal(toDbHealthStatus("UNKNOWN"), NotificationProviderHealthStatus.HEALTHY);
  });

  it("maps DEGRADED to the DB's DEGRADED", () => {
    assert.equal(toDbHealthStatus("DEGRADED"), NotificationProviderHealthStatus.DEGRADED);
  });

  it("maps OFFLINE and MAINTENANCE both to the DB's DOWN (lossy, by necessity)", () => {
    assert.equal(toDbHealthStatus("OFFLINE"), NotificationProviderHealthStatus.DOWN);
    assert.equal(toDbHealthStatus("MAINTENANCE"), NotificationProviderHealthStatus.DOWN);
  });

  it("fromDbHealthStatus round-trips the 3 DB values to their runtime equivalents", () => {
    assert.equal(fromDbHealthStatus(NotificationProviderHealthStatus.HEALTHY), "HEALTHY");
    assert.equal(fromDbHealthStatus(NotificationProviderHealthStatus.DEGRADED), "DEGRADED");
    assert.equal(fromDbHealthStatus(NotificationProviderHealthStatus.DOWN), "OFFLINE");
  });
});
