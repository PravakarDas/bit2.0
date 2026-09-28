import { NOTIFICATION_ENGINE_DEFAULTS } from "../constants";
import { SystemClock, type IClock } from "../utils";

export interface RetryDecision {
  /** Whether another attempt should be scheduled at all. */
  shouldRetry: boolean;
  /** When the next attempt becomes eligible — `null` if `shouldRetry` is false. */
  nextAttemptAt: Date | null;
  /** True once `attemptCount + 1 >= maxAttempts` — the caller should dead-letter, not retry. */
  isExhausted: boolean;
}

export interface RetrySchedulerOptions {
  baseDelaySeconds?: number;
  maxDelaySeconds?: number;
  maxAttempts?: number;
  jitterRatio?: number;
  /** Injectable for deterministic tests — defaults to the real system clock. */
  clock?: IClock;
  /** Injectable for deterministic tests — defaults to `Math.random`. Must return a value in [0, 1). */
  random?: () => number;
}

/**
 * Pure retry-eligibility calculation — implements NotificationEngineDesign.md
 * §16's exact formula:
 *
 *   nextAttemptAt = now + min(maxDelay, baseDelay * 2^attemptCount) + jitter
 *   attemptCount + 1 >= maxAttempts  →  dead-letter, do not retry
 *
 * Per this phase's explicit scope ("Only calculate retry eligibility. Do NOT
 * execute retries."), this class has no side effects whatsoever — it takes
 * an attempt count in, returns a decision out. It does not read or write
 * anything, does not know about `NotificationJob`, and is not itself a
 * repository or engine method. `QueueEngine.scheduleRetry` is the only
 * caller, and it alone decides what to persist based on this decision.
 */
export class RetryScheduler {
  static calculate(attemptCount: number, options: RetrySchedulerOptions = {}): RetryDecision {
    const baseDelaySeconds = options.baseDelaySeconds ?? NOTIFICATION_ENGINE_DEFAULTS.retry.baseDelaySeconds;
    const maxDelaySeconds = options.maxDelaySeconds ?? NOTIFICATION_ENGINE_DEFAULTS.retry.maxDelaySeconds;
    const maxAttempts = options.maxAttempts ?? NOTIFICATION_ENGINE_DEFAULTS.retry.maxAttempts;
    const jitterRatio = options.jitterRatio ?? NOTIFICATION_ENGINE_DEFAULTS.retry.jitterRatio;
    const clock = options.clock ?? new SystemClock();
    const random = options.random ?? Math.random;

    const nextAttemptNumber = attemptCount + 1;
    if (nextAttemptNumber >= maxAttempts) {
      return { shouldRetry: false, nextAttemptAt: null, isExhausted: true };
    }

    const rawDelaySeconds = Math.min(maxDelaySeconds, baseDelaySeconds * 2 ** attemptCount);
    const jitterSpan = rawDelaySeconds * jitterRatio;
    const jitterOffset = (random() * 2 - 1) * jitterSpan; // +/- jitterSpan, per Design §16's "±20%"
    const delaySeconds = Math.max(0, rawDelaySeconds + jitterOffset);

    const nextAttemptAt = new Date(clock.now().getTime() + delaySeconds * 1000);
    return { shouldRetry: true, nextAttemptAt, isExhausted: false };
  }
}
