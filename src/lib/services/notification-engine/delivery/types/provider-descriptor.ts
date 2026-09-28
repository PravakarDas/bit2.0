import type { NotificationChannel } from "../../types/enums";
import type { NotificationProviderDTO } from "../../dto";
import { ProviderPriority } from "../value-objects/provider-priority";
import { ProviderCapabilities } from "../value-objects/provider-capabilities";

/**
 * Routing metadata for one registered provider — what `ProviderRegistry`
 * stores alongside the executable `DeliveryProvider`. Deliberately holds no
 * behavior of its own (no `deliver()`): "no provider-specific logic may
 * leak outside the framework" means even identity/routing data stays
 * separate from the callable, so a provider implementation never needs to
 * know its own priority or capabilities.
 */
export interface ProviderDescriptor {
  readonly id: string;
  readonly name: string;
  readonly channel: NotificationChannel;
  readonly priority: ProviderPriority;
  readonly capabilities: ProviderCapabilities;
  /** Mirrors `NotificationProvider.isActive` — an operator-controlled on/off switch, distinct from health-derived usability. */
  readonly isActive: boolean;
}

export interface ProviderDescriptorInput {
  id: string;
  name: string;
  channel: NotificationChannel;
  priority?: ProviderPriority;
  capabilities?: ProviderCapabilities;
  isActive?: boolean;
}

export function createProviderDescriptor(input: ProviderDescriptorInput): ProviderDescriptor {
  return {
    id: input.id,
    name: input.name,
    channel: input.channel,
    priority: input.priority ?? ProviderPriority.default(),
    capabilities: input.capabilities ?? ProviderCapabilities.none(),
    isActive: input.isActive ?? true,
  };
}

/**
 * Builds a descriptor from a persisted `NotificationProvider` row (Phase 2's
 * `INotificationProviderRepository`, unmodified — zero new repository
 * methods needed this phase either, matching Phase 5's precedent). The row
 * has no column for capabilities, so the caller supplies them — capability
 * flags are a code-level concept describing what a specific provider
 * *implementation* can do, not configuration data an admin edits.
 */
export function providerDescriptorFromDTO(
  dto: NotificationProviderDTO,
  capabilities: ProviderCapabilities = ProviderCapabilities.none()
): ProviderDescriptor {
  return createProviderDescriptor({
    id: dto.id,
    name: dto.name,
    channel: dto.channel,
    priority: ProviderPriority.of(dto.priority),
    capabilities,
    isActive: dto.isActive,
  });
}
