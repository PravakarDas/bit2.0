import type { NotificationChannel } from "../../types/enums";
import type { ProviderCapabilities } from "../value-objects/provider-capabilities";

export interface ProviderContextInput {
  providerId: string;
  providerName: string;
  channel: NotificationChannel;
  capabilities: ProviderCapabilities;
  attemptNumber: number;
  correlationId: string;
}

/**
 * Passed into `DeliveryProvider.deliver(job, content, context)` for every
 * attempt — everything the provider needs about *this specific try* without
 * reaching back into `ProviderRegistry`/`ProviderResolver`. Immutable value
 * object, one instance per attempt (a failover across 3 providers creates 3
 * of these, one per candidate, all sharing the same `correlationId`).
 */
export class ProviderContext {
  readonly providerId: string;
  readonly providerName: string;
  readonly channel: NotificationChannel;
  readonly capabilities: ProviderCapabilities;
  readonly attemptNumber: number;
  readonly correlationId: string;

  constructor(input: ProviderContextInput) {
    this.providerId = input.providerId;
    this.providerName = input.providerName;
    this.channel = input.channel;
    this.capabilities = input.capabilities;
    this.attemptNumber = input.attemptNumber;
    this.correlationId = input.correlationId;
  }
}
