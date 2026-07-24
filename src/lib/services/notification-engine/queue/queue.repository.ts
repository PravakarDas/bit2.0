import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { BaseRepository } from "../repositories/base.repository";
import { normalizePagination } from "../utils";
import { NOTIFICATION_ENGINE_DEFAULTS } from "../constants";
import type { CreateNotificationJobInput, NotificationJobDTO } from "../dto";
import { NotificationJobStatus } from "../types/enums";
import { DuplicateJobError, InvalidQueueTransitionError } from "./errors";
import { IdempotencyGuard } from "./idempotency-guard";
import type { IQueueRepository, PaginationParams } from "./queue-repository.interface";
import type { QueueSearchCriteria, QueueSearchResult, QueueStatistics } from "./queue-query.dto";

const ALL_STATUSES = Object.values(NotificationJobStatus);

/**
 * Concrete, PostgreSQL-row-locking implementation of `IQueueRepository`.
 * See queue-repository.interface.ts for what each method guarantees.
 *
 * Deliberately a SEPARATE class from Phase 2's `NotificationJobRepository`,
 * not an extension of it — that repository is documented (Phase 2) as
 * intentionally NOT exposing claim/lease semantics ("belongs to the queue
 * worker, a later phase"). This phase IS that later phase; rather than
 * retrofitting atomic-locking methods into a repository whose whole
 * documented purpose was plain CRUD, a dedicated repository keeps Single
 * Responsibility intact: `NotificationJobRepository` = generic reads/writes
 * for any future caller (e.g. an admin dashboard), `QueueRepository` = the
 * specific atomic mechanics a queue needs. Both operate on the same table;
 * that's fine — they serve different callers with different guarantees.
 *
 * Raw SQL is used in exactly one place (`claimBatch`) because `SELECT ...
 * FOR UPDATE SKIP LOCKED` has no equivalent in Prisma's query builder — see
 * QueueEngineReport.md's "Locking Strategy" section. Every other mutating
 * method uses Prisma's standard query builder with a compare-and-swap guard
 * (`updateMany` + a `WHERE` clause on the expected current state), which is
 * both simpler and consistent with this project's general preference for
 * the query builder over raw SQL.
 */
export class QueueRepository extends BaseRepository implements IQueueRepository {
  protected readonly repositoryName = "QueueRepository";

  async enqueue(input: CreateNotificationJobInput): Promise<NotificationJobDTO> {
    return this.wrap("enqueue", async () => {
      try {
        return await prisma.notificationJob.create({
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
        });
      } catch (error) {
        if (IdempotencyGuard.isIdempotencyKeyConflict(error)) {
          const existing = await prisma.notificationJob.findUnique({
            where: { idempotencyKey: input.idempotencyKey },
          });
          throw new DuplicateJobError(input.idempotencyKey, existing?.id ?? "unknown", { cause: error });
        }
        throw error;
      }
    });
  }

  async findById(jobId: string): Promise<NotificationJobDTO | null> {
    return this.wrap("findById", () => prisma.notificationJob.findUnique({ where: { id: jobId } }));
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<NotificationJobDTO | null> {
    return this.wrap("findByIdempotencyKey", () =>
      prisma.notificationJob.findUnique({ where: { idempotencyKey } })
    );
  }

  async claimBatch(workerId: string, batchSize: number, now: Date = new Date()): Promise<NotificationJobDTO[]> {
    return this.wrap("claimBatch", () =>
      prisma.$queryRaw<NotificationJobDTO[]>`
        WITH candidates AS (
          SELECT id FROM "NotificationJob"
          WHERE (status = 'QUEUED'::"NotificationJobStatus")
             OR (status = 'RETRY_SCHEDULED'::"NotificationJobStatus" AND "nextAttemptAt" <= ${now})
          ORDER BY "nextAttemptAt" ASC
          LIMIT ${batchSize}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "NotificationJob" AS job
        SET status = 'PROCESSING'::"NotificationJobStatus",
            "lockedAt" = ${now},
            "lockedBy" = ${workerId},
            "updatedAt" = ${now}
        FROM candidates
        WHERE job.id = candidates.id
        RETURNING job.*;
      `
    );
  }

  async claimNext(workerId: string, now: Date = new Date()): Promise<NotificationJobDTO | null> {
    const claimed = await this.claimBatch(workerId, 1, now);
    return claimed[0] ?? null;
  }

  async release(jobId: string, workerId: string): Promise<NotificationJobDTO> {
    return this.guardedTransition(
      jobId,
      "QUEUED",
      { status: "PROCESSING", lockedBy: workerId },
      { status: "QUEUED", lockedAt: null, lockedBy: null }
    );
  }

  async markSent(jobId: string, workerId: string): Promise<NotificationJobDTO> {
    return this.guardedTransition(
      jobId,
      "SENT",
      { status: "PROCESSING", lockedBy: workerId },
      { status: "SENT", lockedAt: null, lockedBy: null }
    );
  }

  async markCompleted(jobId: string): Promise<NotificationJobDTO> {
    return this.guardedTransition(jobId, "COMPLETED", { status: "SENT" }, { status: "COMPLETED" });
  }

  async markDeadLetter(jobId: string, workerId: string): Promise<NotificationJobDTO> {
    return this.guardedTransition(
      jobId,
      "DEAD_LETTER",
      { status: "PROCESSING", lockedBy: workerId },
      { status: "DEAD_LETTER", lockedAt: null, lockedBy: null }
    );
  }

  async scheduleRetry(
    jobId: string,
    workerId: string,
    input: { nextStatus: "RETRY_SCHEDULED" | "DEAD_LETTER"; nextAttemptAt: Date; attemptCount: number }
  ): Promise<NotificationJobDTO> {
    return this.guardedTransition(
      jobId,
      input.nextStatus,
      { status: "PROCESSING", lockedBy: workerId },
      {
        status: input.nextStatus,
        nextAttemptAt: input.nextAttemptAt,
        attemptCount: input.attemptCount,
        lockedAt: null,
        lockedBy: null,
      }
    );
  }

  async cancel(jobId: string): Promise<NotificationJobDTO> {
    return this.guardedTransition(
      jobId,
      "DEAD_LETTER",
      { status: ["QUEUED", "RETRY_SCHEDULED"] },
      { status: "DEAD_LETTER" }
    );
  }

  async recoverExpiredLocks(leaseDurationMs: number, now: Date = new Date()): Promise<number> {
    return this.wrap("recoverExpiredLocks", async () => {
      const staleThreshold = new Date(now.getTime() - leaseDurationMs);
      const staleJobs = await prisma.notificationJob.findMany({
        where: { status: "PROCESSING", lockedAt: { lt: staleThreshold } },
        select: { id: true, attemptCount: true, maxAttempts: true, lockedAt: true },
      });

      let recoveredCount = 0;
      for (const job of staleJobs) {
        const newAttemptCount = job.attemptCount + 1;
        const isExhausted = newAttemptCount >= job.maxAttempts;
        // Guard on the exact `lockedAt` we read, so a job a live worker just
        // finished (or re-claimed) between our SELECT and this UPDATE is
        // never clobbered — the same compare-and-swap discipline as every
        // other transition here.
        const result = await prisma.notificationJob.updateMany({
          where: { id: job.id, status: "PROCESSING", lockedAt: job.lockedAt },
          data: isExhausted
            ? { status: "DEAD_LETTER", attemptCount: newAttemptCount, lockedAt: null, lockedBy: null }
            : { status: "QUEUED", attemptCount: newAttemptCount, lockedAt: null, lockedBy: null },
        });
        recoveredCount += result.count;
      }
      return recoveredCount;
    });
  }

  async findQueued(pagination: PaginationParams = {}): Promise<NotificationJobDTO[]> {
    return this.wrap("findQueued", () => {
      const { take, skip } = normalizePagination(pagination.take, pagination.skip);
      return prisma.notificationJob.findMany({
        where: { status: "QUEUED" },
        orderBy: { nextAttemptAt: "asc" },
        take,
        skip,
      });
    });
  }

  async findProcessing(pagination: PaginationParams = {}): Promise<NotificationJobDTO[]> {
    return this.wrap("findProcessing", () => {
      const { take, skip } = normalizePagination(pagination.take, pagination.skip);
      return prisma.notificationJob.findMany({
        where: { status: "PROCESSING" },
        orderBy: { lockedAt: "asc" },
        take,
        skip,
      });
    });
  }

  async findRetryCandidates(pagination: PaginationParams = {}, now: Date = new Date()): Promise<NotificationJobDTO[]> {
    return this.wrap("findRetryCandidates", () => {
      const { take, skip } = normalizePagination(pagination.take, pagination.skip);
      return prisma.notificationJob.findMany({
        where: { status: "RETRY_SCHEDULED", nextAttemptAt: { lte: now } },
        orderBy: { nextAttemptAt: "asc" },
        take,
        skip,
      });
    });
  }

  async search(criteria: QueueSearchCriteria): Promise<QueueSearchResult> {
    return this.wrap("search", async () => {
      const { take, skip } = normalizePagination(criteria.take, criteria.skip);

      const where: Prisma.NotificationJobWhereInput = {
        status: Array.isArray(criteria.status) ? { in: criteria.status } : criteria.status,
        channel: criteria.channel,
        eventId: criteria.eventId,
        recipientUserId: criteria.recipientUserId,
        recipientAddress: criteria.recipientAddressContains
          ? { contains: criteria.recipientAddressContains, mode: "insensitive" }
          : undefined,
        createdAt:
          criteria.createdAfter || criteria.createdBefore
            ? { gte: criteria.createdAfter, lte: criteria.createdBefore }
            : undefined,
      };

      const [items, total] = await Promise.all([
        prisma.notificationJob.findMany({ where, orderBy: { createdAt: "desc" }, take, skip }),
        prisma.notificationJob.count({ where }),
      ]);

      return { items, total, take, skip };
    });
  }

  async countByStatuses(statuses: NotificationJobStatus[]): Promise<number> {
    return this.wrap("countByStatuses", () =>
      prisma.notificationJob.count({ where: { status: { in: statuses } } })
    );
  }

  async getStatistics(): Promise<QueueStatistics> {
    return this.wrap("getStatistics", async () => {
      const grouped = await prisma.notificationJob.groupBy({
        by: ["status"],
        _count: { _all: true },
      });

      const stats = ALL_STATUSES.reduce((acc, status) => {
        acc[status] = 0;
        return acc;
      }, {} as QueueStatistics);

      for (const row of grouped) {
        stats[row.status] = row._count._all;
      }
      return stats;
    });
  }

  /**
   * Shared compare-and-swap update for every single-row status transition.
   * `expected` narrows the current state the caller believes the job is in
   * (status, and lock owner where relevant); if zero rows match, a precise
   * reason is diagnosed with one follow-up read — "doesn't exist," "wrong
   * status" (someone/something already transitioned it), or "wrong lock
   * owner" (a different worker holds it, or it isn't locked at all) — never
   * a silent no-op. This diagnostic read happens only on the failure path;
   * the common (success) path is exactly one round trip for the update plus
   * one to fetch the resulting row for the return value.
   */
  private async guardedTransition(
    jobId: string,
    attemptedTransitionTo: NotificationJobStatus,
    expected: { status: NotificationJobStatus | NotificationJobStatus[]; lockedBy?: string },
    data: Prisma.NotificationJobUpdateInput
  ): Promise<NotificationJobDTO> {
    return this.wrap("guardedTransition", async () => {
      const expectedStatuses = Array.isArray(expected.status) ? expected.status : [expected.status];

      const result = await prisma.notificationJob.updateMany({
        where: {
          id: jobId,
          status: { in: expectedStatuses },
          ...(expected.lockedBy !== undefined ? { lockedBy: expected.lockedBy } : {}),
        },
        data,
      });

      if (result.count === 0) {
        const existing = await prisma.notificationJob.findUnique({ where: { id: jobId } });
        if (!existing) {
          throw new InvalidQueueTransitionError(jobId, attemptedTransitionTo, "NOT_FOUND");
        }
        if (!expectedStatuses.includes(existing.status)) {
          throw new InvalidQueueTransitionError(jobId, attemptedTransitionTo, "INVALID_CURRENT_STATE");
        }
        throw new InvalidQueueTransitionError(jobId, attemptedTransitionTo, "LOCK_NOT_HELD");
      }

      const updated = await prisma.notificationJob.findUnique({ where: { id: jobId } });
      if (!updated) {
        throw new InvalidQueueTransitionError(jobId, attemptedTransitionTo, "NOT_FOUND");
      }
      return updated;
    });
  }
}
