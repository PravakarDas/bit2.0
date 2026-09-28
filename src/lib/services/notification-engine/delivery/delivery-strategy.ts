import type { RegisteredProvider, DeliveryOutcome } from "./types";
import type { ProviderResult } from "./types/provider-result";
import type { DeliveryAttemptContext } from "./delivery-attempt-context";
import type { ProviderContext } from "./provider";
import { ProviderSelector } from "./provider-selector";

/** Invokes one candidate and returns its normalized result — `DeliveryManager` supplies the real implementation (metrics + health recording + exception mapping); a strategy never talks to `ProviderMetricsCollector`/`ProviderHealthMonitor` directly. */
export type ProviderInvoker = (candidate: RegisteredProvider, context: ProviderContext) => Promise<ProviderResult>;

/**
 * "Support Retry, Timeout, Rate Limit..." at the request level — the outer
 * looping/termination policy across however many providers a single
 * delivery may try. Pluggable (item 12) so a future strategy (e.g. "try the
 * two highest-priority providers in parallel, take the first success") can
 * be swapped in without touching `ProviderSelector`, `ProviderResolver`, or
 * `DeliveryManager`. `FailoverDeliveryStrategy` is the only implementation
 * this phase needs — "Priority based" sequential failover, matching the
 * SMTP-A/SMTP-B/SMTP-C example in this phase's own prompt.
 */
export interface DeliveryStrategy {
  execute(
    candidates: RegisteredProvider[],
    attemptContext: DeliveryAttemptContext,
    invoke: ProviderInvoker,
    buildProviderContext: (candidate: RegisteredProvider, attemptNumber: number) => ProviderContext
  ): Promise<DeliveryOutcome>;
}

export class FailoverDeliveryStrategy implements DeliveryStrategy {
  constructor(private readonly selector: ProviderSelector = new ProviderSelector()) {}

  async execute(
    candidates: RegisteredProvider[],
    attemptContext: DeliveryAttemptContext,
    invoke: ProviderInvoker,
    buildProviderContext: (candidate: RegisteredProvider, attemptNumber: number) => ProviderContext
  ): Promise<DeliveryOutcome> {
    const triedIds = new Set<string>();

    while (true) {
      const next = this.selector.selectNext(candidates, triedIds);
      if (!next) break;
      triedIds.add(next.descriptor.id);

      const providerContext = buildProviderContext(next, attemptContext.nextAttemptNumber());
      const result = await invoke(next, providerContext);
      attemptContext.recordAttempt(result);

      if (result.status === "SUCCESS") {
        return { kind: "SUCCESS", providerId: next.descriptor.id, result, attempts: [...attemptContext.attemptsTried] };
      }
      if (result.status === "PERMANENT_FAILURE") {
        return { kind: "PERMANENT_FAILURE", providerId: next.descriptor.id, result, attempts: [...attemptContext.attemptsTried] };
      }
      // TEMPORARY_FAILURE: fall through and let the selector offer the next candidate.
    }

    return { kind: "TEMPORARY_FAILURE", attempts: [...attemptContext.attemptsTried] };
  }
}
