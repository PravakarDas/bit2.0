import { prisma } from "@/lib/prisma";
import { BaseRepository } from "./base.repository";
import type { INotificationJobRepository } from "./interfaces";
import type {
  CreateNotificationJobInput,
  NotificationJobDTO,
  NotificationJobQueryCriteria,
  UpdateNotificationJobInput,
} from "../dto";
import { NOTIFICATION_ENGINE_DEFAULTS } from "../constants";

/**
 * Pure data access for `NotificationJob`. No claim/lease/retry-scheduling
 * logic lives here — see base.repository.ts and
 * interfaces/notification-job-repository.interface.ts for why.
 */
export class NotificationJobRepository extends BaseRepository implements INotificationJobRepository {
  protected readonly repositoryName = "NotificationJobRepository";

  async create(input: CreateNotificationJobInput): Promise<NotificationJobDTO> {
    return this.wrap("create", () =>
      prisma.notificationJob.create({
        data: {
          eventId: input.eventId,
          channel: input.channel,
          recipientUserId: input.recipientUserId,
          recipientAddress: input.recipientAddress,
          idempotencyKey: input.idempotencyKey,
          status: input.status ?? "QUEUED",
          maxAttempts: input.maxAttempts ?? NOTIFICATION_ENGINE_DEFAULTS.retry.maxAttempts,
          nextAttemptAt: input.nextAttemptAt ?? new Date(),
          documentId: input.documentId,
        },
      })
    );
  }

  async findById(id: string): Promise<NotificationJobDTO | null> {
    return this.wrap("findById", () => prisma.notificationJob.findUnique({ where: { id } }));
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<NotificationJobDTO | null> {
    return this.wrap("findByIdempotencyKey", () => prisma.notificationJob.findUnique({ where: { idempotencyKey } }));
  }

  async findMany(criteria: NotificationJobQueryCriteria = {}): Promise<NotificationJobDTO[]> {
    return this.wrap("findMany", () =>
      prisma.notificationJob.findMany({
        where: {
          status: criteria.status,
          channel: criteria.channel,
          eventId: criteria.eventId,
          recipientUserId: criteria.recipientUserId,
        },
        orderBy: { createdAt: "desc" },
        take: criteria.take,
        skip: criteria.skip,
      })
    );
  }

  async update(id: string, input: UpdateNotificationJobInput): Promise<NotificationJobDTO> {
    return this.wrap("update", () =>
      prisma.notificationJob.update({
        where: { id },
        data: input,
      })
    );
  }
}
