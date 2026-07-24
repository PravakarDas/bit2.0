import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BaseRepository } from "./base.repository";
import type { INotificationRepository } from "./interfaces";
import type { CreateNotificationEventInput, NotificationEventDTO, NotificationEventQueryCriteria } from "../dto";

/**
 * Pure data access for `NotificationEvent`. Contains no fan-out, no
 * recipient/channel resolution, no template selection — see
 * NotificationEngineDesign.md §6.
 */
export class NotificationRepository extends BaseRepository implements INotificationRepository {
  protected readonly repositoryName = "NotificationRepository";

  async create(input: CreateNotificationEventInput): Promise<NotificationEventDTO> {
    return this.wrap("create", () =>
      prisma.notificationEvent.create({
        data: {
          eventType: input.eventType,
          dedupeKey: input.dedupeKey,
          sourceDomain: input.sourceDomain,
          payload: input.payload === null ? Prisma.JsonNull : input.payload,
          triggeredByUserId: input.triggeredByUserId,
        },
      })
    );
  }

  async findById(id: string): Promise<NotificationEventDTO | null> {
    return this.wrap("findById", () => prisma.notificationEvent.findUnique({ where: { id } }));
  }

  async findByDedupeKey(dedupeKey: string): Promise<NotificationEventDTO | null> {
    return this.wrap("findByDedupeKey", () => prisma.notificationEvent.findUnique({ where: { dedupeKey } }));
  }

  async findMany(criteria: NotificationEventQueryCriteria = {}): Promise<NotificationEventDTO[]> {
    return this.wrap("findMany", () =>
      prisma.notificationEvent.findMany({
        where: {
          eventType: criteria.eventType,
          sourceDomain: criteria.sourceDomain,
          createdAt: {
            gte: criteria.createdAfter,
            lte: criteria.createdBefore,
          },
        },
        orderBy: { createdAt: "desc" },
        take: criteria.take,
        skip: criteria.skip,
      })
    );
  }
}
