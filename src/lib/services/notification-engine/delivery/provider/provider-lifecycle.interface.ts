import type { ProviderHealthState } from "../types/provider-health-state";

export interface ConfigValidationResult {
  readonly valid: boolean;
  readonly issues: string[];
}

/**
 * Optional lifecycle hooks a `DeliveryProvider` implementation MAY provide.
 * Every method is optional: a trivial or stub provider (like this phase's
 * test fakes) implements none of them, while a real SMTP/SMS provider in a
 * future phase can hook connection-pool setup (`initialize`), graceful
 * teardown (`shutdown`), an active health probe (`healthCheck` — separate
 * from `ProviderHealthMonitor`'s passive success/failure tracking), and
 * startup credential/config sanity checks (`validateConfiguration`).
 *
 * Nothing in this phase calls these hooks automatically on application
 * boot — `ProviderRegistry.initializeAll()`/`shutdownAll()` exist so a
 * caller (a future phase's own bootstrap code) can invoke them explicitly.
 * See the STOP conditions: no worker startup, no instrumentation.ts wiring.
 */
export interface ProviderLifecycle {
  initialize?(): Promise<void>;
  shutdown?(): Promise<void>;
  healthCheck?(): Promise<ProviderHealthState>;
  validateConfiguration?(): Promise<ConfigValidationResult>;
}
