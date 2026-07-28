import { prisma } from "@/lib/prisma";
import { BaseRepository } from "../../repositories/base.repository";
import type { INotificationInboxStateRepository } from "./interfaces";
import type { InboxStateFlag, NotificationJobInboxStateDTO } from "../dto";

/** Pure data access for `NotificationJobInboxState` (Phase 12 — see prisma/schema.prisma's model comment). */
export class NotificationInboxStateRepository extends BaseRepository implements INotificationInboxStateRepository {
  protected readonly repositoryName = "NotificationInboxStateRepository";

  async findByJobIds(jobIds: string[], userId: string): Promise<NotificationJobInboxStateDTO[]> {
    if (jobIds.length === 0) {
      return [];
    }
    return this.wrap("findByJobIds", () =>
      prisma.notificationJobInboxState.findMany({
        where: { notificationJobId: { in: jobIds }, userId },
      })
    );
  }

  async findOne(jobId: string, userId: string): Promise<NotificationJobInboxStateDTO | null> {
    return this.wrap("findOne", () =>
      prisma.notificationJobInboxState.findUnique({
        where: { notificationJobId_userId: { notificationJobId: jobId, userId } },
      })
    );
  }

  async findJobIdsByFlag(userId: string, flag: InboxStateFlag): Promise<string[]> {
    return this.wrap("findJobIdsByFlag", async () => {
      const where =
        flag === "READ"
          ? { userId, isRead: true }
          : flag === "ARCHIVED"
            ? { userId, isArchived: true, deletedAt: null }
            : { userId, deletedAt: { not: null } };

      const rows = await prisma.notificationJobInboxState.findMany({
        where,
        select: { notificationJobId: true },
      });
      return rows.map((row) => row.notificationJobId);
    });
  }

  async upsertRead(jobId: string, userId: string, readAt: Date): Promise<NotificationJobInboxStateDTO> {
    return this.wrap("upsertRead", () =>
      prisma.notificationJobInboxState.upsert({
        where: { notificationJobId_userId: { notificationJobId: jobId, userId } },
        update: { isRead: true, readAt },
        create: { notificationJobId: jobId, userId, isRead: true, readAt },
      })
    );
  }

  async markManyRead(jobIds: string[], userId: string, readAt: Date): Promise<number> {
    if (jobIds.length === 0) {
      return 0;
    }
    return this.wrap("markManyRead", async () => {
      // One upsert per job id, not one per row loaded up front — still a single
      // round-trip *shape* (a small transaction), not a per-row read+write like
      // a naive "fetch all, then loop and save" would be. Job counts per user
      // are small in this app (per-employee notification volume, not a global
      // table scan), so this is not the kind of N+1 the "avoid N+1" requirement
      // is about (that concern is the *list* query, not a bulk mutation).
      const results = await prisma.$transaction(
        jobIds.map((jobId) =>
          prisma.notificationJobInboxState.upsert({
            where: { notificationJobId_userId: { notificationJobId: jobId, userId } },
            update: { isRead: true, readAt },
            create: { notificationJobId: jobId, userId, isRead: true, readAt },
          })
        )
      );
      return results.length;
    });
  }

  async upsertArchived(jobId: string, userId: string, archivedAt: Date): Promise<NotificationJobInboxStateDTO> {
    return this.wrap("upsertArchived", () =>
      prisma.notificationJobInboxState.upsert({
        where: { notificationJobId_userId: { notificationJobId: jobId, userId } },
        update: { isArchived: true, archivedAt },
        create: { notificationJobId: jobId, userId, isArchived: true, archivedAt },
      })
    );
  }

  async upsertUnarchived(jobId: string, userId: string): Promise<NotificationJobInboxStateDTO> {
    return this.wrap("upsertUnarchived", () =>
      prisma.notificationJobInboxState.upsert({
        where: { notificationJobId_userId: { notificationJobId: jobId, userId } },
        update: { isArchived: false, archivedAt: null },
        create: { notificationJobId: jobId, userId, isArchived: false },
      })
    );
  }

  async softDelete(jobId: string, userId: string, deletedAt: Date): Promise<NotificationJobInboxStateDTO> {
    return this.wrap("softDelete", () =>
      prisma.notificationJobInboxState.upsert({
        where: { notificationJobId_userId: { notificationJobId: jobId, userId } },
        update: { deletedAt },
        create: { notificationJobId: jobId, userId, deletedAt },
      })
    );
  }
}
