import { prisma } from "@/lib/prisma";
import { BaseRepository } from "./base.repository";
import type { INotificationPreferenceRepository } from "./interfaces";
import type { NotificationPreferenceDTO, UpsertNotificationPreferenceInput } from "../dto";
import type { NotificationChannel } from "../types/enums";

/** Pure data access for `NotificationPreference` — no default-resolution logic (that belongs to `NotificationPreferenceService`/`NotificationService`). */
export class NotificationPreferenceRepository extends BaseRepository implements INotificationPreferenceRepository {
  protected readonly repositoryName = "NotificationPreferenceRepository";

  async findOne(userId: string, notificationType: string, channel: NotificationChannel): Promise<NotificationPreferenceDTO | null> {
    return this.wrap("findOne", () =>
      prisma.notificationPreference.findUnique({
        where: { userId_notificationType_channel: { userId, notificationType, channel } },
      })
    );
  }

  async findByUser(userId: string): Promise<NotificationPreferenceDTO[]> {
    return this.wrap("findByUser", () =>
      prisma.notificationPreference.findMany({
        where: { userId },
        orderBy: [{ notificationType: "asc" }, { channel: "asc" }],
      })
    );
  }

  async upsert(input: UpsertNotificationPreferenceInput): Promise<NotificationPreferenceDTO> {
    return this.wrap("upsert", () =>
      prisma.notificationPreference.upsert({
        where: {
          userId_notificationType_channel: {
            userId: input.userId,
            notificationType: input.notificationType,
            channel: input.channel,
          },
        },
        update: { isEnabled: input.isEnabled },
        create: input,
      })
    );
  }

  async deleteOne(userId: string, notificationType: string, channel: NotificationChannel): Promise<void> {
    return this.wrap("deleteOne", async () => {
      // deleteMany (not delete-by-unique-key) so this is a no-op instead of
      // throwing P2025 when there is no explicit row to remove.
      await prisma.notificationPreference.deleteMany({ where: { userId, notificationType, channel } });
    });
  }
}
