import type { CreateNotificationEventInput, NotificationEventDTO, NotificationEventQueryCriteria } from "../../dto";

/**
 * Data access for `NotificationEvent`. No fan-out, no recipient resolution,
 * no channel decisions — see NotificationEngineDesign.md §6 for where that
 * logic will live in a later phase.
 */
export interface INotificationRepository {
  create(input: CreateNotificationEventInput): Promise<NotificationEventDTO>;
  findById(id: string): Promise<NotificationEventDTO | null>;
  findByDedupeKey(dedupeKey: string): Promise<NotificationEventDTO | null>;
  findMany(criteria?: NotificationEventQueryCriteria): Promise<NotificationEventDTO[]>;
}
