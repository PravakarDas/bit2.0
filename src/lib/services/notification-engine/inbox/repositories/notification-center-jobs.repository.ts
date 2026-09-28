import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { BaseRepository } from "../../repositories/base.repository";
import type { INotificationCenterJobsRepository, JobWithEventRow, JobsSearchCriteria } from "./interfaces";
import type { AdminDeliveryAttemptView } from "../dto";

/**
 * Read/query access for the Notification Center's list + detail views —
 * spans `NotificationJob` + `NotificationEvent` + `NotificationDeliveryAttempt`
 * (all Phase 1/2, unmodified) via Prisma's `include`, never a per-row extra
 * query — see this interface's own doc comment for why this is a separate
 * class from Phase 2's `NotificationJobRepository`.
 */
export class NotificationCenterJobsRepository extends BaseRepository implements INotificationCenterJobsRepository {
  protected readonly repositoryName = "NotificationCenterJobsRepository";

  async search(criteria: JobsSearchCriteria): Promise<{ items: JobWithEventRow[]; total: number }> {
    return this.wrap("search", async () => {
      const idFilter = this.buildIdFilter(criteria.includeJobIds, criteria.excludeJobIds);

      const where: Prisma.NotificationJobWhereInput = {
        recipientUserId: criteria.recipientUserId,
        channel: criteria.channel,
        status: criteria.status,
        createdAt:
          criteria.createdAfter || criteria.createdBefore
            ? { gte: criteria.createdAfter, lte: criteria.createdBefore }
            : undefined,
        ...(idFilter ? { id: idFilter } : {}),
      };

      const [rows, total] = await Promise.all([
        prisma.notificationJob.findMany({
          where,
          include: { event: true, recipient: { select: { firstName: true, lastName: true, email: true } } },
          orderBy: { createdAt: "desc" },
          take: criteria.take,
          skip: criteria.skip,
        }),
        prisma.notificationJob.count({ where }),
      ]);

      return {
        items: rows.map(({ event, recipient, ...job }) => ({ job, event, recipientName: this.formatRecipientName(recipient) })),
        total,
      };
    });
  }

  async findByIdWithEvent(jobId: string): Promise<JobWithEventRow | null> {
    return this.wrap("findByIdWithEvent", async () => {
      const row = await prisma.notificationJob.findUnique({
        where: { id: jobId },
        include: { event: true, recipient: { select: { firstName: true, lastName: true, email: true } } },
      });
      if (!row) {
        return null;
      }
      const { event, recipient, ...job } = row;
      return { job, event, recipientName: this.formatRecipientName(recipient) };
    });
  }

  private formatRecipientName(recipient: { firstName: string | null; lastName: string | null; email: string } | null): string | null {
    if (!recipient) {
      return null;
    }
    const name = `${recipient.firstName ?? ""} ${recipient.lastName ?? ""}`.trim();
    return name || recipient.email;
  }

  async findAllJobIds(recipientUserId: string): Promise<string[]> {
    return this.wrap("findAllJobIds", async () => {
      const rows = await prisma.notificationJob.findMany({
        where: { recipientUserId },
        select: { id: true },
      });
      return rows.map((row) => row.id);
    });
  }

  async findDeliveryAttemptsWithProvider(jobId: string): Promise<AdminDeliveryAttemptView[]> {
    return this.wrap("findDeliveryAttemptsWithProvider", async () => {
      const attempts = await prisma.notificationDeliveryAttempt.findMany({
        where: { jobId },
        include: { provider: true },
        orderBy: { attemptNumber: "asc" },
      });

      return attempts.map((attempt) => ({
        attemptNumber: attempt.attemptNumber,
        outcome: attempt.outcome,
        errorCode: attempt.errorCode,
        errorMessage: attempt.errorMessage,
        attemptedAt: attempt.attemptedAt,
        providerName: attempt.provider?.name ?? null,
      }));
    });
  }

  async findSearchMatchJobIds(term: string, recipientUserId?: string): Promise<string[]> {
    return this.wrap("findSearchMatchJobIds", async () => {
      const trimmed = term.trim();
      if (!trimmed) {
        return [];
      }

      // Title proxy: eventType, benefits from NotificationEvent's existing @@index([eventType]).
      const matchingEvents = await prisma.notificationEvent.findMany({
        where: { eventType: { contains: trimmed, mode: "insensitive" } },
        select: { id: true },
      });
      const eventIds = matchingEvents.map((event) => event.id);
      const jobsByTitle = eventIds.length
        ? await prisma.notificationJob.findMany({
            where: { eventId: { in: eventIds }, ...(recipientUserId ? { recipientUserId } : {}) },
            select: { id: true },
          })
        : [];

      // Body proxy: the event's JSON payload cast to text. Not indexed — Prisma's Json filters
      // don't support free-text `contains` across an unstructured blob, and adding a GIN index
      // would mean altering NotificationEvent, out of scope this phase (see
      // NotificationCenterReport.md's "Known Limitations"). Acceptable at this app's data scale.
      const byPayload = await prisma.$queryRaw<{ id: string }[]>`
        SELECT j.id FROM "NotificationJob" j
        JOIN "NotificationEvent" e ON j."eventId" = e.id
        WHERE e.payload::text ILIKE ${`%${trimmed}%`}
        ${recipientUserId ? Prisma.sql`AND j."recipientUserId" = ${recipientUserId}` : Prisma.empty}
      `;

      return [...new Set([...jobsByTitle.map((job) => job.id), ...byPayload.map((row) => row.id)])];
    });
  }

  private buildIdFilter(
    includeIds: string[] | undefined,
    excludeIds: string[] | undefined
  ): Prisma.StringFilter | undefined {
    if (!includeIds && (!excludeIds || excludeIds.length === 0)) {
      return undefined;
    }
    return {
      ...(includeIds ? { in: includeIds } : {}),
      ...(excludeIds && excludeIds.length > 0 ? { notIn: excludeIds } : {}),
    };
  }
}
