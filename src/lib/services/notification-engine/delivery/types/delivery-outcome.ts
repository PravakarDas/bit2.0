import type { ProviderResult } from "./provider-result";

/**
 * The overall result of `DeliveryManager.deliver()` — distinct from a
 * single `ProviderResult`, since one delivery request can try several
 * providers (failover) before reaching a final outcome. `attempts` always
 * lists every `ProviderResult` tried, in order, for observability.
 *
 * `NO_PROVIDER_AVAILABLE` is intentionally its own kind rather than folded
 * into `TEMPORARY_FAILURE`: it means the framework never even attempted a
 * delivery (no eligible candidate existed), which a future retry-scheduling
 * integration should be able to tell apart from "we tried and every
 * provider failed."
 */
export type DeliveryOutcome =
  | { kind: "SUCCESS"; providerId: string; result: ProviderResult; attempts: ProviderResult[] }
  | { kind: "PERMANENT_FAILURE"; providerId: string; result: ProviderResult; attempts: ProviderResult[] }
  | { kind: "TEMPORARY_FAILURE"; attempts: ProviderResult[] }
  | { kind: "NO_PROVIDER_AVAILABLE"; attempts: [] };
