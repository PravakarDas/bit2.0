import type { INotificationPreferenceRepository } from "../repositories/interfaces";
import type { NotificationChannel } from "../types/enums";
import { NotificationPreferenceValidator } from "../validators";
import { ValidationError } from "../errors";
import { MANAGEABLE_NOTIFICATION_TYPES, type ManageableNotificationType } from "./preference-catalog";

export interface NotificationPreferenceViewModel {
  notificationType: string;
  label: string;
  description: string;
  channel: NotificationChannel;
  /** Effective value applied by `NotificationService.raiseEvent` — defaults to `true` when no explicit row exists (Phase 13 default-behavior decision, see NotificationPreferencesReport.md). */
  isEnabled: boolean;
  /** `false` means this row is the catalog default, not something the user ever explicitly set. */
  isExplicit: boolean;
}

/**
 * Read/write access to a user's own notification preferences (Phase 13).
 * Pure presentation/management layer over `INotificationPreferenceRepository`
 * — same role `NotificationInboxService` plays over the inbox-state
 * repository: it never enqueues, sends, or touches `QueueEngine`/
 * `WorkerRuntime`. The actual enforcement of a preference happens inside
 * `NotificationService.raiseEvent`, independently, by reading the same
 * repository this class writes to.
 *
 * Scoped to `MANAGEABLE_NOTIFICATION_TYPES` — a user may only read/set
 * preferences for a `(notificationType, channel)` pair this project has
 * actually decided to expose (see preference-catalog.ts); this keeps the
 * self-service surface limited to real, deliverable notifications instead of
 * accepting an arbitrary string.
 */
export class NotificationPreferenceService {
  constructor(private readonly preferenceRepository: INotificationPreferenceRepository) {}

  /** Every manageable `(notificationType, channel)` pair for this user, merged with any explicit override — always the same length as `MANAGEABLE_NOTIFICATION_TYPES`' flattened channel list. */
  async listForUser(userId: string): Promise<NotificationPreferenceViewModel[]> {
    const explicitRows = await this.preferenceRepository.findByUser(userId);
    const explicitByKey = new Map(explicitRows.map((row) => [this.key(row.notificationType, row.channel), row]));

    const viewModels: NotificationPreferenceViewModel[] = [];
    for (const entry of MANAGEABLE_NOTIFICATION_TYPES) {
      for (const channel of entry.channels) {
        const explicit = explicitByKey.get(this.key(entry.notificationType, channel));
        viewModels.push({
          notificationType: entry.notificationType,
          label: entry.label,
          description: entry.description,
          channel,
          isEnabled: explicit ? explicit.isEnabled : true,
          isExplicit: explicit !== undefined,
        });
      }
    }
    return viewModels;
  }

  async setForUser(userId: string, notificationType: string, channel: NotificationChannel, isEnabled: boolean) {
    const entry = this.findManageableEntry(notificationType, channel);
    if (!entry) {
      throw new ValidationError("Invalid NotificationPreference input", [
        { field: "notificationType", message: `\"${notificationType}\" (${channel}) is not a user-manageable notification preference` },
      ]);
    }

    const input = { userId, notificationType, channel, isEnabled };
    NotificationPreferenceValidator.validate(input);
    return this.preferenceRepository.upsert(input);
  }

  private findManageableEntry(notificationType: string, channel: NotificationChannel): ManageableNotificationType | undefined {
    return MANAGEABLE_NOTIFICATION_TYPES.find(
      (entry) => entry.notificationType === notificationType && entry.channels.includes(channel)
    );
  }

  private key(notificationType: string, channel: NotificationChannel): string {
    return `${notificationType}:${channel}`;
  }
}
