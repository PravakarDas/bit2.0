import { QueueError } from "../../errors";

/**
 * Thrown when `enqueue()` detects an existing `NotificationJob` row with the
 * same `idempotencyKey` (Design §17/§18 — duplicate jobs must never be
 * inserted). Extends the already-frozen `QueueError` (Phase 2's error
 * hierarchy) rather than modifying it — purely additive, per
 * CoreInfrastructureReport.md's Open/Closed reasoning.
 */
export class DuplicateJobError extends QueueError {
  constructor(
    readonly idempotencyKey: string,
    readonly existingJobId: string,
    options?: { cause?: unknown }
  ) {
    super(`A NotificationJob with idempotencyKey "${idempotencyKey}" already exists (id=${existingJobId}).`, existingJobId, options);
  }
}
