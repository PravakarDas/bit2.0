import { NotificationError, NotificationErrorCode } from "./notification-error";

/**
 * Reserved for the future queue worker (claim/lease/crash-recovery/retry —
 * see NotificationEngineDesign.md §5, §8, §16, §19). Defined now so the
 * error hierarchy is complete; nothing in this phase throws it yet, since
 * no worker/queue-processing logic exists yet — this phase is data-access
 * only.
 */
export class QueueError extends NotificationError {
  readonly code: NotificationErrorCode = "QUEUE_ERROR";

  constructor(
    message: string,
    readonly jobId?: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
  }
}
