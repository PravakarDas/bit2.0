import { ProviderError } from "../../errors";
import type { NotificationChannel } from "../../types/enums";

/**
 * Extends Phase 2's frozen `ProviderError` additively — the same disclosed-
 * extension pattern as `ProviderNotImplementedError` (Phase 4). Reserved for
 * a future caller that wants to `throw` rather than branch on
 * `DeliveryOutcome.kind === "NO_PROVIDER_AVAILABLE"`; `DeliveryManager`
 * itself never throws this — it returns the outcome so callers aren't
 * forced into try/catch for an entirely expected "nothing is registered
 * yet" condition. Defined now so the error hierarchy already has a home for
 * it once a future phase needs to throw.
 */
export class ProviderUnavailableError extends ProviderError {
  constructor(readonly channel: NotificationChannel, options?: { cause?: unknown }) {
    super(`No eligible provider is available for channel "${channel}".`, undefined, options);
  }
}
