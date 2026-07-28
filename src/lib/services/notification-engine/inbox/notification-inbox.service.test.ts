import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { NotificationEventDTO, NotificationJobDTO, UpdateNotificationJobInput } from "../dto";
import type { INotificationJobRepository } from "../repositories/interfaces";
import type { ITemplateEngine } from "../template/template-engine.interface";
import type { RenderParams, PreviewParams } from "../template/render-params";
import type { CompiledTemplate, TemplateSource, TemplateValidationResult } from "../template/types";
import type { RegisterTemplateInput } from "../template/register-template-input";
import type { TemplateValidationOptions } from "../template/template-validator";
import type { NotificationTemplateDTO } from "../dto";
import type { NotificationChannel } from "../types/enums";
import type { IQueueEngine } from "../queue";
import type { RenderedNotificationContent } from "../factories";
import type { QueueStatistics } from "../queue/queue-query.dto";
import { NotificationInboxService } from "./notification-inbox.service";
import type { INotificationCenterJobsRepository, INotificationInboxStateRepository, JobWithEventRow, JobsSearchCriteria } from "./repositories/interfaces";
import type { InboxStateFlag, NotificationJobInboxStateDTO } from "./dto";

// ---------------------------------------------------------------------------
// Shared in-memory job/event store — used by both fake repositories below so
// a mutation via one (e.g. `jobRepository.update` during requeue) is
// immediately visible to the other (`jobsRepository.search`).
// ---------------------------------------------------------------------------
class FakeStore {
  rows = new Map<string, { job: NotificationJobDTO; event: NotificationEventDTO }>();
}

function fakeEvent(overrides: Partial<NotificationEventDTO> = {}): NotificationEventDTO {
  const now = new Date();
  return {
    id: "evt_1",
    eventType: "LOAN_APPROVED",
    dedupeKey: "LOAN_APPROVED:1",
    payload: { employee: { name: "Jane Doe" } },
    sourceDomain: "loan",
    triggeredByUserId: null,
    createdAt: now,
    ...overrides,
  };
}

function fakeJob(overrides: Partial<NotificationJobDTO> = {}): NotificationJobDTO {
  const now = new Date();
  return {
    id: "job_1",
    eventId: "evt_1",
    channel: "EMAIL",
    recipientUserId: "user_1",
    recipientAddress: "jane@example.com",
    idempotencyKey: "key_1",
    status: "SENT",
    attemptCount: 1,
    maxAttempts: 5,
    nextAttemptAt: now,
    lockedAt: null,
    lockedBy: null,
    documentId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function seed(store: FakeStore, job: NotificationJobDTO, event: NotificationEventDTO) {
  store.rows.set(job.id, { job, event });
}

class FakeJobsRepository implements INotificationCenterJobsRepository {
  searchCallCount = 0;
  searchMatchCallCount = 0;

  constructor(private readonly store: FakeStore) {}

  async search(criteria: JobsSearchCriteria): Promise<{ items: JobWithEventRow[]; total: number }> {
    this.searchCallCount += 1;
    let rows = [...this.store.rows.values()];
    if (criteria.recipientUserId) rows = rows.filter((r) => r.job.recipientUserId === criteria.recipientUserId);
    if (criteria.channel) rows = rows.filter((r) => r.job.channel === criteria.channel);
    if (criteria.status) rows = rows.filter((r) => r.job.status === criteria.status);
    if (criteria.createdAfter) rows = rows.filter((r) => r.job.createdAt >= criteria.createdAfter!);
    if (criteria.createdBefore) rows = rows.filter((r) => r.job.createdAt <= criteria.createdBefore!);
    if (criteria.includeJobIds) rows = rows.filter((r) => criteria.includeJobIds!.includes(r.job.id));
    if (criteria.excludeJobIds) rows = rows.filter((r) => !criteria.excludeJobIds!.includes(r.job.id));
    rows.sort((a, b) => b.job.createdAt.getTime() - a.job.createdAt.getTime());
    const total = rows.length;
    const items = rows.slice(criteria.skip, criteria.skip + criteria.take);
    return { items, total };
  }

  async findByIdWithEvent(jobId: string): Promise<JobWithEventRow | null> {
    return this.store.rows.get(jobId) ?? null;
  }

  async findAllJobIds(recipientUserId: string): Promise<string[]> {
    return [...this.store.rows.values()].filter((r) => r.job.recipientUserId === recipientUserId).map((r) => r.job.id);
  }

  async findDeliveryAttemptsWithProvider() {
    return [
      {
        attemptNumber: 1,
        outcome: "SUCCESS" as const,
        errorCode: null,
        errorMessage: null,
        attemptedAt: new Date(),
        providerName: "Primary SMTP",
      },
    ];
  }

  async findSearchMatchJobIds(term: string, recipientUserId?: string): Promise<string[]> {
    this.searchMatchCallCount += 1;
    const lower = term.toLowerCase();
    return [...this.store.rows.values()]
      .filter((r) => !recipientUserId || r.job.recipientUserId === recipientUserId)
      .filter(
        (r) =>
          r.event.eventType.toLowerCase().includes(lower) ||
          JSON.stringify(r.event.payload ?? {}).toLowerCase().includes(lower)
      )
      .map((r) => r.job.id);
  }
}

class FakeInboxStateRepository implements INotificationInboxStateRepository {
  states = new Map<string, NotificationJobInboxStateDTO>();
  private idCounter = 0;

  private key(jobId: string, userId: string): string {
    return `${jobId}:${userId}`;
  }

  async findByJobIds(jobIds: string[], userId: string): Promise<NotificationJobInboxStateDTO[]> {
    return jobIds.map((id) => this.states.get(this.key(id, userId))).filter((s): s is NotificationJobInboxStateDTO => Boolean(s));
  }

  async findOne(jobId: string, userId: string): Promise<NotificationJobInboxStateDTO | null> {
    return this.states.get(this.key(jobId, userId)) ?? null;
  }

  async findJobIdsByFlag(userId: string, flag: InboxStateFlag): Promise<string[]> {
    return [...this.states.values()]
      .filter((s) => s.userId === userId)
      .filter((s) => (flag === "READ" ? s.isRead : flag === "ARCHIVED" ? s.isArchived && !s.deletedAt : Boolean(s.deletedAt)))
      .map((s) => s.notificationJobId);
  }

  async upsertRead(jobId: string, userId: string, readAt: Date): Promise<NotificationJobInboxStateDTO> {
    return this.upsert(jobId, userId, { isRead: true, readAt });
  }

  async markManyRead(jobIds: string[], userId: string, readAt: Date): Promise<number> {
    jobIds.forEach((id) => this.upsert(id, userId, { isRead: true, readAt }));
    return jobIds.length;
  }

  async upsertArchived(jobId: string, userId: string, archivedAt: Date): Promise<NotificationJobInboxStateDTO> {
    return this.upsert(jobId, userId, { isArchived: true, archivedAt });
  }

  async upsertUnarchived(jobId: string, userId: string): Promise<NotificationJobInboxStateDTO> {
    return this.upsert(jobId, userId, { isArchived: false, archivedAt: null });
  }

  async softDelete(jobId: string, userId: string, deletedAt: Date): Promise<NotificationJobInboxStateDTO> {
    return this.upsert(jobId, userId, { deletedAt });
  }

  private upsert(jobId: string, userId: string, patch: Partial<NotificationJobInboxStateDTO>): NotificationJobInboxStateDTO {
    const k = this.key(jobId, userId);
    const existing = this.states.get(k);
    const now = new Date();
    const row: NotificationJobInboxStateDTO = existing
      ? { ...existing, ...patch, updatedAt: now }
      : {
          id: `state_${++this.idCounter}`,
          notificationJobId: jobId,
          userId,
          isRead: false,
          readAt: null,
          isArchived: false,
          archivedAt: null,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
          ...patch,
        };
    this.states.set(k, row);
    return row;
  }
}

class FakeJobRepository implements INotificationJobRepository {
  constructor(private readonly store: FakeStore) {}

  async create(): Promise<NotificationJobDTO> {
    throw new Error("not used in these tests");
  }
  async findById(id: string): Promise<NotificationJobDTO | null> {
    return this.store.rows.get(id)?.job ?? null;
  }
  async findByIdempotencyKey(): Promise<NotificationJobDTO | null> {
    throw new Error("not used in these tests");
  }
  async findMany(): Promise<NotificationJobDTO[]> {
    throw new Error("not used in these tests");
  }
  async update(id: string, input: UpdateNotificationJobInput): Promise<NotificationJobDTO> {
    const row = this.store.rows.get(id);
    if (!row) throw new Error("job not found");
    row.job = { ...row.job, ...input, updatedAt: new Date() };
    return row.job;
  }
}

class FakeTemplateEngine implements ITemplateEngine {
  behavior: { kind: "render"; content: RenderedNotificationContent } | { kind: "throw" } = {
    kind: "render",
    content: { subject: "Rendered subject" },
  };

  async render(_params: RenderParams): Promise<RenderedNotificationContent> {
    if (this.behavior.kind === "throw") throw new Error("no template registered");
    return this.behavior.content;
  }
  async preview(_params: PreviewParams): Promise<RenderedNotificationContent> {
    throw new Error("not used in these tests");
  }
  validate(_source: TemplateSource, _options?: TemplateValidationOptions): TemplateValidationResult {
    throw new Error("not used in these tests");
  }
  compile(_source: TemplateSource, _templateKey?: string): CompiledTemplate {
    throw new Error("not used in these tests");
  }
  async register(_input: RegisterTemplateInput): Promise<NotificationTemplateDTO> {
    throw new Error("not used in these tests");
  }
  async unregister(_key: string, _channel: NotificationChannel, _locale?: string): Promise<void> {
    throw new Error("not used in these tests");
  }
  async list(): Promise<NotificationTemplateDTO[]> {
    throw new Error("not used in these tests");
  }
  async exists(): Promise<boolean> {
    throw new Error("not used in these tests");
  }
}

class FakeQueueEngine implements Partial<IQueueEngine> {
  statistics: QueueStatistics = {
    QUEUED: 1,
    PROCESSING: 0,
    SENT: 2,
    RETRY_SCHEDULED: 1,
    FAILED: 0,
    DEAD_LETTER: 1,
    COMPLETED: 3,
  };
  async getStatistics(): Promise<QueueStatistics> {
    return this.statistics;
  }
}

function buildService() {
  const store = new FakeStore();
  const jobsRepository = new FakeJobsRepository(store);
  const inboxStateRepository = new FakeInboxStateRepository();
  const jobRepository = new FakeJobRepository(store);
  const templateEngine = new FakeTemplateEngine();
  const queueEngine = new FakeQueueEngine() as unknown as IQueueEngine;
  const service = new NotificationInboxService(jobsRepository, inboxStateRepository, jobRepository, templateEngine, queueEngine);
  return { service, store, jobsRepository, inboxStateRepository, jobRepository, templateEngine, queueEngine };
}

describe("NotificationInboxService — employee access (authorization/scoping)", () => {
  it("listForUser only ever returns the caller's own jobs, even if other users' jobs exist", async () => {
    const { service, store } = buildService();
    seed(store, fakeJob({ id: "job_1", recipientUserId: "user_1" }), fakeEvent({ id: "evt_1" }));
    seed(store, fakeJob({ id: "job_2", recipientUserId: "user_2" }), fakeEvent({ id: "evt_1" }));

    const result = await service.listForUser("user_1", {}, { page: 1, pageSize: 10 });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].jobId, "job_1");
  });

  it("getDetailForUser returns null for a job that belongs to a different user (no existence leak)", async () => {
    const { service, store } = buildService();
    seed(store, fakeJob({ id: "job_1", recipientUserId: "user_2" }), fakeEvent());

    const detail = await service.getDetailForUser("job_1", "user_1");
    assert.equal(detail, null);
  });

  it("getDetailForUser returns null for a soft-deleted notification, even for its owner", async () => {
    const { service, store, inboxStateRepository } = buildService();
    seed(store, fakeJob({ id: "job_1", recipientUserId: "user_1" }), fakeEvent());
    await inboxStateRepository.upsertArchived("job_1", "user_1", new Date());
    await inboxStateRepository.softDelete("job_1", "user_1", new Date());

    const detail = await service.getDetailForUser("job_1", "user_1");
    assert.equal(detail, null);
  });

  it("markRead/archive/unarchive/deleteArchived all fail with a not-found result for a job the caller doesn't own", async () => {
    const { service, store } = buildService();
    seed(store, fakeJob({ id: "job_1", recipientUserId: "user_2" }), fakeEvent());

    assert.equal((await service.markRead("job_1", "user_1")).success, false);
    assert.equal((await service.archive("job_1", "user_1")).success, false);
    assert.equal((await service.unarchive("job_1", "user_1")).success, false);
    assert.equal((await service.deleteArchived("job_1", "user_1")).success, false);
  });
});

describe("NotificationInboxService — administrator access", () => {
  it("listForAdmin returns jobs across every recipient when no recipientUserId is given", async () => {
    const { service, store } = buildService();
    seed(store, fakeJob({ id: "job_1", recipientUserId: "user_1" }), fakeEvent());
    seed(store, fakeJob({ id: "job_2", recipientUserId: "user_2" }), fakeEvent());

    const result = await service.listForAdmin({}, { page: 1, pageSize: 10 });
    assert.equal(result.total, 2);
    assert.deepEqual(
      result.items.map((i) => i.recipientUserId).sort(),
      ["user_1", "user_2"]
    );
  });

  it("listForAdmin scoped to one recipientUserId also applies that user's read/archived state", async () => {
    const { service, store, inboxStateRepository } = buildService();
    seed(store, fakeJob({ id: "job_1", recipientUserId: "user_1" }), fakeEvent());
    await inboxStateRepository.upsertRead("job_1", "user_1", new Date());

    const result = await service.listForAdmin({ recipientUserId: "user_1" }, { page: 1, pageSize: 10 });
    assert.equal(result.items[0].isRead, true);
  });

  it("getDetailForAdmin includes delivery attempts and worker/lock info an employee's own detail view never has", async () => {
    const { service, store } = buildService();
    seed(store, fakeJob({ id: "job_1", recipientUserId: "user_1", lockedBy: "worker-1" }), fakeEvent());

    const detail = await service.getDetailForAdmin("job_1");
    assert.ok(detail);
    assert.equal(detail?.lockedBy, "worker-1");
    assert.equal(detail?.deliveryAttempts.length, 1);
    assert.equal(detail?.deliveryAttempts[0].providerName, "Primary SMTP");
  });

  it("getQueueStatus delegates directly to QueueEngine.getStatistics (read-only, no enqueue/send)", async () => {
    const { service, queueEngine } = buildService();
    const stats = await service.getQueueStatus();
    assert.deepEqual(stats, (queueEngine as unknown as FakeQueueEngine).statistics);
  });
});

describe("NotificationInboxService — filtering", () => {
  it("filters by channel and delivery status", async () => {
    const { service, store } = buildService();
    seed(store, fakeJob({ id: "job_1", recipientUserId: "user_1", channel: "EMAIL", status: "SENT" }), fakeEvent());
    seed(store, fakeJob({ id: "job_2", recipientUserId: "user_1", channel: "SMS", status: "DEAD_LETTER" }), fakeEvent());

    const byChannel = await service.listForUser("user_1", { channel: "SMS" }, { page: 1, pageSize: 10 });
    assert.deepEqual(byChannel.items.map((i) => i.jobId), ["job_2"]);

    const byStatus = await service.listForUser("user_1", { deliveryStatus: "SENT" }, { page: 1, pageSize: 10 });
    assert.deepEqual(byStatus.items.map((i) => i.jobId), ["job_1"]);
  });

  it("filters by date range", async () => {
    const { service, store } = buildService();
    seed(store, fakeJob({ id: "old", recipientUserId: "user_1", createdAt: new Date("2020-01-01") }), fakeEvent());
    seed(store, fakeJob({ id: "new", recipientUserId: "user_1", createdAt: new Date("2027-01-01") }), fakeEvent());

    const result = await service.listForUser(
      "user_1",
      { createdAfter: new Date("2025-01-01"), createdBefore: new Date("2028-01-01") },
      { page: 1, pageSize: 10 }
    );
    assert.deepEqual(result.items.map((i) => i.jobId), ["new"]);
  });

  it("the default view hides archived notifications; archived:true shows only archived", async () => {
    const { service, store, inboxStateRepository } = buildService();
    seed(store, fakeJob({ id: "job_1", recipientUserId: "user_1" }), fakeEvent());
    seed(store, fakeJob({ id: "job_2", recipientUserId: "user_1" }), fakeEvent());
    await inboxStateRepository.upsertArchived("job_2", "user_1", new Date());

    const inbox = await service.listForUser("user_1", {}, { page: 1, pageSize: 10 });
    assert.deepEqual(inbox.items.map((i) => i.jobId), ["job_1"]);

    const archived = await service.listForUser("user_1", { archived: true }, { page: 1, pageSize: 10 });
    assert.deepEqual(archived.items.map((i) => i.jobId), ["job_2"]);
  });

  it("read/unread filters split correctly, including jobs with no inbox-state row yet (implicitly unread)", async () => {
    const { service, store, inboxStateRepository } = buildService();
    seed(store, fakeJob({ id: "job_1", recipientUserId: "user_1" }), fakeEvent());
    seed(store, fakeJob({ id: "job_2", recipientUserId: "user_1" }), fakeEvent());
    await inboxStateRepository.upsertRead("job_1", "user_1", new Date());

    const unread = await service.listForUser("user_1", { readStatus: "UNREAD" }, { page: 1, pageSize: 10 });
    assert.deepEqual(unread.items.map((i) => i.jobId), ["job_2"]);

    const read = await service.listForUser("user_1", { readStatus: "READ" }, { page: 1, pageSize: 10 });
    assert.deepEqual(read.items.map((i) => i.jobId), ["job_1"]);
  });

  it("a soft-deleted notification never appears in any list, regardless of other filters", async () => {
    const { service, store, inboxStateRepository } = buildService();
    seed(store, fakeJob({ id: "job_1", recipientUserId: "user_1" }), fakeEvent());
    await inboxStateRepository.upsertArchived("job_1", "user_1", new Date());
    await inboxStateRepository.softDelete("job_1", "user_1", new Date());

    const archived = await service.listForUser("user_1", { archived: true }, { page: 1, pageSize: 10 });
    assert.equal(archived.total, 0);
  });
});

describe("NotificationInboxService — search", () => {
  it("matches the title proxy (eventType)", async () => {
    const { service, store } = buildService();
    seed(store, fakeJob({ id: "job_1", recipientUserId: "user_1" }), fakeEvent({ id: "evt_1", eventType: "LOAN_APPROVED" }));
    seed(store, fakeJob({ id: "job_2", recipientUserId: "user_1", eventId: "evt_2" }), fakeEvent({ id: "evt_2", eventType: "PAYROLL_RUN" }));

    const result = await service.listForUser("user_1", { search: "loan" }, { page: 1, pageSize: 10 });
    assert.deepEqual(result.items.map((i) => i.jobId), ["job_1"]);
  });

  it("matches the body proxy (payload contents)", async () => {
    const { service, store } = buildService();
    seed(
      store,
      fakeJob({ id: "job_1", recipientUserId: "user_1" }),
      fakeEvent({ id: "evt_1", eventType: "LOAN_APPROVED", payload: { employee: { name: "Jane Doe" } } })
    );

    const result = await service.listForUser("user_1", { search: "Jane Doe" }, { page: 1, pageSize: 10 });
    assert.deepEqual(result.items.map((i) => i.jobId), ["job_1"]);
  });

  it("search is scoped to the caller's own jobs for an employee", async () => {
    const { service, store } = buildService();
    seed(store, fakeJob({ id: "job_1", recipientUserId: "user_2" }), fakeEvent({ eventType: "LOAN_APPROVED" }));

    const result = await service.listForUser("user_1", { search: "loan" }, { page: 1, pageSize: 10 });
    assert.equal(result.total, 0);
  });
});

describe("NotificationInboxService — pagination", () => {
  it("computes page/pageSize/totalPages correctly across multiple pages", async () => {
    const { service, store } = buildService();
    for (let i = 0; i < 25; i++) {
      seed(store, fakeJob({ id: `job_${i}`, recipientUserId: "user_1", createdAt: new Date(2025, 0, i + 1) }), fakeEvent());
    }

    const page1 = await service.listForUser("user_1", {}, { page: 1, pageSize: 10 });
    assert.equal(page1.items.length, 10);
    assert.equal(page1.total, 25);
    assert.equal(page1.totalPages, 3);

    const page3 = await service.listForUser("user_1", {}, { page: 3, pageSize: 10 });
    assert.equal(page3.items.length, 5);
  });
});

describe("NotificationInboxService — read/unread", () => {
  it("markRead sets isRead for exactly the given job", async () => {
    const { service, store } = buildService();
    seed(store, fakeJob({ id: "job_1", recipientUserId: "user_1" }), fakeEvent());

    const result = await service.markRead("job_1", "user_1");
    assert.equal(result.success, true);

    const [item] = (await service.listForUser("user_1", {}, { page: 1, pageSize: 10 })).items;
    assert.equal(item.isRead, true);
  });

  it("markAllRead marks every currently-unread, non-deleted job read, and is a safe no-op on an already-all-read inbox", async () => {
    const { service, store } = buildService();
    seed(store, fakeJob({ id: "job_1", recipientUserId: "user_1" }), fakeEvent());
    seed(store, fakeJob({ id: "job_2", recipientUserId: "user_1" }), fakeEvent());

    await service.markAllRead("user_1");
    const counts = await service.getCounts("user_1");
    assert.equal(counts.unread, 0);
    assert.equal(counts.read, 2);

    const second = await service.markAllRead("user_1");
    assert.equal(second.success, true);
  });

  it("getCounts reports unread/read/archived/total correctly", async () => {
    const { service, store, inboxStateRepository } = buildService();
    seed(store, fakeJob({ id: "job_1", recipientUserId: "user_1" }), fakeEvent());
    seed(store, fakeJob({ id: "job_2", recipientUserId: "user_1" }), fakeEvent());
    seed(store, fakeJob({ id: "job_3", recipientUserId: "user_1" }), fakeEvent());
    await inboxStateRepository.upsertRead("job_1", "user_1", new Date());
    await inboxStateRepository.upsertArchived("job_3", "user_1", new Date());

    const counts = await service.getCounts("user_1");
    assert.equal(counts.unread, 1); // job_2
    assert.equal(counts.read, 1); // job_1
    assert.equal(counts.archived, 1); // job_3
    assert.equal(counts.total, 2); // active (non-archived, non-deleted) = job_1 + job_2
  });
});

describe("NotificationInboxService — archive", () => {
  it("archive then unarchive round-trips back into the default inbox view", async () => {
    const { service, store } = buildService();
    seed(store, fakeJob({ id: "job_1", recipientUserId: "user_1" }), fakeEvent());

    await service.archive("job_1", "user_1");
    let inbox = await service.listForUser("user_1", {}, { page: 1, pageSize: 10 });
    assert.equal(inbox.total, 0);

    await service.unarchive("job_1", "user_1");
    inbox = await service.listForUser("user_1", {}, { page: 1, pageSize: 10 });
    assert.equal(inbox.total, 1);
  });

  it("deleteArchived fails for a notification that isn't archived yet", async () => {
    const { service, store } = buildService();
    seed(store, fakeJob({ id: "job_1", recipientUserId: "user_1" }), fakeEvent());

    const result = await service.deleteArchived("job_1", "user_1");
    assert.equal(result.success, false);
  });

  it("deleteArchived succeeds for an archived notification and it disappears from every view", async () => {
    const { service, store } = buildService();
    seed(store, fakeJob({ id: "job_1", recipientUserId: "user_1" }), fakeEvent());

    await service.archive("job_1", "user_1");
    const result = await service.deleteArchived("job_1", "user_1");
    assert.equal(result.success, true);

    const archived = await service.listForUser("user_1", { archived: true }, { page: 1, pageSize: 10 });
    assert.equal(archived.total, 0);
    const detail = await service.getDetailForUser("job_1", "user_1");
    assert.equal(detail, null);
  });
});

describe("NotificationInboxService — manual retry", () => {
  it("retryNow succeeds for a RETRY_SCHEDULED job and advances nextAttemptAt to now", async () => {
    const { service, store } = buildService();
    seed(store, fakeJob({ id: "job_1", status: "RETRY_SCHEDULED", nextAttemptAt: new Date("2099-01-01") }), fakeEvent());

    const result = await service.retryNow("job_1");
    assert.equal(result.success, true);

    const updated = store.rows.get("job_1")!.job;
    assert.ok(updated.nextAttemptAt.getTime() < new Date("2099-01-01").getTime());
  });

  it("retryNow refuses a job that isn't RETRY_SCHEDULED", async () => {
    const { service, store } = buildService();
    seed(store, fakeJob({ id: "job_1", status: "SENT" }), fakeEvent());

    const result = await service.retryNow("job_1");
    assert.equal(result.success, false);
  });

  it("retryNow reports not-found for a missing job", async () => {
    const { service } = buildService();
    const result = await service.retryNow("missing");
    assert.equal(result.success, false);
  });
});

describe("NotificationInboxService — dead-letter requeue", () => {
  it("requeueDeadLetter moves a DEAD_LETTER job back to QUEUED with a fresh attempt count", async () => {
    const { service, store } = buildService();
    seed(store, fakeJob({ id: "job_1", status: "DEAD_LETTER", attemptCount: 5, lockedBy: "worker-1", lockedAt: new Date() }), fakeEvent());

    const result = await service.requeueDeadLetter("job_1");
    assert.equal(result.success, true);

    const updated = store.rows.get("job_1")!.job;
    assert.equal(updated.status, "QUEUED");
    assert.equal(updated.attemptCount, 0);
    assert.equal(updated.lockedBy, null);
  });

  it("requeueDeadLetter refuses a PROCESSING job — must never race a live worker, even though the state machine allows PROCESSING -> QUEUED for release()", async () => {
    const { service, store } = buildService();
    seed(store, fakeJob({ id: "job_1", status: "PROCESSING", lockedBy: "worker-1" }), fakeEvent());

    const result = await service.requeueDeadLetter("job_1");
    assert.equal(result.success, false);

    const unchanged = store.rows.get("job_1")!.job;
    assert.equal(unchanged.status, "PROCESSING");
  });

  it("requeueDeadLetter refuses a SENT/COMPLETED job", async () => {
    const { service, store } = buildService();
    seed(store, fakeJob({ id: "job_1", status: "COMPLETED" }), fakeEvent());

    const result = await service.requeueDeadLetter("job_1");
    assert.equal(result.success, false);
  });
});

describe("NotificationInboxService — performance-sensitive query behavior", () => {
  it("listForUser issues a constant number of repository calls regardless of page size (no per-row N+1)", async () => {
    const { service, store, jobsRepository } = buildService();
    for (let i = 0; i < 50; i++) {
      seed(store, fakeJob({ id: `job_${i}`, recipientUserId: "user_1" }), fakeEvent());
    }

    await service.listForUser("user_1", { readStatus: "UNREAD", search: "loan" }, { page: 1, pageSize: 10 });
    // Exactly one `search` call regardless of how many rows exist or are returned.
    assert.equal(jobsRepository.searchCallCount, 1);
    assert.equal(jobsRepository.searchMatchCallCount, 1);
  });

  it("getDetailForUser never calls the list-search method — detail is a direct id lookup, not a scan", async () => {
    const { service, store, jobsRepository } = buildService();
    seed(store, fakeJob({ id: "job_1", recipientUserId: "user_1" }), fakeEvent());

    await service.getDetailForUser("job_1", "user_1");
    assert.equal(jobsRepository.searchCallCount, 0);
  });
});
