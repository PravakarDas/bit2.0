import type { CreateNotificationDeliveryAttemptInput, NotificationDeliveryAttemptDTO } from "../../dto";

/**
 * Data access for `NotificationDeliveryAttempt` — the immutable per-attempt
 * log (NotificationEngineDesign.md §3, §10). Append-only: there is
 * intentionally no `update`/`delete` method, matching the table's own
 * immutable-log design.
 */
export interface INotificationHistoryRepository {
  create(input: CreateNotificationDeliveryAttemptInput): Promise<NotificationDeliveryAttemptDTO>;
  findById(id: string): Promise<NotificationDeliveryAttemptDTO | null>;
  findByJobId(jobId: string): Promise<NotificationDeliveryAttemptDTO[]>;
}
