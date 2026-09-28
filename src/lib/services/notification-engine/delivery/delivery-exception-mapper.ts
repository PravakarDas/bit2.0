import { NotificationError } from "../errors";
import { type ProviderResult, ProviderResults } from "./types/provider-result";

/**
 * Normalizes a *thrown* error into a `ProviderResult` (item 14) — only for
 * the unexpected-throw path. A provider that wants to report an expected,
 * confidently-permanent business failure (invalid recipient address, e.g.)
 * should return `ProviderResults.permanentFailure(...)` directly instead of
 * throwing; this mapper cannot know from a caught exception alone whether
 * the underlying problem is transient infrastructure trouble or a
 * permanent one, so every thrown error — including Phase 4's
 * `ProviderNotImplementedError` (a `ProviderError` subclass, thrown by every
 * `StubChannelAdapter` today) — is conservatively classified as
 * TEMPORARY_FAILURE/retryable. This mirrors `JobDispatcher`'s existing
 * precedent of treating a caught `ProviderError` as transient, not fatal.
 */
export class DeliveryExceptionMapper {
  static toProviderResult(error: unknown, providerId: string, latencyMs: number): ProviderResult {
    if (error instanceof NotificationError) {
      return ProviderResults.temporaryFailure(providerId, latencyMs, error.code, error.message);
    }
    const message = error instanceof Error ? error.message : String(error);
    return ProviderResults.temporaryFailure(providerId, latencyMs, "UNKNOWN_ERROR", message);
  }
}
