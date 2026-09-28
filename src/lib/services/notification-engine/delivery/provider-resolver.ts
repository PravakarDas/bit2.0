import type { NotificationChannel } from "../types/enums";
import type { ProviderRegistry } from "./provider-registry";
import type { ProviderHealthMonitor } from "./provider-health-monitor";
import type { RegisteredProvider } from "./types";
import type { RequiredProviderCapabilities } from "./value-objects/provider-capabilities";

/**
 * "Which providers even exist and are structurally eligible right now" —
 * distinct from `ProviderSelector` ("which ONE do we try next"). Filters
 * `ProviderRegistry.getByChannel()` down to providers that are: registered
 * active (`descriptor.isActive`, the operator on/off switch), healthy
 * enough to route to (`ProviderHealthMonitor.isUsable`), and capable of
 * what this specific delivery needs (`ProviderCapabilities.supports`).
 * Health and capability are independent axes — this resolver applies both
 * so `ProviderSelector` only ever sees genuinely usable candidates.
 */
export class ProviderResolver {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly healthMonitor: ProviderHealthMonitor
  ) {}

  resolve(channel: NotificationChannel, requiredCapabilities: RequiredProviderCapabilities = {}): RegisteredProvider[] {
    return this.registry
      .getByChannel(channel)
      .filter((entry) => entry.descriptor.isActive)
      .filter((entry) => this.healthMonitor.isUsable(entry.descriptor.id))
      .filter((entry) => entry.descriptor.capabilities.supports(requiredCapabilities));
  }
}
