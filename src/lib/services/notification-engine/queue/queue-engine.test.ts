import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { QueueEngine } from "./queue-engine";
import { DuplicateJobError, InvalidQueueTransitionError } from "./errors";
import type { IQueueRepository, PaginationParams } from "./queue-repository.interface";
import type { QueueSearchCriteria, QueueSearchResult, QueueStatistics } from "./queue-query.dto";
import type { CreateNotificationJobInput, NotificationJobDTO } from "../dto";
import { NotificationJobStatus } from "../types/enums";

const ALL_STATUSES = Object.values(NotificationJobStatus);

/**
 * In-memory fake of `IQueueRepository`, used ONLY by this test file. This is
 * a deliberate choice (see QueueEngineReport.md's "Testing" section): the
 * real `QueueRepository` talks to this project's live, shared Neon
 * database (see MigrationRecoveryReport.md) — a unit test must never write
 * to it. This fake reproduces the same compare-and-swap guard semantics as
 * the real repository (status + lock-owner checks raising
 * `InvalidQueueTransitionError` on mismatch) so that testing `QueueEngine`
 * against it is a faithful test of its actual orchestration logic, not a
 * trivial mock.
 */
class FakeQueueRepository implements IQueueRepository {
  readonly jobs = new Map<string, NotificationJobDTO>();
  lastClaimBatchSize: number | null = null;
  private idCounter = 0;

  async enqueue(input: CreateNotificationJobInput): Promise<NotificationJobDTO> {
    const existing = await this.findByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      throw new DuplicateJobError(input.idempotencyKey, existing.id);
    }
    const now = new Date();
    const job: NotificationJobDTO = {
      id: `job_${++this.idCounter}`,
      eventId: input.eventId,
      channel: input.channel,
      recipientUserId: input.recipientUserId ?? null,
      recipientAddress: input.recipientAddress,
      idempotencyKey: input.idempotencyKey,
      status: input.status ?? "QUEUED",
      attemptCount: 0,
      maxAttempts: input.maxAttempts ?? 5,
      nextAttemptAt: input.nextAttemptAt ?? now,
      lockedAt: null,
      lockedBy: null,
      documentId: input.documentId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  async findById(jobId: string): Promise<NotificationJobDTO | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<NotificationJobDTO | null> {
    return [...this.jobs.values()].find((j) => j.idempotencyKey === idempotencyKey) ?? null;
  }

  async claimBatch(workerId: string, batchSize: number, now: Date = new Date()): Promise<NotificationJobDTO[]> {
    this.lastClaimBatchSize = batchSize;
    const eligible = [...this.jobs.values()]
      .filter((j) => j.status === "QUEUED" || (j.status === "RETRY_SCHEDULED" && j.nextAttemptAt <= now))
      .sort((a, b) => a.nextAttemptAt.getTime() - b.nextAttemptAt.getTime())
      .slice(0, batchSize);

    for (const job of eligible) {
      job.status = "PROCESSING";
      job.lockedAt = now;
      job.lockedBy = workerId;
      job.updatedAt = now;
    }
    return eligible;
  }

  async claimNext(workerId: string, now: Date = new Date()): Promise<NotificationJobDTO | null> {
    const claimed = await this.claimBatch(workerId, 1, now);
    return claimed[0] ?? null;
  }

  private guardedTransition(
    jobId: string,
    expectedStatuses: readonly NotificationJobStatus[],
    lockedBy: string | undefined,
    patch: Partial<NotificationJobDTO>,
    attemptedTransitionTo: NotificationJobStatus
  ): NotificationJobDTO {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new InvalidQueueTransitionError(jobId, attemptedTransitionTo, "NOT_FOUND");
    }
    if (!expectedStatuses.includes(job.status)) {
      throw new InvalidQueueTransitionError(jobId, attemptedTransitionTo, "INVALID_CURRENT_STATE");
    }
    if (lockedBy !== undefined && job.lockedBy !== lockedBy) {
      throw new InvalidQueueTransitionError(jobId, attemptedTransitionTo, "LOCK_NOT_HELD");
    }
    Object.assign(job, patch, { updatedAt: new Date() });
    return job;
  }

  async release(jobId: string, workerId: string): Promise<NotificationJobDTO> {
    return this.guardedTransition(jobId, ["PROCESSING"], workerId, { status: "QUEUED", lockedAt: null, lockedBy: null }, "QUEUED");
  }

  async renewLease(jobId: string, workerId: string, now: Date = new Date()): Promise<NotificationJobDTO> {
    return this.guardedTransition(jobId, ["PROCESSING"], workerId, { lockedAt: now }, "PROCESSING");
  }

  async markSent(jobId: string, workerId: string): Promise<NotificationJobDTO> {
    return this.guardedTransition(jobId, ["PROCESSING"], workerId, { status: "SENT", lockedAt: null, lockedBy: null }, "SENT");
  }

  async markCompleted(jobId: string): Promise<NotificationJobDTO> {
    return this.guardedTransition(jobId, ["SENT"], undefined, { status: "COMPLETED" }, "COMPLETED");
  }

  async markDeadLetter(jobId: string, workerId: string): Promise<NotificationJobDTO> {
    return this.guardedTransition(
      jobId,
      ["PROCESSING"],
      workerId,
      { status: "DEAD_LETTER", lockedAt: null, lockedBy: null },
      "DEAD_LETTER"
    );
  }

  async scheduleRetry(
    jobId: string,
    workerId: string,
    input: { nextStatus: "RETRY_SCHEDULED" | "DEAD_LETTER"; nextAttemptAt: Date; attemptCount: number }
  ): Promise<NotificationJobDTO> {
    return this.guardedTransition(
      jobId,
      ["PROCESSING"],
      workerId,
      { status: input.nextStatus, nextAttemptAt: input.nextAttemptAt, attemptCount: input.attemptCount, lockedAt: null, lockedBy: null },
      input.nextStatus
    );
  }

  async cancel(jobId: string): Promise<NotificationJobDTO> {
    return this.guardedTransition(jobId, ["QUEUED", "RETRY_SCHEDULED"], undefined, { status: "DEAD_LETTER" }, "DEAD_LETTER");
  }

  async recoverExpiredLocks(leaseDurationMs: number, now: Date = new Date()): Promise<number> {
    const staleThreshold = new Date(now.getTime() - leaseDurationMs);
    let recoveredCount = 0;
    for (const job of this.jobs.values()) {
      if (job.status === "PROCESSING" && job.lockedAt && job.lockedAt < staleThreshold) {
        const newAttemptCount = job.attemptCount + 1;
        const isExhausted = newAttemptCount >= job.maxAttempts;
        job.attemptCount = newAttemptCount;
        job.status = isExhausted ? "DEAD_LETTER" : "QUEUED";
        job.lockedAt = null;
        job.lockedBy = null;
        recoveredCount++;
      }
    }
    return recoveredCount;
  }

  async findQueued(_pagination?: PaginationParams): Promise<NotificationJobDTO[]> {
    return [...this.jobs.values()].filter((j) => j.status === "QUEUED");
  }

  async findProcessing(_pagination?: PaginationParams): Promise<NotificationJobDTO[]> {
    return [...this.jobs.values()].filter((j) => j.status === "PROCESSING");
  }

  async findRetryCandidates(_pagination?: PaginationParams, now: Date = new Date()): Promise<NotificationJobDTO[]> {
    return [...this.jobs.values()].filter((j) => j.status === "RETRY_SCHEDULED" && j.nextAttemptAt <= now);
  }

  async search(_criteria: QueueSearchCriteria): Promise<QueueSearchResult> {
    const items = [...this.jobs.values()];
    return { items, total: items.length, take: 100, skip: 0 };
  }

  async countByStatuses(statuses: NotificationJobStatus[]): Promise<number> {
    return [...this.jobs.values()].filter((j) => statuses.includes(j.status)).length;
  }

  async getStatistics(): Promise<QueueStatistics> {
    const stats = ALL_STATUSES.reduce((acc, s) => {
      acc[s] = 0;
      return acc;
    }, {} as QueueStatistics);
    for (const job of this.jobs.values()) {
      stats[job.status]++;
    }
    return stats;
  }
}

function buildEngine() {
  const repo = new FakeQueueRepository();
  const engine = new QueueEngine(repo);
  return { repo, engine };
}

describe("QueueEngine.enqueue", () => {
  it("creates a new QUEUED job", async () => {
    const { engine } = buildEngine();
    const job = await engine.enqueue({
      eventId: "evt_1",
      dedupeKey: "LOAN_APPROVED:loan_1",
      channel: "EMAIL",
      recipientAddress: "jane@example.com",
      recipientUserId: "user_1",
    });
    assert.equal(job.status, "QUEUED");
    assert.equal(job.attemptCount, 0);
    assert.equal(job.idempotencyKey, "LOAN_APPROVED:loan_1:EMAIL:user_1");
  });

  it("is idempotent: enqueuing the same logical job twice returns the same row, never a duplicate", async () => {
    const { engine, repo } = buildEngine();
    const params = {
      eventId: "evt_1",
      dedupeKey: "LOAN_APPROVED:loan_1",
      channel: "EMAIL" as const,
      recipientAddress: "jane@example.com",
      recipientUserId: "user_1",
    };
    const first = await engine.enqueue(params);
    const second = await engine.enqueue(params);
    assert.equal(first.id, second.id);
    assert.equal(repo.jobs.size, 1);
  });
});

describe("QueueEngine claiming", () => {
  it("claimNext returns null when nothing is eligible", async () => {
    const { engine } = buildEngine();
    const job = await engine.claimNext("worker-1");
    assert.equal(job, null);
  });

  it("claimNext atomically locks a QUEUED job", async () => {
    const { engine } = buildEngine();
    const created = await engine.enqueue({
      eventId: "evt_1",
      dedupeKey: "LOAN_APPROVED:loan_1",
      channel: "EMAIL",
      recipientAddress: "jane@example.com",
    });
    const claimed = await engine.claimNext("worker-1");
    assert.equal(claimed?.id, created.id);
    assert.equal(claimed?.status, "PROCESSING");
    assert.equal(claimed?.lockedBy, "worker-1");
  });

  it("claimBatch clamps an absurd batch size to NOTIFICATION_ENGINE_DEFAULTS.queue.maxBatchSize", async () => {
    const { engine, repo } = buildEngine();
    await engine.claimBatch("worker-1", 999_999);
    assert.equal(repo.lastClaimBatchSize, 100);
  });

  it("claimBatch clamps a batch size below 1 up to 1", async () => {
    const { engine, repo } = buildEngine();
    await engine.claimBatch("worker-1", 0);
    assert.equal(repo.lastClaimBatchSize, 1);
  });
});

describe("QueueEngine lifecycle transitions", () => {
  async function enqueueAndClaim(engine: QueueEngine, workerId = "worker-1") {
    await engine.enqueue({
      eventId: "evt_1",
      dedupeKey: "LOAN_APPROVED:loan_1",
      channel: "EMAIL",
      recipientAddress: "jane@example.com",
    });
    return (await engine.claimNext(workerId))!;
  }

  it("release returns a claimed job to QUEUED", async () => {
    const { engine } = buildEngine();
    const claimed = await enqueueAndClaim(engine);
    const released = await engine.release(claimed.id, "worker-1");
    assert.equal(released.status, "QUEUED");
    assert.equal(released.lockedBy, null);
  });

  it("release throws InvalidQueueTransitionError with LOCK_NOT_HELD when called by the wrong worker", async () => {
    const { engine } = buildEngine();
    const claimed = await enqueueAndClaim(engine);
    await assert.rejects(
      () => engine.release(claimed.id, "worker-imposter"),
      (err: unknown) => err instanceof InvalidQueueTransitionError && err.reason === "LOCK_NOT_HELD"
    );
  });

  it("complete transitions PROCESSING -> SENT", async () => {
    const { engine } = buildEngine();
    const claimed = await enqueueAndClaim(engine);
    const completed = await engine.complete(claimed.id, "worker-1");
    assert.equal(completed.status, "SENT");
  });

  it("archive transitions SENT -> COMPLETED", async () => {
    const { engine } = buildEngine();
    const claimed = await enqueueAndClaim(engine);
    await engine.complete(claimed.id, "worker-1");
    const archived = await engine.archive(claimed.id);
    assert.equal(archived.status, "COMPLETED");
  });

  it("archive rejects a job that hasn't been sent yet (still QUEUED)", async () => {
    const { engine } = buildEngine();
    const created = await engine.enqueue({
      eventId: "evt_1",
      dedupeKey: "LOAN_APPROVED:loan_1",
      channel: "EMAIL",
      recipientAddress: "jane@example.com",
    });
    await assert.rejects(
      () => engine.archive(created.id),
      (err: unknown) => err instanceof InvalidQueueTransitionError && err.reason === "INVALID_CURRENT_STATE"
    );
  });

  it("markFailed transitions PROCESSING -> DEAD_LETTER (the unconditional FAILED cascade)", async () => {
    const { engine } = buildEngine();
    const claimed = await enqueueAndClaim(engine);
    const deadLettered = await engine.markFailed(claimed.id, "worker-1");
    assert.equal(deadLettered.status, "DEAD_LETTER");
  });

  it("cancel transitions a QUEUED job straight to DEAD_LETTER", async () => {
    const { engine } = buildEngine();
    const created = await engine.enqueue({
      eventId: "evt_1",
      dedupeKey: "LOAN_APPROVED:loan_1",
      channel: "EMAIL",
      recipientAddress: "jane@example.com",
    });
    const cancelled = await engine.cancel(created.id);
    assert.equal(cancelled.status, "DEAD_LETTER");
  });

  it("cancel rejects a job that is currently PROCESSING", async () => {
    const { engine } = buildEngine();
    const claimed = await enqueueAndClaim(engine);
    await assert.rejects(
      () => engine.cancel(claimed.id),
      (err: unknown) => err instanceof InvalidQueueTransitionError && err.reason === "INVALID_CURRENT_STATE"
    );
  });
});

describe("QueueEngine.scheduleRetry", () => {
  it("schedules RETRY_SCHEDULED with an incremented attemptCount when attempts remain", async () => {
    const { engine } = buildEngine();
    const created = await engine.enqueue({
      eventId: "evt_1",
      dedupeKey: "LOAN_APPROVED:loan_1",
      channel: "EMAIL",
      recipientAddress: "jane@example.com",
      maxAttempts: 5,
    });
    const claimed = (await engine.claimNext("worker-1"))!;
    assert.equal(claimed.id, created.id);

    const retried = await engine.scheduleRetry(claimed.id, "worker-1");
    assert.equal(retried.status, "RETRY_SCHEDULED");
    assert.equal(retried.attemptCount, 1);
    assert.ok(retried.nextAttemptAt.getTime() > Date.now());
  });

  it("dead-letters once attempts are exhausted, never scheduling a next attempt", async () => {
    const { engine, repo } = buildEngine();
    const created = await engine.enqueue({
      eventId: "evt_1",
      dedupeKey: "LOAN_APPROVED:loan_1",
      channel: "EMAIL",
      recipientAddress: "jane@example.com",
      maxAttempts: 1, // a single allowed attempt
    });
    const claimed = (await engine.claimNext("worker-1"))!;
    assert.equal(claimed.id, created.id);

    const result = await engine.scheduleRetry(claimed.id, "worker-1");
    assert.equal(result.status, "DEAD_LETTER");
    assert.equal(repo.jobs.get(created.id)?.attemptCount, 1);
  });

  it("throws InvalidQueueTransitionError NOT_FOUND for a nonexistent job", async () => {
    const { engine } = buildEngine();
    await assert.rejects(
      () => engine.scheduleRetry("nonexistent", "worker-1"),
      (err: unknown) => err instanceof InvalidQueueTransitionError && err.reason === "NOT_FOUND"
    );
  });
});

describe("QueueEngine.recoverExpiredLocks", () => {
  it("recovers a stale PROCESSING job back to QUEUED and increments attemptCount", async () => {
    const { engine, repo } = buildEngine();
    const created = await engine.enqueue({
      eventId: "evt_1",
      dedupeKey: "LOAN_APPROVED:loan_1",
      channel: "EMAIL",
      recipientAddress: "jane@example.com",
      maxAttempts: 5,
    });
    const staleLockTime = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
    await engine.claimNext("worker-1");
    repo.jobs.get(created.id)!.lockedAt = staleLockTime; // simulate a crash: lease is now stale

    const recoveredCount = await engine.recoverExpiredLocks(5 * 60 * 1000); // 5-minute lease
    assert.equal(recoveredCount, 1);
    const job = repo.jobs.get(created.id)!;
    assert.equal(job.status, "QUEUED");
    assert.equal(job.attemptCount, 1);
    assert.equal(job.lockedBy, null);
  });

  it("dead-letters a recovered job whose attempts are now exhausted", async () => {
    const { engine, repo } = buildEngine();
    const created = await engine.enqueue({
      eventId: "evt_1",
      dedupeKey: "LOAN_APPROVED:loan_1",
      channel: "EMAIL",
      recipientAddress: "jane@example.com",
      maxAttempts: 1,
    });
    await engine.claimNext("worker-1");
    repo.jobs.get(created.id)!.lockedAt = new Date(Date.now() - 10 * 60 * 1000);

    await engine.recoverExpiredLocks(5 * 60 * 1000);
    assert.equal(repo.jobs.get(created.id)!.status, "DEAD_LETTER");
  });

  it("does not touch a PROCESSING job whose lease has not expired", async () => {
    const { engine, repo } = buildEngine();
    const created = await engine.enqueue({
      eventId: "evt_1",
      dedupeKey: "LOAN_APPROVED:loan_1",
      channel: "EMAIL",
      recipientAddress: "jane@example.com",
    });
    await engine.claimNext("worker-1");

    const recoveredCount = await engine.recoverExpiredLocks(5 * 60 * 1000);
    assert.equal(recoveredCount, 0);
    assert.equal(repo.jobs.get(created.id)!.status, "PROCESSING");
  });
});

describe("QueueEngine metrics", () => {
  let engine: QueueEngine;

  beforeEach(async () => {
    ({ engine } = buildEngine());
    // 2 QUEUED, 1 PROCESSING, 1 DEAD_LETTER
    for (let i = 0; i < 2; i++) {
      await engine.enqueue({
        eventId: `evt_${i}`,
        dedupeKey: `KEY_${i}`,
        channel: "EMAIL",
        recipientAddress: `user${i}@example.com`,
      });
    }
    const toProcess = await engine.enqueue({
      eventId: "evt_processing",
      dedupeKey: "KEY_PROCESSING",
      channel: "EMAIL",
      recipientAddress: "processing@example.com",
    });
    await engine.claimNext("worker-1");
    void toProcess;

    const toCancel = await engine.enqueue({
      eventId: "evt_cancel",
      dedupeKey: "KEY_CANCEL",
      channel: "EMAIL",
      recipientAddress: "cancel@example.com",
    });
    await engine.cancel(toCancel.id);
  });

  it("countQueued counts only QUEUED jobs", async () => {
    assert.equal(await engine.countQueued(), 2);
  });

  it("countProcessing counts only PROCESSING jobs", async () => {
    assert.equal(await engine.countProcessing(), 1);
  });

  it("countFailures counts DEAD_LETTER jobs", async () => {
    assert.equal(await engine.countFailures(), 1);
  });

  it("countQueue counts every non-terminal job (QUEUED + PROCESSING + RETRY_SCHEDULED)", async () => {
    assert.equal(await engine.countQueue(), 3);
  });

  it("getStatistics returns a full breakdown including zero-count statuses", async () => {
    const stats = await engine.getStatistics();
    assert.equal(stats.QUEUED, 2);
    assert.equal(stats.PROCESSING, 1);
    assert.equal(stats.DEAD_LETTER, 1);
    assert.equal(stats.SENT, 0);
    assert.equal(stats.COMPLETED, 0);
    assert.equal(stats.RETRY_SCHEDULED, 0);
    assert.equal(stats.FAILED, 0);
  });
});
