import { QueueError } from "../../errors";
import type { NotificationJobStatus } from "../../types/enums";

/**
 * Thrown when a requested state transition is not allowed by
 * `QueueStateMachine`, OR when a guarded (compare-and-swap) update affected
 * zero rows — meaning the job's status/lock owner changed concurrently
 * between when the caller read it and when they tried to transition it.
 * This IS the optimistic-concurrency-conflict signal (item 18) — there is no
 * separate `version` column; the guard condition on `status`/`lockedBy` in
 * the UPDATE's WHERE clause is the concurrency control, and this error is
 * what surfaces its failure.
 */
export class InvalidQueueTransitionError extends QueueError {
  constructor(
    jobId: string,
    readonly attemptedTransitionTo: NotificationJobStatus,
    readonly reason: "NOT_FOUND" | "INVALID_CURRENT_STATE" | "LOCK_NOT_HELD",
    options?: { cause?: unknown }
  ) {
    super(
      `Cannot transition NotificationJob ${jobId} to ${attemptedTransitionTo}: ${reason}.`,
      jobId,
      options
    );
  }
}
