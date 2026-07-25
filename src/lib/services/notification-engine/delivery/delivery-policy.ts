import { ValidationError } from "../errors";

export interface RateLimitPolicy {
  readonly maxPerInterval: number;
  readonly intervalMs: number;
}

export interface DeliveryPolicyInput {
  maxRetries?: number;
  timeoutMs?: number;
  maxSizeBytes?: number | null;
  maxRecipients?: number | null;
  rateLimit?: RateLimitPolicy | null;
}

/**
 * "Support Retry, Timeout, Rate Limit, Maximum Size, Maximum Recipients...
 * No enforcement yet. Architecture only." This class is deliberately pure
 * data plus structural validation (all numbers non-negative/positive as
 * appropriate) — nothing in this module starts a timer, counts a rate-limit
 * window, or rejects an oversized payload. `DeliveryManager` accepts a
 * policy per call but does not read `timeoutMs`/`rateLimit`/`maxSizeBytes`/
 * `maxRecipients` to enforce anything yet; only `maxRetries` shapes
 * `FailoverDeliveryStrategy`'s loop bound indirectly via the candidate list
 * length, not via this field. Real enforcement (an actual timeout race, a
 * token-bucket limiter, a size check before send) is explicitly future
 * work — see DeliveryFrameworkReport.md "Known Limitations".
 */
export class DeliveryPolicy {
  private constructor(
    readonly maxRetries: number,
    readonly timeoutMs: number,
    readonly maxSizeBytes: number | null,
    readonly maxRecipients: number | null,
    readonly rateLimit: RateLimitPolicy | null
  ) {}

  static default(): DeliveryPolicy {
    return new DeliveryPolicy(3, 30_000, null, null, null);
  }

  static create(input: DeliveryPolicyInput): DeliveryPolicy {
    const maxRetries = input.maxRetries ?? 3;
    const timeoutMs = input.timeoutMs ?? 30_000;

    if (!Number.isInteger(maxRetries) || maxRetries < 0) {
      throw new ValidationError("maxRetries must be a non-negative integer", [
        { field: "maxRetries", message: "must be a non-negative integer" },
      ]);
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new ValidationError("timeoutMs must be a positive number", [
        { field: "timeoutMs", message: "must be a positive number" },
      ]);
    }
    if (input.maxSizeBytes != null && (!Number.isFinite(input.maxSizeBytes) || input.maxSizeBytes <= 0)) {
      throw new ValidationError("maxSizeBytes must be a positive number when provided", [
        { field: "maxSizeBytes", message: "must be a positive number" },
      ]);
    }
    if (input.maxRecipients != null && (!Number.isInteger(input.maxRecipients) || input.maxRecipients <= 0)) {
      throw new ValidationError("maxRecipients must be a positive integer when provided", [
        { field: "maxRecipients", message: "must be a positive integer" },
      ]);
    }

    return new DeliveryPolicy(maxRetries, timeoutMs, input.maxSizeBytes ?? null, input.maxRecipients ?? null, input.rateLimit ?? null);
  }
}
