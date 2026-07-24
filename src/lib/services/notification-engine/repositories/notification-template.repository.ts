import { prisma } from "@/lib/prisma";
import { BaseRepository } from "./base.repository";
import type { INotificationTemplateRepository } from "./interfaces";
import type { CreateNotificationTemplateInput, NotificationTemplateDTO, UpdateNotificationTemplateInput } from "../dto";
import type { NotificationChannel } from "../types/enums";
import { NOTIFICATION_ENGINE_DEFAULTS } from "../constants";

/** Pure data access for `NotificationTemplate` — no rendering, no placeholder substitution. */
export class NotificationTemplateRepository extends BaseRepository implements INotificationTemplateRepository {
  protected readonly repositoryName = "NotificationTemplateRepository";

  async create(input: CreateNotificationTemplateInput): Promise<NotificationTemplateDTO> {
    return this.wrap("create", () =>
      prisma.notificationTemplate.create({
        data: {
          key: input.key,
          channel: input.channel,
          subjectTemplate: input.subjectTemplate,
          bodyTemplateHtml: input.bodyTemplateHtml,
          bodyTemplateText: input.bodyTemplateText,
          version: input.version ?? NOTIFICATION_ENGINE_DEFAULTS.template.initialVersion,
          isActive: input.isActive ?? true,
        },
      })
    );
  }

  async findById(id: string): Promise<NotificationTemplateDTO | null> {
    return this.wrap("findById", () => prisma.notificationTemplate.findUnique({ where: { id } }));
  }

  async findActiveByKeyAndChannel(key: string, channel: NotificationChannel): Promise<NotificationTemplateDTO | null> {
    return this.wrap("findActiveByKeyAndChannel", () =>
      prisma.notificationTemplate.findFirst({
        where: { key, channel, isActive: true },
        orderBy: { version: "desc" },
      })
    );
  }

  async findMany(key?: string, channel?: NotificationChannel): Promise<NotificationTemplateDTO[]> {
    return this.wrap("findMany", () =>
      prisma.notificationTemplate.findMany({
        where: { key, channel },
        orderBy: [{ key: "asc" }, { channel: "asc" }, { version: "desc" }],
      })
    );
  }

  async update(id: string, input: UpdateNotificationTemplateInput): Promise<NotificationTemplateDTO> {
    return this.wrap("update", () =>
      prisma.notificationTemplate.update({
        where: { id },
        data: input,
      })
    );
  }
}
