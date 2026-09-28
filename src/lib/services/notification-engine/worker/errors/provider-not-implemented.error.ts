import { ProviderError } from "../../errors";
import type { NotificationChannel } from "../../types/enums";

/**
 * Thrown by every stub channel adapter this phase registers (see
 * ../channel-adapters/). Extends Phase 2's already-frozen `ProviderError`
 * additively — same disclosed-extension pattern Phase 3 used for
 * `DuplicateJobError`/`InvalidQueueTransitionError`. Distinct from a bare
 * `ProviderError` so `JobDispatcher` can specifically recognize "no real
 * provider exists yet" (route to retry — see job-dispatcher.ts) versus some
 * other, genuinely unexpected provider failure a future real adapter might
 * throw.
 */
export class ProviderNotImplementedError extends ProviderError {
  constructor(readonly channel: NotificationChannel, options?: { cause?: unknown }) {
    super(`No real provider is implemented for channel "${channel}" yet — SMTP/delivery is a later phase.`, undefined, options);
  }
}
