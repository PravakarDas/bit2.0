import type { RequiredProviderCapabilities } from "../value-objects/provider-capabilities";
import type { DeliveryPolicy } from "../delivery-policy";

/** Optional per-call overrides for `DeliveryManager.deliver()`. Everything is optional — the manager falls back to sane defaults for all three. */
export interface DeliverOptions {
  requiredCapabilities?: RequiredProviderCapabilities;
  policy?: DeliveryPolicy;
  correlationId?: string;
}
