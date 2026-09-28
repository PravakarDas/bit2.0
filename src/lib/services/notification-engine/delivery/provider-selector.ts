import type { RegisteredProvider } from "./types";

/**
 * Pluggable "which one do we try next" policy — "Support Priority, Health,
 * Availability, Capability, Future load balancing... Only architecture. No
 * real balancing yet." Health/availability/capability filtering already
 * happened in `ProviderResolver`; a `SelectionStrategy` only decides the
 * *order* among the already-eligible candidates it's handed. Today there is
 * exactly one implementation (priority order, ascending); a future
 * round-robin or least-latency strategy plugs in here without touching
 * `ProviderSelector`, `ProviderResolver`, or `DeliveryStrategy`.
 */
export interface SelectionStrategy {
  /** `candidates` is pre-sorted by the resolver/registry; `excludeIds` holds providers already tried this delivery. Returns `null` once nothing eligible remains. */
  selectNext(candidates: RegisteredProvider[], excludeIds: ReadonlySet<string>): RegisteredProvider | null;
}

/** The only strategy this phase implements: take the highest-priority (lowest number) candidate not already tried. */
export class PriorityHealthSelectionStrategy implements SelectionStrategy {
  selectNext(candidates: RegisteredProvider[], excludeIds: ReadonlySet<string>): RegisteredProvider | null {
    return candidates.find((candidate) => !excludeIds.has(candidate.descriptor.id)) ?? null;
  }
}

export class ProviderSelector {
  constructor(private readonly strategy: SelectionStrategy = new PriorityHealthSelectionStrategy()) {}

  selectNext(candidates: RegisteredProvider[], excludeIds: ReadonlySet<string>): RegisteredProvider | null {
    return this.strategy.selectNext(candidates, excludeIds);
  }
}
