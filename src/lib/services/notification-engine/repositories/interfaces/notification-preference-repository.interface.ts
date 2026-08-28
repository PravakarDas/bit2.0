import type { NotificationPreferenceDTO, UpsertNotificationPreferenceInput } from "../../dto";
import type { NotificationChannel } from "../../types/enums";

/**
 * Data access for `NotificationPreference` (Phase 13). A missing row means
 * "no explicit preference recorded" — callers (see
 * `NotificationPreferenceService`/`NotificationService.raiseEvent`) are
 * responsible for treating that as enabled-by-default; this repository never
 * fabricates a default row.
 */
export interface INotificationPreferenceRepository {
  findOne(userId: string, notificationType: string, channel: NotificationChannel): Promise<NotificationPreferenceDTO | null>;
  findByUser(userId: string): Promise<NotificationPreferenceDTO[]>;
  /** Creates the row on first write, updates `isEnabled` on every subsequent one — one row per `(userId, notificationType, channel)`, per the model's `@@unique`. */
  upsert(input: UpsertNotificationPreferenceInput): Promise<NotificationPreferenceDTO>;
}
