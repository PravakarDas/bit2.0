export interface ProviderMetricsSnapshot {
  readonly requests: number;
  readonly success: number;
  readonly failure: number;
  readonly retry: number;
  readonly averageLatencyMs: number;
}

interface MutableProviderCounters {
  requests: number;
  success: number;
  failure: number;
  retry: number;
  totalLatencyMs: number;
  latencySamples: number;
}

/**
 * Per-provider counters (item 10): Requests, Success, Failure, Retry,
 * Latency — the exact five this phase asks for. In-memory only, same
 * precedent as `WorkerMetricsCollector` (Phase 4) — no new Prisma model.
 */
export class ProviderMetricsCollector {
  private readonly counters = new Map<string, MutableProviderCounters>();

  private counterFor(providerId: string): MutableProviderCounters {
    let counter = this.counters.get(providerId);
    if (!counter) {
      counter = { requests: 0, success: 0, failure: 0, retry: 0, totalLatencyMs: 0, latencySamples: 0 };
      this.counters.set(providerId, counter);
    }
    return counter;
  }

  recordRequest(providerId: string): void {
    this.counterFor(providerId).requests += 1;
  }

  recordRetry(providerId: string): void {
    this.counterFor(providerId).retry += 1;
  }

  recordSuccess(providerId: string, latencyMs: number): void {
    const counter = this.counterFor(providerId);
    counter.success += 1;
    counter.totalLatencyMs += latencyMs;
    counter.latencySamples += 1;
  }

  recordFailure(providerId: string, latencyMs: number): void {
    const counter = this.counterFor(providerId);
    counter.failure += 1;
    counter.totalLatencyMs += latencyMs;
    counter.latencySamples += 1;
  }

  snapshot(providerId: string): ProviderMetricsSnapshot {
    const counter = this.counters.get(providerId);
    if (!counter) {
      return { requests: 0, success: 0, failure: 0, retry: 0, averageLatencyMs: 0 };
    }
    return {
      requests: counter.requests,
      success: counter.success,
      failure: counter.failure,
      retry: counter.retry,
      averageLatencyMs: counter.latencySamples === 0 ? 0 : counter.totalLatencyMs / counter.latencySamples,
    };
  }

  snapshotAll(): ReadonlyMap<string, ProviderMetricsSnapshot> {
    const result = new Map<string, ProviderMetricsSnapshot>();
    for (const providerId of this.counters.keys()) {
      result.set(providerId, this.snapshot(providerId));
    }
    return result;
  }
}
