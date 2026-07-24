import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RetryScheduler } from "./retry-scheduler";

const FIXED_NOW = new Date("2026-01-01T00:00:00.000Z");
const fixedClock = { now: () => FIXED_NOW };

describe("RetryScheduler.calculate", () => {
  it("schedules a retry for a fresh job (attemptCount=0) with the base delay when jitter is neutral", () => {
    const decision = RetryScheduler.calculate(0, {
      clock: fixedClock,
      random: () => 0.5, // (0.5*2-1) = 0 => zero jitter offset
      baseDelaySeconds: 30,
      maxDelaySeconds: 3600,
      maxAttempts: 5,
      jitterRatio: 0.2,
    });

    assert.equal(decision.shouldRetry, true);
    assert.equal(decision.isExhausted, false);
    assert.ok(decision.nextAttemptAt);
    assert.equal(decision.nextAttemptAt!.getTime(), FIXED_NOW.getTime() + 30_000);
  });

  it("doubles the delay per attempt (exponential backoff), capped by maxDelaySeconds", () => {
    const decision = RetryScheduler.calculate(2, {
      clock: fixedClock,
      random: () => 0.5,
      baseDelaySeconds: 30,
      maxDelaySeconds: 3600,
      maxAttempts: 10,
      jitterRatio: 0.2,
    });
    // 30 * 2^2 = 120s
    assert.equal(decision.nextAttemptAt!.getTime(), FIXED_NOW.getTime() + 120_000);
  });

  it("never exceeds maxDelaySeconds even for a very large attemptCount", () => {
    const decision = RetryScheduler.calculate(20, {
      clock: fixedClock,
      random: () => 0.5,
      baseDelaySeconds: 30,
      maxDelaySeconds: 3600,
      maxAttempts: 50,
      jitterRatio: 0.2,
    });
    assert.equal(decision.nextAttemptAt!.getTime(), FIXED_NOW.getTime() + 3600_000);
  });

  it("applies positive jitter when random() returns 1", () => {
    const decision = RetryScheduler.calculate(0, {
      clock: fixedClock,
      random: () => 1, // (1*2-1) = +1 => full positive jitterSpan
      baseDelaySeconds: 100,
      maxDelaySeconds: 3600,
      maxAttempts: 5,
      jitterRatio: 0.2, // jitterSpan = 20s
    });
    assert.equal(decision.nextAttemptAt!.getTime(), FIXED_NOW.getTime() + 120_000);
  });

  it("applies negative jitter when random() returns 0, never going below zero delay", () => {
    const decision = RetryScheduler.calculate(0, {
      clock: fixedClock,
      random: () => 0, // (0*2-1) = -1 => full negative jitterSpan
      baseDelaySeconds: 100,
      maxDelaySeconds: 3600,
      maxAttempts: 5,
      jitterRatio: 0.2, // jitterSpan = 20s
    });
    assert.equal(decision.nextAttemptAt!.getTime(), FIXED_NOW.getTime() + 80_000);
  });

  it("marks the decision exhausted once attemptCount + 1 >= maxAttempts, returning no nextAttemptAt", () => {
    const decision = RetryScheduler.calculate(4, {
      clock: fixedClock,
      maxAttempts: 5, // nextAttemptNumber = 5 >= 5
    });
    assert.equal(decision.shouldRetry, false);
    assert.equal(decision.isExhausted, true);
    assert.equal(decision.nextAttemptAt, null);
  });

  it("does not mark exhausted one attempt before the limit", () => {
    const decision = RetryScheduler.calculate(3, {
      clock: fixedClock,
      maxAttempts: 5, // nextAttemptNumber = 4 < 5
    });
    assert.equal(decision.shouldRetry, true);
    assert.equal(decision.isExhausted, false);
  });

  it("uses NOTIFICATION_ENGINE_DEFAULTS.retry when no options are given at all", () => {
    const decision = RetryScheduler.calculate(0);
    // Defaults: baseDelaySeconds=30, so with real Math.random the delay should be within [24s, 36s] (±20% jitter of 30s)
    assert.ok(decision.nextAttemptAt);
    const deltaMs = decision.nextAttemptAt!.getTime() - Date.now();
    assert.ok(deltaMs >= 23_000 && deltaMs <= 37_000, `expected ~24000-36000ms, got ${deltaMs}`);
  });
});
