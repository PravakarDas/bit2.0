/**
 * Outcome of a single provider's delivery attempt. Deliberately distinct
 * from Phase 2's `ChannelDeliveryOutcome` (factories/channel-adapter.interface.ts,
 * frozen): that type only distinguishes SUCCESS/FAILURE (backed directly by
 * the `AttemptOutcome` DB enum) and is consumed by `JobDispatcher`.
 * `ProviderResult` is the richer, framework-internal shape `DeliveryManager`
 * needs to decide "try the next provider" vs "stop, this recipient/content
 * combination will never succeed" — a distinction `AttemptOutcome` has no
 * room for. A future integration phase can fold one into the other; see
 * DeliveryFrameworkReport.md "Known Limitations".
 */
export const PROVIDER_RESULT_STATUSES = ["SUCCESS", "TEMPORARY_FAILURE", "PERMANENT_FAILURE"] as const;

export type ProviderResultStatus = (typeof PROVIDER_RESULT_STATUSES)[number];

export interface ProviderResult {
  readonly status: ProviderResultStatus;
  readonly providerId: string;
  readonly latencyMs: number;
  readonly retryable: boolean;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

/**
 * A provider implementation is expected to build its `ProviderResult` via
 * these factories rather than hand-assembling the object, so `retryable`
 * always agrees with `status` (TEMPORARY_FAILURE is always retryable,
 * PERMANENT_FAILURE never is — encoding that invariant in one place instead
 * of trusting every future provider author to get it right).
 */
export const ProviderResults = {
  success(providerId: string, latencyMs: number): ProviderResult {
    return { status: "SUCCESS", providerId, latencyMs, retryable: false };
  },
  temporaryFailure(providerId: string, latencyMs: number, errorCode?: string, errorMessage?: string): ProviderResult {
    return { status: "TEMPORARY_FAILURE", providerId, latencyMs, retryable: true, errorCode, errorMessage };
  },
  permanentFailure(providerId: string, latencyMs: number, errorCode?: string, errorMessage?: string): ProviderResult {
    return { status: "PERMANENT_FAILURE", providerId, latencyMs, retryable: false, errorCode, errorMessage };
  },
};
