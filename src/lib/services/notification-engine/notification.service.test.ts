import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NotificationService } from "./notification.service";
import { ChannelAdapterFactory } from "./factories";
import type { BuildNotificationJobParams } from "./factories";
import type { IQueueEngine, QueueSearchResult, QueueStatistics } from "./queue";
import type {
  IDocumentRepository,
  INotificationHistoryRepository,
  INotificationJobRepository,
  INotificationPreferenceRepository,
  INotificationProviderRepository,
  INotificationRepository,
  INotificationTemplateRepository,
} from "./repositories/interfaces";
import type {
  CreateNotificationEventInput,
  NotificationEventDTO,
  NotificationEventQueryCriteria,
  NotificationJobDTO,
  NotificationJobQueryCriteria,
  NotificationPreferenceDTO,
  UpsertNotificationPreferenceInput,
} from "./dto";
import type { NotificationChannel } from "./types/enums";
import { RepositoryError, ValidationError } from "./errors";
import { FixedClock } from "./utils";

/** In-memory fake of `INotificationRepository`, plus race/failure injection for the dedup tests. */
class FakeNotificationRepository implements INotificationRepository {
  private readonly byId = new Map<string, NotificationEventDTO>();
  private readonly byDedupeKey = new Map<string, NotificationEventDTO>();
  private nextId = 1;
  createCalls: CreateNotificationEventInput[] = [];

  /** Simulates a concurrent `raiseEvent` call winning the insert race for the same `dedupeKey`. */
  simulateRaceOnNextCreate = false;
  /** Simulates an unrelated data-access failure (connection error, etc.) — not a dedupe conflict. */
  failNextCreateWithGenericError = false;

  async create(input: CreateNotificationEventInput): Promise<NotificationEventDTO> {
    this.createCalls.push(input);

    if (this.failNextCreateWithGenericError) {
      this.failNextCreateWithGenericError = false;
      throw new RepositoryError("connection lost", "NotificationRepository", {
        cause: { code: "P1001" },
      });
    }

    if (this.simulateRaceOnNextCreate) {
      this.simulateRaceOnNextCreate = false;
      // The "other" concurrent caller's insert wins first...
      const winner = this.insert(input);
      // ...so this call observes a unique-constraint conflict on dedupeKey.
      throw new RepositoryError(`Unique constraint failed on the fields: (\`dedupeKey\`)`, "NotificationRepository", {
        cause: { code: "P2002", meta: { target: ["dedupeKey"] } },
      });
    }

    return this.insert(input);
  }

  private insert(input: CreateNotificationEventInput): NotificationEventDTO {
    const event: NotificationEventDTO = {
      id: `evt_${this.nextId++}`,
      eventType: input.eventType,
      dedupeKey: input.dedupeKey,
      sourceDomain: input.sourceDomain,
      payload: input.payload ?? null,
      triggeredByUserId: input.triggeredByUserId ?? null,
      createdAt: new Date(),
    };
    this.byId.set(event.id, event);
    this.byDedupeKey.set(event.dedupeKey, event);
    return event;
  }

  async findById(id: string): Promise<NotificationEventDTO | null> {
    return this.byId.get(id) ?? null;
  }
  async findByDedupeKey(dedupeKey: string): Promise<NotificationEventDTO | null> {
    return this.byDedupeKey.get(dedupeKey) ?? null;
  }
  async findMany(_criteria: NotificationEventQueryCriteria = {}): Promise<NotificationEventDTO[]> {
    return Array.from(this.byId.values());
  }
}

/** In-memory fake of `IQueueEngine` — only `enqueue` (and the read-back used by `findMany` below) is exercised by NotificationService. */
class FakeQueueEngine implements IQueueEngine {
  enqueueCalls: BuildNotificationJobParams[] = [];
  private readonly jobsByIdempotencyKey = new Map<string, NotificationJobDTO>();
  private nextId = 1;
  /** Throws on the Nth `enqueue` call (1-indexed) — used to simulate a mid-fan-out dependency failure. */
  failEnqueueCallNumber: number | null = null;

  async enqueue(params: BuildNotificationJobParams): Promise<NotificationJobDTO> {
    this.enqueueCalls.push(params);
    if (this.failEnqueueCallNumber === this.enqueueCalls.length) {
      throw new Error("simulated queue repository failure");
    }

    const idempotencyKey = `${params.dedupeKey}:${params.channel}:${params.recipientUserId ?? "none"}`;
    const existing = this.jobsByIdempotencyKey.get(idempotencyKey);
    if (existing) {
      return existing;
    }

    const nextAttemptAt = (params.clock ?? { now: () => new Date() }).now();
    const job: NotificationJobDTO = {
      id: `job_${this.nextId++}`,
      eventId: params.eventId,
      channel: params.channel,
      recipientUserId: params.recipientUserId ?? null,
      recipientAddress: params.recipientAddress,
      idempotencyKey,
      status: "QUEUED",
      attemptCount: 0,
      maxAttempts: params.maxAttempts ?? 5,
      nextAttemptAt,
      lockedAt: null,
      lockedBy: null,
      documentId: params.documentId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.jobsByIdempotencyKey.set(idempotencyKey, job);
    return job;
  }

  jobsForEvent(eventId: string): NotificationJobDTO[] {
    return Array.from(this.jobsByIdempotencyKey.values()).filter((job) => job.eventId === eventId);
  }

  async claimNext(): Promise<NotificationJobDTO | null> {
    throw new Error("not used in these tests");
  }
  async claimBatch(): Promise<NotificationJobDTO[]> {
    throw new Error("not used in these tests");
  }
  async release(): Promise<NotificationJobDTO> {
    throw new Error("not used in these tests");
  }
  async renewLease(): Promise<NotificationJobDTO> {
    throw new Error("not used in these tests");
  }
  async complete(): Promise<NotificationJobDTO> {
    throw new Error("not used in these tests");
  }
  async archive(): Promise<NotificationJobDTO> {
    throw new Error("not used in these tests");
  }
  async markFailed(): Promise<NotificationJobDTO> {
    throw new Error("not used in these tests");
  }
  async scheduleRetry(): Promise<NotificationJobDTO> {
    throw new Error("not used in these tests");
  }
  async cancel(): Promise<NotificationJobDTO> {
    throw new Error("not used in these tests");
  }
  async recoverExpiredLocks(): Promise<number> {
    throw new Error("not used in these tests");
  }
  async findQueued(): Promise<NotificationJobDTO[]> {
    throw new Error("not used in these tests");
  }
  async findProcessing(): Promise<NotificationJobDTO[]> {
    throw new Error("not used in these tests");
  }
  async findRetryCandidates(): Promise<NotificationJobDTO[]> {
    throw new Error("not used in these tests");
  }
  async search(): Promise<QueueSearchResult> {
    throw new Error("not used in these tests");
  }
  async countQueue(): Promise<number> {
    throw new Error("not used in these tests");
  }
  async countQueued(): Promise<number> {
    throw new Error("not used in these tests");
  }
  async countProcessing(): Promise<number> {
    throw new Error("not used in these tests");
  }
  async countFailures(): Promise<number> {
    throw new Error("not used in these tests");
  }
  async getStatistics(): Promise<QueueStatistics> {
    throw new Error("not used in these tests");
  }
}

/** Delegates to `FakeQueueEngine`'s in-memory jobs — mirrors how the real `NotificationJobRepository` reads the same `NotificationJob` table `QueueEngine` writes to. */
class FakeJobRepository implements INotificationJobRepository {
  constructor(private readonly queueEngine: FakeQueueEngine) {}

  async create(): Promise<NotificationJobDTO> {
    throw new Error("not used in these tests");
  }
  async findById(): Promise<NotificationJobDTO | null> {
    throw new Error("not used in these tests");
  }
  async findByIdempotencyKey(): Promise<NotificationJobDTO | null> {
    throw new Error("not used in these tests");
  }
  async findMany(criteria: NotificationJobQueryCriteria = {}): Promise<NotificationJobDTO[]> {
    return this.queueEngine.jobsForEvent(criteria.eventId ?? "");
  }
  async update(): Promise<NotificationJobDTO> {
    throw new Error("not used in these tests");
  }
}

class UnusedHistoryRepository implements INotificationHistoryRepository {
  async create(): Promise<never> {
    throw new Error("not used in these tests");
  }
  async findById(): Promise<null> {
    return null;
  }
  async findByJobId(): Promise<never[]> {
    return [];
  }
}

class UnusedTemplateRepository implements INotificationTemplateRepository {
  async create(): Promise<never> {
    throw new Error("not used in these tests");
  }
  async findById(): Promise<null> {
    return null;
  }
  async findActiveByKeyAndChannel(): Promise<null> {
    return null;
  }
  async findMany(): Promise<never[]> {
    throw new Error("not used in these tests");
  }
  async update(): Promise<never> {
    throw new Error("not used in these tests");
  }
}

class UnusedProviderRepository implements INotificationProviderRepository {
  async create(): Promise<never> {
    throw new Error("not used in these tests");
  }
  async findById(): Promise<null> {
    return null;
  }
  async findActiveByChannelOrderedByPriority(): Promise<never[]> {
    return [];
  }
  async updateHealth(): Promise<never> {
    throw new Error("not used in these tests");
  }
}

class UnusedDocumentRepository implements IDocumentRepository {
  async create(): Promise<never> {
    throw new Error("not used in these tests");
  }
  async findById(): Promise<null> {
    return null;
  }
  async findMany(): Promise<never[]> {
    throw new Error("not used in these tests");
  }
  async update(): Promise<never> {
    throw new Error("not used in these tests");
  }
  async addUploadAttempt(): Promise<never> {
    throw new Error("not used in these tests");
  }
  async findUploadAttemptsByDocumentId(): Promise<never[]> {
    throw new Error("not used in these tests");
  }
}

/** In-memory fake of `INotificationPreferenceRepository` — a missing row means "no explicit preference," matching the real repository's contract. */
class FakePreferenceRepository implements INotificationPreferenceRepository {
  private readonly rows = new Map<string, NotificationPreferenceDTO>();
  private nextId = 1;

  /** Test-only seeding helper — sets an explicit preference directly, bypassing `upsert`'s normal call path. */
  seed(userId: string, notificationType: string, channel: NotificationChannel, isEnabled: boolean): void {
    const key = this.key(userId, notificationType, channel);
    const existing = this.rows.get(key);
    this.rows.set(key, {
      id: existing?.id ?? `pref_${this.nextId++}`,
      userId,
      notificationType,
      channel,
      isEnabled,
      createdAt: existing?.createdAt ?? new Date(),
      updatedAt: new Date(),
    });
  }

  async findOne(userId: string, notificationType: string, channel: NotificationChannel): Promise<NotificationPreferenceDTO | null> {
    return this.rows.get(this.key(userId, notificationType, channel)) ?? null;
  }

  async findByUser(userId: string): Promise<NotificationPreferenceDTO[]> {
    return Array.from(this.rows.values()).filter((row) => row.userId === userId);
  }

  async upsert(input: UpsertNotificationPreferenceInput): Promise<NotificationPreferenceDTO> {
    this.seed(input.userId, input.notificationType, input.channel, input.isEnabled);
    return (await this.findOne(input.userId, input.notificationType, input.channel))!;
  }

  async deleteOne(userId: string, notificationType: string, channel: NotificationChannel): Promise<void> {
    this.rows.delete(this.key(userId, notificationType, channel));
  }

  private key(userId: string, notificationType: string, channel: string): string {
    return `${userId}:${notificationType}:${channel}`;
  }
}

function buildService() {
  const notificationRepository = new FakeNotificationRepository();
  const queueEngine = new FakeQueueEngine();
  const jobRepository = new FakeJobRepository(queueEngine);
  const preferenceRepository = new FakePreferenceRepository();
  const service = new NotificationService(
    notificationRepository,
    jobRepository,
    new UnusedHistoryRepository(),
    new UnusedTemplateRepository(),
    new UnusedProviderRepository(),
    new UnusedDocumentRepository(),
    new ChannelAdapterFactory(),
    queueEngine,
    preferenceRepository
  );
  return { service, notificationRepository, queueEngine, jobRepository, preferenceRepository };
}

describe("NotificationService.raiseEvent — orchestration flow", () => {
  it("creates one NotificationEvent and one NotificationJob per recipient", async () => {
    const { service } = buildService();

    const result = await service.raiseEvent({
      eventType: "LOAN_APPROVED",
      payload: { employeeId: "u1", amount: 5000 },
      recipients: [
        { channel: "EMAIL", recipientAddress: "jane@example.com", recipientUserId: "u1" },
        { channel: "SMS", recipientAddress: "+15551234567", recipientUserId: "u1" },
      ],
    });

    assert.equal(result.deduplicated, false);
    assert.equal(result.event.eventType, "LOAN_APPROVED");
    assert.equal(result.jobs.length, 2);
    assert.deepEqual(
      result.jobs.map((j) => j.channel).sort(),
      ["EMAIL", "SMS"]
    );
    assert.ok(result.jobs.every((j) => j.eventId === result.event.id));
  });

  it("derives dedupeKey/sourceDomain from eventType+payload when not supplied", async () => {
    const { service, notificationRepository } = buildService();

    await service.raiseEvent({
      eventType: "LOAN_APPROVED",
      payload: { loanId: "loan_1" },
      recipients: [{ channel: "EMAIL", recipientAddress: "jane@example.com" }],
    });

    const [createCall] = notificationRepository.createCalls;
    assert.equal(createCall.sourceDomain, "loan");
    assert.match(createCall.dedupeKey, /^LOAN_APPROVED:[a-f0-9]{32}$/);
  });

  it("honors an explicit dedupeKey/sourceDomain override instead of deriving one", async () => {
    const { service, notificationRepository } = buildService();

    await service.raiseEvent({
      eventType: "LOAN_APPROVED",
      dedupeKey: "LOAN_APPROVED:loan_42",
      sourceDomain: "custom-domain",
      payload: { loanId: "loan_42" },
      recipients: [{ channel: "EMAIL", recipientAddress: "jane@example.com" }],
    });

    const [createCall] = notificationRepository.createCalls;
    assert.equal(createCall.dedupeKey, "LOAN_APPROVED:loan_42");
    assert.equal(createCall.sourceDomain, "custom-domain");
  });

  it("passes queueEngine.enqueue the expected fields for each recipient", async () => {
    const { service, queueEngine } = buildService();

    await service.raiseEvent({
      eventType: "LOAN_APPROVED",
      dedupeKey: "LOAN_APPROVED:loan_7",
      payload: { loanId: "loan_7" },
      recipients: [{ channel: "EMAIL", recipientAddress: "jane@example.com", recipientUserId: "u1", documentId: "doc_1" }],
      maxAttempts: 3,
    });

    assert.equal(queueEngine.enqueueCalls.length, 1);
    const [call] = queueEngine.enqueueCalls;
    assert.equal(call.dedupeKey, "LOAN_APPROVED:loan_7");
    assert.equal(call.channel, "EMAIL");
    assert.equal(call.recipientAddress, "jane@example.com");
    assert.equal(call.recipientUserId, "u1");
    assert.equal(call.documentId, "doc_1");
    assert.equal(call.maxAttempts, 3);
  });
});

describe("NotificationService.raiseEvent — deduplication", () => {
  it("returns the existing event and its jobs (deduplicated: true) on a second call with the same dedupeKey", async () => {
    const { service, notificationRepository, queueEngine } = buildService();
    const request = {
      eventType: "LOAN_APPROVED",
      dedupeKey: "LOAN_APPROVED:loan_1",
      payload: { loanId: "loan_1" },
      recipients: [{ channel: "EMAIL" as const, recipientAddress: "jane@example.com" }],
    };

    const first = await service.raiseEvent(request);
    const second = await service.raiseEvent(request);

    assert.equal(first.deduplicated, false);
    assert.equal(second.deduplicated, true);
    assert.equal(second.event.id, first.event.id);
    assert.deepEqual(second.jobs, first.jobs);
    assert.equal(notificationRepository.createCalls.length, 1); // no second insert attempted
    assert.equal(queueEngine.enqueueCalls.length, 1); // no second fan-out
  });

  it("auto-derived dedupeKey collapses two calls with identical eventType+payload into one event", async () => {
    const { service } = buildService();
    const call = () =>
      service.raiseEvent({
        eventType: "LOAN_APPROVED",
        payload: { loanId: "loan_9" },
        recipients: [{ channel: "EMAIL", recipientAddress: "jane@example.com" }],
      });

    const first = await call();
    const second = await call();

    assert.equal(second.deduplicated, true);
    assert.equal(second.event.id, first.event.id);
  });

  it("treats a concurrent insert race on dedupeKey as a dedupe hit instead of surfacing the raw conflict", async () => {
    const { service, notificationRepository } = buildService();
    notificationRepository.simulateRaceOnNextCreate = true;

    const result = await service.raiseEvent({
      eventType: "LOAN_APPROVED",
      dedupeKey: "LOAN_APPROVED:loan_race",
      payload: { loanId: "loan_race" },
      recipients: [{ channel: "EMAIL", recipientAddress: "jane@example.com" }],
    });

    assert.equal(result.deduplicated, true);
    assert.equal(result.event.dedupeKey, "LOAN_APPROVED:loan_race");
  });
});

describe("NotificationService.raiseEvent — idempotency", () => {
  it("collapses duplicate (channel, recipientUserId) pairs within a single call into one job", async () => {
    const { service, queueEngine } = buildService();

    const result = await service.raiseEvent({
      eventType: "LOAN_APPROVED",
      dedupeKey: "LOAN_APPROVED:loan_dup",
      payload: { loanId: "loan_dup" },
      recipients: [
        { channel: "EMAIL", recipientAddress: "jane@example.com", recipientUserId: "u1" },
        { channel: "EMAIL", recipientAddress: "jane@example.com", recipientUserId: "u1" },
      ],
    });

    assert.equal(queueEngine.enqueueCalls.length, 2); // enqueue was asked twice...
    assert.equal(result.jobs.length, 2);
    assert.equal(result.jobs[0].id, result.jobs[1].id); // ...but resolved to the same underlying job both times
  });
});

describe("NotificationService.raiseEvent — preferences (Phase 13)", () => {
  it("A. creates a job when the recipient has no explicit preference (default enabled)", async () => {
    const { service, queueEngine } = buildService();

    const result = await service.raiseEvent({
      eventType: "LOAN_APPROVED",
      dedupeKey: "LOAN_APPROVED:loan_pref_default",
      payload: { loanId: "loan_pref_default" },
      recipients: [{ channel: "EMAIL", recipientAddress: "jane@example.com", recipientUserId: "u1" }],
    });

    assert.equal(result.jobs.length, 1);
    assert.equal(queueEngine.enqueueCalls.length, 1);
  });

  it("B. creates a job when the recipient has explicitly enabled this notificationType/channel", async () => {
    const { service, queueEngine, preferenceRepository } = buildService();
    preferenceRepository.seed("u1", "LOAN_APPROVED", "EMAIL", true);

    const result = await service.raiseEvent({
      eventType: "LOAN_APPROVED",
      dedupeKey: "LOAN_APPROVED:loan_pref_enabled",
      payload: { loanId: "loan_pref_enabled" },
      recipients: [{ channel: "EMAIL", recipientAddress: "jane@example.com", recipientUserId: "u1" }],
    });

    assert.equal(result.jobs.length, 1);
    assert.equal(queueEngine.enqueueCalls.length, 1);
  });

  it("C. records the event but creates NO job when the recipient has explicitly disabled this notificationType/channel", async () => {
    const { service, notificationRepository, queueEngine, preferenceRepository } = buildService();
    preferenceRepository.seed("u1", "LOAN_APPROVED", "EMAIL", false);

    const result = await service.raiseEvent({
      eventType: "LOAN_APPROVED",
      dedupeKey: "LOAN_APPROVED:loan_pref_disabled",
      payload: { loanId: "loan_pref_disabled" },
      recipients: [{ channel: "EMAIL", recipientAddress: "jane@example.com", recipientUserId: "u1" }],
    });

    assert.equal(result.deduplicated, false);
    assert.equal(result.event.dedupeKey, "LOAN_APPROVED:loan_pref_disabled"); // the business event IS recorded
    assert.equal(result.jobs.length, 0); // ...but no delivery job was created
    assert.equal(queueEngine.enqueueCalls.length, 0);
    assert.equal(notificationRepository.createCalls.length, 1);
  });

  it("D. a duplicate raiseEvent call for a disabled preference still deduplicates on the event and creates no job either time", async () => {
    const { service, queueEngine, preferenceRepository } = buildService();
    preferenceRepository.seed("u1", "LOAN_APPROVED", "EMAIL", false);
    const request = {
      eventType: "LOAN_APPROVED",
      dedupeKey: "LOAN_APPROVED:loan_pref_dup",
      payload: { loanId: "loan_pref_dup" },
      recipients: [{ channel: "EMAIL" as const, recipientAddress: "jane@example.com", recipientUserId: "u1" }],
    };

    const first = await service.raiseEvent(request);
    const second = await service.raiseEvent(request);

    assert.equal(first.deduplicated, false);
    assert.equal(first.jobs.length, 0);
    assert.equal(second.deduplicated, true);
    assert.equal(second.jobs.length, 0);
    assert.equal(queueEngine.enqueueCalls.length, 0);
  });

  it("only opts out the specific (notificationType, channel) pair — a different channel for the same user/type is unaffected", async () => {
    const { service, queueEngine, preferenceRepository } = buildService();
    preferenceRepository.seed("u1", "LOAN_APPROVED", "EMAIL", false);

    const result = await service.raiseEvent({
      eventType: "LOAN_APPROVED",
      dedupeKey: "LOAN_APPROVED:loan_pref_other_channel",
      payload: { loanId: "loan_pref_other_channel" },
      recipients: [{ channel: "SMS", recipientAddress: "+15551234567", recipientUserId: "u1" }],
    });

    assert.equal(result.jobs.length, 1);
    assert.equal(queueEngine.enqueueCalls.length, 1);
  });

  it("checks each recipient independently — a mix of enabled/disabled recipients yields jobs only for the enabled ones", async () => {
    const { service, queueEngine, preferenceRepository } = buildService();
    preferenceRepository.seed("u2", "LOAN_APPROVED", "EMAIL", false);

    const result = await service.raiseEvent({
      eventType: "LOAN_APPROVED",
      dedupeKey: "LOAN_APPROVED:loan_pref_mixed",
      payload: { loanId: "loan_pref_mixed" },
      recipients: [
        { channel: "EMAIL", recipientAddress: "jane@example.com", recipientUserId: "u1" }, // no explicit preference -> enabled
        { channel: "EMAIL", recipientAddress: "john@example.com", recipientUserId: "u2" }, // explicitly disabled
      ],
    });

    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].recipientUserId, "u1");
    assert.equal(queueEngine.enqueueCalls.length, 1);
  });

  it("re-checks the preference fresh on every raiseEvent call — a preference change between two distinct events takes effect immediately", async () => {
    const { service, queueEngine, preferenceRepository } = buildService();
    preferenceRepository.seed("u1", "LOAN_APPROVED", "EMAIL", false);

    const disabledResult = await service.raiseEvent({
      eventType: "LOAN_APPROVED",
      dedupeKey: "LOAN_APPROVED:loan_pref_change_1",
      payload: { loanId: "loan_pref_change_1" },
      recipients: [{ channel: "EMAIL", recipientAddress: "jane@example.com", recipientUserId: "u1" }],
    });
    assert.equal(disabledResult.jobs.length, 0);

    preferenceRepository.seed("u1", "LOAN_APPROVED", "EMAIL", true);

    const enabledResult = await service.raiseEvent({
      eventType: "LOAN_APPROVED",
      dedupeKey: "LOAN_APPROVED:loan_pref_change_2", // a distinct event — the earlier one's dedupe key doesn't apply
      payload: { loanId: "loan_pref_change_2" },
      recipients: [{ channel: "EMAIL", recipientAddress: "jane@example.com", recipientUserId: "u1" }],
    });
    assert.equal(enabledResult.jobs.length, 1);
    assert.equal(queueEngine.enqueueCalls.length, 1);
  });

  it("never opts out a recipient with no recipientUserId (nothing to check a preference against)", async () => {
    const { service, queueEngine } = buildService();

    const result = await service.raiseEvent({
      eventType: "LOAN_APPROVED",
      dedupeKey: "LOAN_APPROVED:loan_pref_no_user",
      payload: { loanId: "loan_pref_no_user" },
      recipients: [{ channel: "EMAIL", recipientAddress: "jane@example.com" }],
    });

    assert.equal(result.jobs.length, 1);
    assert.equal(queueEngine.enqueueCalls.length, 1);
  });
});

describe("NotificationService.raiseEvent — scheduling", () => {
  it("schedules every fanned-out job's nextAttemptAt at the given scheduledAt instead of now", async () => {
    const { service } = buildService();
    const scheduledAt = new Date("2027-01-01T00:00:00.000Z");

    const result = await service.raiseEvent({
      eventType: "PAYROLL_RUN",
      dedupeKey: "PAYROLL_RUN:2027-01",
      payload: { month: "2027-01" },
      recipients: [{ channel: "EMAIL", recipientAddress: "jane@example.com" }],
      scheduledAt,
    });

    assert.equal(result.jobs[0].nextAttemptAt.toISOString(), scheduledAt.toISOString());
  });

  it("FixedClock reports the fixed date it was constructed with (sanity check for the scheduling seam itself)", () => {
    const fixed = new Date("2030-06-15T12:00:00.000Z");
    const clock = new FixedClock(fixed);
    assert.equal(clock.now(), fixed);
  });
});

describe("NotificationService.raiseEvent — validation", () => {
  it("rejects an empty eventType", async () => {
    const { service } = buildService();
    await assert.rejects(
      () => service.raiseEvent({ eventType: "", recipients: [{ channel: "EMAIL", recipientAddress: "a@b.com" }] }),
      ValidationError
    );
  });

  it("rejects a missing/empty recipients array", async () => {
    const { service } = buildService();
    await assert.rejects(() => service.raiseEvent({ eventType: "LOAN_APPROVED", recipients: [] }), ValidationError);
  });

  it("rejects a recipient with an invalid channel", async () => {
    const { service } = buildService();
    await assert.rejects(
      () =>
        service.raiseEvent({
          eventType: "LOAN_APPROVED",
          // @ts-expect-error deliberately invalid channel for this test
          recipients: [{ channel: "CARRIER_PIGEON", recipientAddress: "a@b.com" }],
        }),
      ValidationError
    );
  });

  it("rejects a recipient with an empty recipientAddress", async () => {
    const { service } = buildService();
    await assert.rejects(
      () => service.raiseEvent({ eventType: "LOAN_APPROVED", recipients: [{ channel: "EMAIL", recipientAddress: "  " }] }),
      ValidationError
    );
  });

  it("rejects an eventType exceeding the structural length limit (invalid event input, caught before any repository call)", async () => {
    const { service, notificationRepository } = buildService();
    await assert.rejects(
      () =>
        service.raiseEvent({
          eventType: "X".repeat(200),
          recipients: [{ channel: "EMAIL", recipientAddress: "a@b.com" }],
        }),
      ValidationError
    );
    assert.equal(notificationRepository.createCalls.length, 0);
  });

  it("accepts an explicit null payload (payload is optional)", async () => {
    const { service } = buildService();
    const result = await service.raiseEvent({
      eventType: "SYSTEM_PING",
      payload: null,
      recipients: [{ channel: "EMAIL", recipientAddress: "a@b.com" }],
    });
    assert.equal(result.event.payload, null);
  });
});

describe("NotificationService.raiseEvent — failure propagation", () => {
  it("propagates a generic (non-dedupe-conflict) repository failure instead of swallowing it", async () => {
    const { service, notificationRepository } = buildService();
    notificationRepository.failNextCreateWithGenericError = true;

    await assert.rejects(
      () =>
        service.raiseEvent({
          eventType: "LOAN_APPROVED",
          recipients: [{ channel: "EMAIL", recipientAddress: "a@b.com" }],
        }),
      RepositoryError
    );
  });

  it("propagates a queue-engine (dependency) failure encountered mid-fan-out", async () => {
    const { service, queueEngine } = buildService();
    queueEngine.failEnqueueCallNumber = 2;

    await assert.rejects(
      () =>
        service.raiseEvent({
          eventType: "LOAN_APPROVED",
          recipients: [
            { channel: "EMAIL", recipientAddress: "jane@example.com" },
            { channel: "SMS", recipientAddress: "+15551234567" },
          ],
        }),
      /simulated queue repository failure/
    );
    assert.equal(queueEngine.enqueueCalls.length, 2); // the first recipient's job was still enqueued
  });
});

describe("NotificationService — read-only passthroughs", () => {
  it("getEventById / getEventByDedupeKey delegate to the notification repository", async () => {
    const { service, notificationRepository } = buildService();
    const created = await notificationRepository.create({
      eventType: "LOAN_APPROVED",
      dedupeKey: "LOAN_APPROVED:loan_read",
      sourceDomain: "loan",
    });

    assert.deepEqual(await service.getEventById(created.id), created);
    assert.deepEqual(await service.getEventByDedupeKey(created.dedupeKey), created);
    assert.equal(await service.getEventById("missing"), null);
  });

  it("processJob / resendJob remain unimplemented stubs (WorkerRuntime owns dispatch as of Phase 8)", async () => {
    const { service } = buildService();
    await assert.rejects(() => service.processJob());
    await assert.rejects(() => service.resendJob());
  });
});
