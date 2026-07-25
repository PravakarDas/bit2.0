import type { NotificationJobDTO } from "../dto";
import type { RenderedNotificationContent } from "../factories";
import type { ProviderResult } from "./types/provider-result";
import type { DeliveryPolicy } from "./delivery-policy";

export interface DeliveryAttemptContextInput {
  job: NotificationJobDTO;
  content: RenderedNotificationContent;
  policy: DeliveryPolicy;
  correlationId: string;
  startedAt: Date;
}

/**
 * Per-delivery-request bookkeeping (item 13) — one instance per
 * `DeliveryManager.deliver()` call, threaded through `DeliveryStrategy`
 * across however many providers get tried for that single request. Distinct
 * from `ProviderContext` (per-*provider*-attempt) and from Phase 4's
 * `ExecutionContext` (per-*worker-job*, one level up, with its own
 * cancellation signal) — this class tracks the failover attempt history for
 * one delivery, nothing about worker cancellation or job-claim state.
 */
export class DeliveryAttemptContext {
  readonly job: NotificationJobDTO;
  readonly content: RenderedNotificationContent;
  readonly policy: DeliveryPolicy;
  readonly correlationId: string;
  readonly startedAt: Date;
  private readonly attempts: ProviderResult[] = [];

  constructor(input: DeliveryAttemptContextInput) {
    this.job = input.job;
    this.content = input.content;
    this.policy = input.policy;
    this.correlationId = input.correlationId;
    this.startedAt = input.startedAt;
  }

  get attemptsTried(): readonly ProviderResult[] {
    return this.attempts;
  }

  /** 1-based — the attempt number to hand to the next `ProviderContext`. */
  nextAttemptNumber(): number {
    return this.attempts.length + 1;
  }

  recordAttempt(result: ProviderResult): void {
    this.attempts.push(result);
  }

  elapsedMs(now: Date): number {
    return now.getTime() - this.startedAt.getTime();
  }
}
