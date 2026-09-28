import { prisma } from "@/lib/prisma";
import { BaseRepository } from "./base.repository";
import type { INotificationHistoryRepository } from "./interfaces";
import type { CreateNotificationDeliveryAttemptInput, NotificationDeliveryAttemptDTO } from "../dto";

/** Pure data access for the immutable `NotificationDeliveryAttempt` log — append-only, by design. */
export class NotificationHistoryRepository extends BaseRepository implements INotificationHistoryRepository {
  protected readonly repositoryName = "NotificationHistoryRepository";

  async create(input: CreateNotificationDeliveryAttemptInput): Promise<NotificationDeliveryAttemptDTO> {
    return this.wrap("create", () =>
      prisma.notificationDeliveryAttempt.create({
        data: {
          jobId: input.jobId,
          providerId: input.providerId,
          attemptNumber: input.attemptNumber,
          outcome: input.outcome,
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
        },
      })
    );
  }

  async findById(id: string): Promise<NotificationDeliveryAttemptDTO | null> {
    return this.wrap("findById", () => prisma.notificationDeliveryAttempt.findUnique({ where: { id } }));
  }

  async findByJobId(jobId: string): Promise<NotificationDeliveryAttemptDTO[]> {
    return this.wrap("findByJobId", () =>
      prisma.notificationDeliveryAttempt.findMany({
        where: { jobId },
        orderBy: { attemptNumber: "asc" },
      })
    );
  }
}
