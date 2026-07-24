/**
 * Named defaults mirroring the column defaults already declared on
 * `NotificationSettings` in prisma/schema.prisma (see NotificationEngineDesign.md
 * §16, §25, §36, §40). Centralized here so factories/validators never hard-code
 * a magic number — if a default ever changes, it changes in exactly two places
 * (the schema's `@default(...)` and this file), not scattered across call sites.
 *
 * These are infrastructure-level fallback values, not business rules: nothing
 * here decides *when* to retry, *who* to notify, or *how* to fail over — that
 * decision logic belongs to a later phase (see NotificationEngineDesign.md §16
 * "Retry Algorithm", §10 "SMTP Failover Architecture").
 */
export const NOTIFICATION_ENGINE_DEFAULTS = Object.freeze({
  worker: Object.freeze({
    pollIntervalSeconds: 10,
    batchSize: 20,
  }),
  retry: Object.freeze({
    baseDelaySeconds: 30,
    maxDelaySeconds: 3600,
    maxAttempts: 5,
    jitterRatio: 0.2,
  }),
  retention: Object.freeze({
    completedRetentionDays: 90,
    deadLetterRetentionDays: 180,
  }),
  provider: Object.freeze({
    defaultPriority: 1,
    consecutiveFailureThreshold: 5,
  }),
  template: Object.freeze({
    initialVersion: 1,
  }),
  /**
   * Phase 3 addition (purely additive — no existing field changed): the
   * crash-recovery lease window and a sane upper bound on `claimBatch`'s
   * requested batch size, per NotificationEngineDesign.md §19/§25.
   */
  queue: Object.freeze({
    defaultLeaseDurationMs: 5 * 60 * 1000, // 5 minutes, per Design §19
    maxBatchSize: 100,
  }),
});

/**
 * Structural limits used only by validators in this module (string presence /
 * length checks). Not a business rule — just guards against obviously-invalid
 * input reaching a repository.
 */
export const NOTIFICATION_ENGINE_LIMITS = Object.freeze({
  minStringLength: 1,
  maxEventTypeLength: 100,
  maxDedupeKeyLength: 255,
  maxIdempotencyKeyLength: 300,
  maxRecipientAddressLength: 320, // matches the practical max length of an email address; channel-agnostic upper bound
  maxTemplateKeyLength: 100,
  maxProviderNameLength: 150,
  maxDocumentTypeLength: 100,
  maxSourceEntityIdLength: 100,
});
