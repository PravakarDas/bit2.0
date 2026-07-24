import { prisma } from "@/lib/prisma";
import { BaseRepository } from "./base.repository";
import type { INotificationProviderRepository } from "./interfaces";
import type {
  CreateNotificationProviderInput,
  NotificationProviderDTO,
  UpdateNotificationProviderHealthInput,
} from "../dto";
import type { NotificationChannel } from "../types/enums";
import { NOTIFICATION_ENGINE_DEFAULTS } from "../constants";

/**
 * Pure data access for `NotificationProvider`. `findActiveByChannelOrderedByPriority`
 * is a plain sorted read — the failover/cooldown *decision* belongs to a later
 * phase (NotificationEngineDesign.md §10).
 */
export class NotificationProviderRepository extends BaseRepository implements INotificationProviderRepository {
  protected readonly repositoryName = "NotificationProviderRepository";

  async create(input: CreateNotificationProviderInput): Promise<NotificationProviderDTO> {
    return this.wrap("create", () =>
      prisma.notificationProvider.create({
        data: {
          channel: input.channel,
          name: input.name,
          configEncrypted: input.configEncrypted,
          priority: input.priority ?? NOTIFICATION_ENGINE_DEFAULTS.provider.defaultPriority,
          isActive: input.isActive ?? true,
        },
      })
    );
  }

  async findById(id: string): Promise<NotificationProviderDTO | null> {
    return this.wrap("findById", () => prisma.notificationProvider.findUnique({ where: { id } }));
  }

  async findActiveByChannelOrderedByPriority(channel: NotificationChannel): Promise<NotificationProviderDTO[]> {
    return this.wrap("findActiveByChannelOrderedByPriority", () =>
      prisma.notificationProvider.findMany({
        where: { channel, isActive: true },
        orderBy: { priority: "asc" },
      })
    );
  }

  async updateHealth(id: string, input: UpdateNotificationProviderHealthInput): Promise<NotificationProviderDTO> {
    return this.wrap("updateHealth", () =>
      prisma.notificationProvider.update({
        where: { id },
        data: input,
      })
    );
  }
}
