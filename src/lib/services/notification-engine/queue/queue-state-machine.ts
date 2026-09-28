import type { NotificationJobStatus } from "../types/enums";

/**
 * The one authoritative transition table for `NotificationJob.status`,
 * matching NotificationEngineDesign.md §5/§23 exactly, using the real
 * Prisma enum values (`RETRY_SCHEDULED`, `DEAD_LETTER` — NOT the informal
 * "RETRY_PENDING" label used in this phase's own prompt; see
 * QueueEngineReport.md's "Architecture Compliance" section for why).
 *
 * Two transitions here are this phase's own documented interpretation of a
 * capability the frozen design didn't enumerate as its own state (there is
 * no "CANCELLED" enum value) — both are called out explicitly rather than
 * silently assumed:
 *   - `QUEUED -> DEAD_LETTER` and `RETRY_SCHEDULED -> DEAD_LETTER` model an
 *     administrative `cancel()` using the existing terminal "will not be
 *     delivered" bucket, since adding a new enum value would be a schema
 *     change (redesign), which this phase must not do.
 *   - `PROCESSING -> DEAD_LETTER` models `markFailed()`'s cascade, per
 *     Design §16's "FAILED --> DEAD_LETTER: always (no retry for
 *     recipient-level failures)" — FAILED itself is not persisted as an
 *     independently-observed resting state in this implementation (nothing
 *     in the frozen design describes any behavior while a job sits in
 *     FAILED specifically), so the cascade is applied atomically rather
 *     than requiring two separate calls.
 */
const ALLOWED_TRANSITIONS: Record<NotificationJobStatus, readonly NotificationJobStatus[]> = {
  QUEUED: ["PROCESSING", "DEAD_LETTER"],
  PROCESSING: ["SENT", "RETRY_SCHEDULED", "DEAD_LETTER", "QUEUED"],
  RETRY_SCHEDULED: ["PROCESSING", "DEAD_LETTER"],
  SENT: ["COMPLETED"],
  FAILED: ["DEAD_LETTER"],
  DEAD_LETTER: ["QUEUED"],
  COMPLETED: [],
};

export class QueueStateMachine {
  static canTransition(from: NotificationJobStatus, to: NotificationJobStatus): boolean {
    return ALLOWED_TRANSITIONS[from].includes(to);
  }

  static allowedTransitionsFrom(from: NotificationJobStatus): readonly NotificationJobStatus[] {
    return ALLOWED_TRANSITIONS[from];
  }

  static isTerminal(status: NotificationJobStatus): boolean {
    return ALLOWED_TRANSITIONS[status].length === 0;
  }
}
