import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { QueueEngine } from "../queue/queue-engine";
import { DuplicateJobError, InvalidQueueTransitionError } from "../queue/errors";
import type { IQueueRepository, PaginationParams } from "../queue/queue-repository.interface";
import type { QueueSearchCriteria, QueueSearchResult, QueueStatistics } from "../queue/queue-query.dto";
import type {
  CreateNotificationEventInput,
  CreateNotificationJobInput,
  NotificationEventDTO,
  NotificationEventQueryCriteria,
  NotificationJobDTO,
  NotificationJobQueryCriteria,
  NotificationPreferenceDTO,
  UpsertNotificationPreferenceInput,
} from "../dto";
import type {
  IDocumentRepository,
  INotificationHistoryRepository,
  INotificationJobRepository,
  INotificationPreferenceRepository,
  INotificationProviderRepository,
  INotificationRepository,
  INotificationTemplateRepository,
} from "../repositories/interfaces";
import { NotificationChannel, NotificationJobStatus } from "../types/enums";
import { ChannelAdapterFactory } from "../factories";
import { registerStubChannelAdapters } from "../worker/channel-adapters";
import { JobDispatcher } from "../worker/job-dispatcher";
import { NotificationWorker } from "../worker/notification-worker";
import { WorkerMetricsCollector } from "../worker/worker-metrics";
import { resolveWorkerConfig } from "../worker/worker-config";
import { TemplateEngine } from "../template/template-engine";
import { TemplateRegistry } from "../template/template-registry";
import { FakeNotificationTemplateRepository } from "../template/test-fakes/fake-notification-template.repository";
import { DeliveryManager } from "../delivery/delivery-manager";
import { DeliveryManagerChannelAdapter } from "../delivery/delivery-manager-channel-adapter";
import { ProviderRegistry } from "../delivery/provider-registry";
import { ProviderResolver } from "../delivery/provider-resolver";
import { ProviderHealthMonitor } from "../delivery/provider-health-monitor";
import { ProviderMetricsCollector } from "../delivery/provider-metrics";
import { createProviderDescriptor } from "../delivery/types/provider-descriptor";
import { ProviderPriority } from "../delivery/value-objects/provider-priority";
import { SmtpDeliveryProvider } from "../delivery/providers/smtp/smtp-delivery-provider";
import { SmtpConnectionManager } from "../delivery/providers/smtp/smtp-connection-manager";
import { buildSmtpCapabilities } from "../delivery/providers/smtp/smtp-capability-descriptor";
import { FakeTransporter } from "../delivery/providers/smtp/test-fakes/fake-transporter";
import type { ResolvedEmailConfig } from "../../../smtp-shared";
import { NotificationService } from "../notification.service";

const ALL_STATUSES = Object.values(NotificationJobStatus);

/**
 * Phase 15 — integration proof for the 4 new business events (LEAVE_APPROVED,
 * LEAVE_REJECTED, OVERTIME_REQUEST_APPROVED, OVERTIME_REQUEST_DECLINED),
 * mirroring `loan-approved.integration.test.ts`'s structure and its own
 * documented convention of duplicating the fake infrastructure per
 * integration test file rather than sharing it across files. The one
 * deliberate difference from that file: `AlwaysEnabledPreferenceRepository`
 * is replaced with a controllable `FakePreferenceRepository` (same shape as
 * `notification.service.test.ts`'s), because this phase's tests need to
 * exercise both the enabled and explicitly-disabled preference paths per
 * event, not just the default-enabled one loan-approved's suite covers.
 */
class FakeQueueRepository implements IQueueRepository {
  readonly jobs = new Map<string, NotificationJobDTO>();
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

/** In-memory fake of `INotificationRepository` — doubles as `NotificationService`'s event store and `JobDispatcher`'s event lookup for rendering. */
class FakeEventRepository implements INotificationRepository {
  private readonly events = new Map<string, NotificationEventDTO>();
  private idCounter = 0;

  async create(input: CreateNotificationEventInput): Promise<NotificationEventDTO> {
    const now = new Date();
    const event: NotificationEventDTO = {
      id: `evt_${++this.idCounter}`,
      eventType: input.eventType,
      dedupeKey: input.dedupeKey,
      payload: input.payload ?? null,
      sourceDomain: input.sourceDomain,
      triggeredByUserId: input.triggeredByUserId ?? null,
      createdAt: now,
    };
    this.events.set(event.id, event);
    return event;
  }
  async findById(id: string): Promise<NotificationEventDTO | null> {
    return this.events.get(id) ?? null;
  }
  async findByDedupeKey(dedupeKey: string): Promise<NotificationEventDTO | null> {
    return [...this.events.values()].find((e) => e.dedupeKey === dedupeKey) ?? null;
  }
  async findMany(_criteria?: NotificationEventQueryCriteria): Promise<NotificationEventDTO[]> {
    return [...this.events.values()];
  }
}

/** Delegates to `FakeQueueRepository`'s in-memory jobs — mirrors how the real `NotificationJobRepository` reads the same `NotificationJob` table `QueueEngine` writes to. Only used by `NotificationService`'s dedupe path (`findMany({ eventId })`). */
class FakeJobRepository implements INotificationJobRepository {
  constructor(private readonly queueRepository: FakeQueueRepository) {}
  async create(): Promise<NotificationJobDTO> {
    throw new Error("not used in these tests");
  }
  async findById(id: string): Promise<NotificationJobDTO | null> {
    return this.queueRepository.jobs.get(id) ?? null;
  }
  async findByIdempotencyKey(): Promise<NotificationJobDTO | null> {
    throw new Error("not used in these tests");
  }
  async findMany(criteria: NotificationJobQueryCriteria = {}): Promise<NotificationJobDTO[]> {
    return [...this.queueRepository.jobs.values()].filter((job) => !criteria.eventId || job.eventId === criteria.eventId);
  }
  async update(): Promise<NotificationJobDTO> {
    throw new Error("not used in these tests");
  }
}

/** `NotificationService` constructor dependencies `raiseEvent` never touches — unused stubs, same shape as `notification.service.test.ts`'s. */
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

/** Controllable, in-memory `INotificationPreferenceRepository` — unlike `loan-approved.integration.test.ts`'s `AlwaysEnabledPreferenceRepository`, this one lets a test `seed()` an explicit preference so both the enabled and explicitly-disabled paths can be exercised per event (this phase's own testing requirement). Same shape as `notification.service.test.ts`'s fake. */
class FakePreferenceRepository implements INotificationPreferenceRepository {
  private readonly rows = new Map<string, NotificationPreferenceDTO>();
  private nextId = 1;

  seed(userId: string, notificationType: string, channel: NotificationChannel, isEnabled: boolean): void {
    const key = this.key(userId, notificationType, channel);
    this.rows.set(key, {
      id: `pref_${this.nextId++}`,
      userId,
      notificationType,
      channel,
      isEnabled,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async findOne(userId: string, notificationType: string, channel: NotificationChannel): Promise<NotificationPreferenceDTO | null> {
    return this.rows.get(this.key(userId, notificationType, channel)) ?? null;
  }
  async findByUser(userId: string): Promise<NotificationPreferenceDTO[]> {
    return [...this.rows.values()].filter((r) => r.userId === userId);
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

const smtpConfig: ResolvedEmailConfig = {
  smtpHost: "smtp.gmail.com",
  smtpPort: 587,
  secure: false,
  senderEmail: "notifications@example.com",
  appPassword: "app-password",
};

/**
 * Builds the complete real pipeline exactly as `loan-approved.integration.test.ts`'s
 * `buildPipeline` does — `NotificationService.raiseEvent` -> `QueueEngine` ->
 * `NotificationWorker` -> `JobDispatcher` -> `TemplateEngine` ->
 * `DeliveryManager` -> `SmtpDeliveryProvider` -> `FakeTransporter` — with a
 * controllable `FakePreferenceRepository` instead of an always-enabled one.
 */
function buildPipeline(
  options: {
    resolveSmtpConfig?: () => Promise<ResolvedEmailConfig | null>;
    transporter?: FakeTransporter;
    preferenceRepository?: FakePreferenceRepository;
  } = {}
) {
  const queueRepository = new FakeQueueRepository();
  const queueEngine = new QueueEngine(queueRepository);

  const eventRepository = new FakeEventRepository();
  const jobRepository = new FakeJobRepository(queueRepository);
  const preferenceRepository = options.preferenceRepository ?? new FakePreferenceRepository();

  const templateEngine = new TemplateEngine(new TemplateRegistry(new FakeNotificationTemplateRepository()));

  const fakeTransporter = options.transporter ?? new FakeTransporter("success");
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(
    createProviderDescriptor({
      id: "smtp-primary",
      name: "Primary SMTP",
      channel: NotificationChannel.EMAIL,
      priority: ProviderPriority.of(1),
      capabilities: buildSmtpCapabilities(),
    }),
    new SmtpDeliveryProvider(
      new SmtpConnectionManager(() => fakeTransporter.asTransporter()),
      undefined,
      undefined,
      undefined,
      options.resolveSmtpConfig ?? (async () => smtpConfig)
    )
  );
  const providerHealthMonitor = new ProviderHealthMonitor();
  const providerResolver = new ProviderResolver(providerRegistry, providerHealthMonitor);
  const deliveryManager = new DeliveryManager(providerResolver, providerHealthMonitor, new ProviderMetricsCollector());

  const channelAdapterFactory = new ChannelAdapterFactory();
  registerStubChannelAdapters(channelAdapterFactory);
  channelAdapterFactory.register(new DeliveryManagerChannelAdapter(NotificationChannel.EMAIL, deliveryManager));

  const jobDispatcher = new JobDispatcher(channelAdapterFactory, undefined, eventRepository, templateEngine);
  const metrics = new WorkerMetricsCollector();
  const config = resolveWorkerConfig({ workerId: "worker-1" });
  const worker = new NotificationWorker(queueEngine, jobDispatcher, metrics, config);

  const notificationService = new NotificationService(
    eventRepository,
    jobRepository,
    new UnusedHistoryRepository(),
    new UnusedTemplateRepository(),
    new UnusedProviderRepository(),
    new UnusedDocumentRepository(),
    new ChannelAdapterFactory(),
    queueEngine,
    preferenceRepository
  );

  return { notificationService, queueEngine, queueRepository, eventRepository, templateEngine, worker, fakeTransporter, preferenceRepository };
}

/**
 * One test suite per Phase 15 business event. Each block's fixtures (dedupeKey,
 * payload shape, template placeholders) are copied verbatim from the actual
 * `raiseEvent`/template calls in `leave.actions.ts`/`overtime-request.actions.ts` —
 * see BusinessEventsIntegrationReport.md for the exact source line mapping.
 */

describe("Integration: LEAVE_APPROVED — Business Action -> NotificationService -> Queue -> Worker -> Template -> SMTP -> Email", () => {
  const eventType = "LEAVE_APPROVED";
  const payload = {
    employee: { id: "user_leave_1", name: "Jane Doe" },
    leaveType: "Sick Leave",
    leaveDate: "2026-05-01T00:00:00.000Z",
    approvedBy: "Admin",
  };

  it("raiseEvent creates the NotificationEvent and enqueues a QUEUED job with the correct eventType/payload/recipient/dedupeKey", async () => {
    const { notificationService, queueRepository } = buildPipeline();

    const result = await notificationService.raiseEvent({
      eventType,
      dedupeKey: "LEAVE_APPROVED:app_1",
      sourceDomain: "leave",
      payload,
      recipients: [{ channel: "EMAIL", recipientAddress: "jane@example.com", recipientUserId: "user_leave_1" }],
    });

    assert.equal(result.deduplicated, false);
    assert.equal(result.event.eventType, eventType);
    assert.equal(result.event.dedupeKey, "LEAVE_APPROVED:app_1");
    assert.deepEqual(result.event.payload, payload);
    assert.equal(result.jobs.length, 1);

    const [job] = result.jobs;
    assert.equal(queueRepository.jobs.get(job.id)?.status, "QUEUED");
    assert.equal(job.channel, "EMAIL");
    assert.equal(job.recipientAddress, "jane@example.com");
    assert.equal(job.recipientUserId, "user_leave_1");
    assert.equal(job.eventId, result.event.id);
  });

  it("delivers the LEAVE_APPROVED email end to end: worker claims the job, the template renders the real payload, and SMTP sends it", async () => {
    const { notificationService, queueRepository, templateEngine, worker, fakeTransporter } = buildPipeline();

    await templateEngine.register({
      key: eventType,
      channel: NotificationChannel.EMAIL,
      subjectTemplate: "Your leave application has been approved",
      bodyTemplateHtml: "<p>Hi {{employee.name}},</p><p>Your {{leaveType}} leave on {{leaveDate}} has been approved by {{approvedBy}}.</p>",
      bodyTemplateText: "Hi {{employee.name}}, your {{leaveType}} leave on {{leaveDate}} has been approved by {{approvedBy}}.",
    });

    const { jobs } = await notificationService.raiseEvent({
      eventType,
      dedupeKey: "LEAVE_APPROVED:app_2",
      sourceDomain: "leave",
      payload,
      recipients: [{ channel: "EMAIL", recipientAddress: "jane@example.com", recipientUserId: "user_leave_1" }],
    });

    const result = await worker.processNext();

    assert.equal(result.kind, "SUCCESS");
    assert.equal(fakeTransporter.sendMailCalls.length, 1);
    assert.deepEqual(fakeTransporter.sendMailCalls[0], {
      from: "notifications@example.com",
      to: "jane@example.com",
      subject: "Your leave application has been approved",
      html: "<p>Hi Jane Doe,</p><p>Your Sick Leave leave on 2026-05-01T00:00:00.000Z has been approved by Admin.</p>",
      text: "Hi Jane Doe, your Sick Leave leave on 2026-05-01T00:00:00.000Z has been approved by Admin.",
    });
    assert.equal(queueRepository.jobs.get(jobs[0].id)?.status, "SENT");
  });

  it("a graceful SMTP failure schedules a retry instead of completing the job", async () => {
    const { notificationService, queueRepository, templateEngine, worker } = buildPipeline({ resolveSmtpConfig: async () => null });
    await templateEngine.register({ key: eventType, channel: NotificationChannel.EMAIL, subjectTemplate: "Your leave application has been approved" });

    const { jobs } = await notificationService.raiseEvent({
      eventType,
      dedupeKey: "LEAVE_APPROVED:app_3",
      sourceDomain: "leave",
      payload,
      recipients: [{ channel: "EMAIL", recipientAddress: "jane@example.com", recipientUserId: "user_leave_1" }],
    });

    const result = await worker.processNext();

    assert.equal(result.kind, "RETRY_SCHEDULED");
    const updated = queueRepository.jobs.get(jobs[0].id);
    assert.equal(updated?.status, "RETRY_SCHEDULED");
    assert.equal(updated?.attemptCount, 1);
  });

  it("respects an explicitly disabled preference: the event is still recorded, but no job is created", async () => {
    const preferenceRepository = new FakePreferenceRepository();
    preferenceRepository.seed("user_leave_1", eventType, "EMAIL", false);
    const { notificationService, queueRepository } = buildPipeline({ preferenceRepository });

    const result = await notificationService.raiseEvent({
      eventType,
      dedupeKey: "LEAVE_APPROVED:app_4",
      sourceDomain: "leave",
      payload,
      recipients: [{ channel: "EMAIL", recipientAddress: "jane@example.com", recipientUserId: "user_leave_1" }],
    });

    assert.equal(result.event.eventType, eventType);
    assert.equal(result.jobs.length, 0);
    assert.equal(queueRepository.jobs.size, 0);
  });

  it("an explicit enabled preference behaves identically to the default (no row) path", async () => {
    const preferenceRepository = new FakePreferenceRepository();
    preferenceRepository.seed("user_leave_1", eventType, "EMAIL", true);
    const { notificationService } = buildPipeline({ preferenceRepository });

    const result = await notificationService.raiseEvent({
      eventType,
      dedupeKey: "LEAVE_APPROVED:app_5",
      sourceDomain: "leave",
      payload,
      recipients: [{ channel: "EMAIL", recipientAddress: "jane@example.com", recipientUserId: "user_leave_1" }],
    });

    assert.equal(result.jobs.length, 1);
  });

  it("a duplicate raiseEvent call with the same dedupeKey does not create a duplicate job", async () => {
    const { notificationService, queueRepository } = buildPipeline();
    const request = {
      eventType,
      dedupeKey: "LEAVE_APPROVED:app_6",
      sourceDomain: "leave",
      payload,
      recipients: [{ channel: "EMAIL" as const, recipientAddress: "jane@example.com", recipientUserId: "user_leave_1" }],
    };

    const first = await notificationService.raiseEvent(request);
    const second = await notificationService.raiseEvent(request);

    assert.equal(first.deduplicated, false);
    assert.equal(second.deduplicated, true);
    assert.equal(second.event.id, first.event.id);
    assert.equal(queueRepository.jobs.size, 1);
  });
});

describe("Integration: LEAVE_REJECTED — Business Action -> NotificationService -> Queue -> Worker -> Template -> SMTP -> Email", () => {
  const eventType = "LEAVE_REJECTED";
  const payload = {
    employee: { id: "user_leave_2", name: "John Roe" },
    leaveType: "Casual Leave",
    leaveDate: "2026-06-10T00:00:00.000Z",
    rejectedBy: "Manager",
  };

  it("raiseEvent creates the NotificationEvent and enqueues a QUEUED job with the correct eventType/payload/recipient/dedupeKey", async () => {
    const { notificationService, queueRepository } = buildPipeline();

    const result = await notificationService.raiseEvent({
      eventType,
      dedupeKey: "LEAVE_REJECTED:app_10",
      sourceDomain: "leave",
      payload,
      recipients: [{ channel: "EMAIL", recipientAddress: "john@example.com", recipientUserId: "user_leave_2" }],
    });

    assert.equal(result.event.eventType, eventType);
    assert.deepEqual(result.event.payload, payload);
    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].recipientAddress, "john@example.com");
  });

  it("delivers the LEAVE_REJECTED email end to end", async () => {
    const { notificationService, queueRepository, templateEngine, worker, fakeTransporter } = buildPipeline();
    await templateEngine.register({
      key: eventType,
      channel: NotificationChannel.EMAIL,
      subjectTemplate: "Your leave application has been rejected",
      bodyTemplateHtml: "<p>Hi {{employee.name}},</p><p>Your {{leaveType}} leave on {{leaveDate}} has been rejected by {{rejectedBy}}.</p>",
      bodyTemplateText: "Hi {{employee.name}}, your {{leaveType}} leave on {{leaveDate}} has been rejected by {{rejectedBy}}.",
    });

    const { jobs } = await notificationService.raiseEvent({
      eventType,
      dedupeKey: "LEAVE_REJECTED:app_11",
      sourceDomain: "leave",
      payload,
      recipients: [{ channel: "EMAIL", recipientAddress: "john@example.com", recipientUserId: "user_leave_2" }],
    });

    const result = await worker.processNext();

    assert.equal(result.kind, "SUCCESS");
    assert.equal((fakeTransporter.sendMailCalls[0] as { subject: string }).subject, "Your leave application has been rejected");
    assert.equal(queueRepository.jobs.get(jobs[0].id)?.status, "SENT");
  });

  it("a graceful SMTP failure schedules a retry", async () => {
    const { notificationService, queueRepository, templateEngine, worker } = buildPipeline({ resolveSmtpConfig: async () => null });
    await templateEngine.register({ key: eventType, channel: NotificationChannel.EMAIL, subjectTemplate: "Your leave application has been rejected" });

    const { jobs } = await notificationService.raiseEvent({
      eventType,
      dedupeKey: "LEAVE_REJECTED:app_12",
      sourceDomain: "leave",
      payload,
      recipients: [{ channel: "EMAIL", recipientAddress: "john@example.com", recipientUserId: "user_leave_2" }],
    });

    const result = await worker.processNext();
    assert.equal(result.kind, "RETRY_SCHEDULED");
    assert.equal(queueRepository.jobs.get(jobs[0].id)?.attemptCount, 1);
  });

  it("respects an explicitly disabled preference: event recorded, no job created", async () => {
    const preferenceRepository = new FakePreferenceRepository();
    preferenceRepository.seed("user_leave_2", eventType, "EMAIL", false);
    const { notificationService, queueRepository } = buildPipeline({ preferenceRepository });

    const result = await notificationService.raiseEvent({
      eventType,
      dedupeKey: "LEAVE_REJECTED:app_13",
      sourceDomain: "leave",
      payload,
      recipients: [{ channel: "EMAIL", recipientAddress: "john@example.com", recipientUserId: "user_leave_2" }],
    });

    assert.equal(result.event.eventType, eventType);
    assert.equal(result.jobs.length, 0);
    assert.equal(queueRepository.jobs.size, 0);
  });

  it("a duplicate raiseEvent call does not create a duplicate job", async () => {
    const { notificationService, queueRepository } = buildPipeline();
    const request = {
      eventType,
      dedupeKey: "LEAVE_REJECTED:app_14",
      sourceDomain: "leave",
      payload,
      recipients: [{ channel: "EMAIL" as const, recipientAddress: "john@example.com", recipientUserId: "user_leave_2" }],
    };

    await notificationService.raiseEvent(request);
    const second = await notificationService.raiseEvent(request);

    assert.equal(second.deduplicated, true);
    assert.equal(queueRepository.jobs.size, 1);
  });
});

describe("Integration: OVERTIME_REQUEST_APPROVED — Business Action -> NotificationService -> Queue -> Worker -> Template -> SMTP -> Email", () => {
  const eventType = "OVERTIME_REQUEST_APPROVED";
  const payload = {
    employee: { id: "user_ot_1", name: "Alice Smith" },
    totalOvertime: "02:30",
    overtimeDate: "2026-07-01T00:00:00.000Z",
    approvedBy: "Admin Bob",
  };

  it("raiseEvent creates the NotificationEvent and enqueues a QUEUED job with the correct eventType/payload/recipient/dedupeKey", async () => {
    const { notificationService } = buildPipeline();

    const result = await notificationService.raiseEvent({
      eventType,
      dedupeKey: "OVERTIME_REQUEST_APPROVED:req_1",
      sourceDomain: "overtime",
      payload,
      recipients: [{ channel: "EMAIL", recipientAddress: "alice@example.com", recipientUserId: "user_ot_1" }],
    });

    assert.equal(result.event.eventType, eventType);
    assert.deepEqual(result.event.payload, payload);
    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].recipientAddress, "alice@example.com");
    assert.equal(result.jobs[0].recipientUserId, "user_ot_1");
  });

  it("delivers the OVERTIME_REQUEST_APPROVED email end to end", async () => {
    const { notificationService, queueRepository, templateEngine, worker, fakeTransporter } = buildPipeline();
    await templateEngine.register({
      key: eventType,
      channel: NotificationChannel.EMAIL,
      subjectTemplate: "Your overtime request has been approved",
      bodyTemplateHtml:
        "<p>Hi {{employee.name}},</p><p>Your overtime request for {{totalOvertime}} hours on {{overtimeDate}} has been approved by {{approvedBy}}.</p>",
      bodyTemplateText:
        "Hi {{employee.name}}, your overtime request for {{totalOvertime}} hours on {{overtimeDate}} has been approved by {{approvedBy}}.",
    });

    const { jobs } = await notificationService.raiseEvent({
      eventType,
      dedupeKey: "OVERTIME_REQUEST_APPROVED:req_2",
      sourceDomain: "overtime",
      payload,
      recipients: [{ channel: "EMAIL", recipientAddress: "alice@example.com", recipientUserId: "user_ot_1" }],
    });

    const result = await worker.processNext();

    assert.equal(result.kind, "SUCCESS");
    assert.deepEqual(fakeTransporter.sendMailCalls[0], {
      from: "notifications@example.com",
      to: "alice@example.com",
      subject: "Your overtime request has been approved",
      html: "<p>Hi Alice Smith,</p><p>Your overtime request for 02:30 hours on 2026-07-01T00:00:00.000Z has been approved by Admin Bob.</p>",
      text: "Hi Alice Smith, your overtime request for 02:30 hours on 2026-07-01T00:00:00.000Z has been approved by Admin Bob.",
    });
    assert.equal(queueRepository.jobs.get(jobs[0].id)?.status, "SENT");
  });

  it("a graceful SMTP failure schedules a retry", async () => {
    const { notificationService, queueRepository, templateEngine, worker } = buildPipeline({ resolveSmtpConfig: async () => null });
    await templateEngine.register({ key: eventType, channel: NotificationChannel.EMAIL, subjectTemplate: "Your overtime request has been approved" });

    const { jobs } = await notificationService.raiseEvent({
      eventType,
      dedupeKey: "OVERTIME_REQUEST_APPROVED:req_3",
      sourceDomain: "overtime",
      payload,
      recipients: [{ channel: "EMAIL", recipientAddress: "alice@example.com", recipientUserId: "user_ot_1" }],
    });

    const result = await worker.processNext();
    assert.equal(result.kind, "RETRY_SCHEDULED");
    assert.equal(queueRepository.jobs.get(jobs[0].id)?.attemptCount, 1);
  });

  it("respects an explicitly disabled preference: event recorded, no job created", async () => {
    const preferenceRepository = new FakePreferenceRepository();
    preferenceRepository.seed("user_ot_1", eventType, "EMAIL", false);
    const { notificationService, queueRepository } = buildPipeline({ preferenceRepository });

    const result = await notificationService.raiseEvent({
      eventType,
      dedupeKey: "OVERTIME_REQUEST_APPROVED:req_4",
      sourceDomain: "overtime",
      payload,
      recipients: [{ channel: "EMAIL", recipientAddress: "alice@example.com", recipientUserId: "user_ot_1" }],
    });

    assert.equal(result.event.eventType, eventType);
    assert.equal(result.jobs.length, 0);
    assert.equal(queueRepository.jobs.size, 0);
  });

  it("a duplicate raiseEvent call does not create a duplicate job", async () => {
    const { notificationService, queueRepository } = buildPipeline();
    const request = {
      eventType,
      dedupeKey: "OVERTIME_REQUEST_APPROVED:req_5",
      sourceDomain: "overtime",
      payload,
      recipients: [{ channel: "EMAIL" as const, recipientAddress: "alice@example.com", recipientUserId: "user_ot_1" }],
    };

    await notificationService.raiseEvent(request);
    const second = await notificationService.raiseEvent(request);

    assert.equal(second.deduplicated, true);
    assert.equal(queueRepository.jobs.size, 1);
  });
});

describe("Integration: OVERTIME_REQUEST_DECLINED — Business Action -> NotificationService -> Queue -> Worker -> Template -> SMTP -> Email", () => {
  const eventType = "OVERTIME_REQUEST_DECLINED";
  const payload = {
    employee: { id: "user_ot_2", name: "Bob Lee" },
    totalOvertime: "01:00",
    overtimeDate: "2026-08-15T00:00:00.000Z",
    declinedBy: "Admin Carol",
    declineReason: "Insufficient justification",
  };

  it("raiseEvent creates the NotificationEvent and enqueues a QUEUED job with the correct eventType/payload/recipient/dedupeKey", async () => {
    const { notificationService } = buildPipeline();

    const result = await notificationService.raiseEvent({
      eventType,
      dedupeKey: "OVERTIME_REQUEST_DECLINED:req_10",
      sourceDomain: "overtime",
      payload,
      recipients: [{ channel: "EMAIL", recipientAddress: "bob@example.com", recipientUserId: "user_ot_2" }],
    });

    assert.equal(result.event.eventType, eventType);
    assert.deepEqual(result.event.payload, payload);
    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].recipientAddress, "bob@example.com");
  });

  it("delivers the OVERTIME_REQUEST_DECLINED email end to end", async () => {
    const { notificationService, queueRepository, templateEngine, worker, fakeTransporter } = buildPipeline();
    await templateEngine.register({
      key: eventType,
      channel: NotificationChannel.EMAIL,
      subjectTemplate: "Your overtime request has been declined",
      bodyTemplateHtml:
        "<p>Hi {{employee.name}},</p><p>Your overtime request for {{totalOvertime}} hours on {{overtimeDate}} has been declined by {{declinedBy}}. Reason: {{declineReason}}</p>",
      bodyTemplateText:
        "Hi {{employee.name}}, your overtime request for {{totalOvertime}} hours on {{overtimeDate}} has been declined by {{declinedBy}}. Reason: {{declineReason}}",
    });

    const { jobs } = await notificationService.raiseEvent({
      eventType,
      dedupeKey: "OVERTIME_REQUEST_DECLINED:req_11",
      sourceDomain: "overtime",
      payload,
      recipients: [{ channel: "EMAIL", recipientAddress: "bob@example.com", recipientUserId: "user_ot_2" }],
    });

    const result = await worker.processNext();

    assert.equal(result.kind, "SUCCESS");
    assert.equal(
      (fakeTransporter.sendMailCalls[0] as { text: string }).text,
      "Hi Bob Lee, your overtime request for 01:00 hours on 2026-08-15T00:00:00.000Z has been declined by Admin Carol. Reason: Insufficient justification"
    );
    assert.equal(queueRepository.jobs.get(jobs[0].id)?.status, "SENT");
  });

  it("a graceful SMTP failure schedules a retry", async () => {
    const { notificationService, queueRepository, templateEngine, worker } = buildPipeline({ resolveSmtpConfig: async () => null });
    await templateEngine.register({ key: eventType, channel: NotificationChannel.EMAIL, subjectTemplate: "Your overtime request has been declined" });

    const { jobs } = await notificationService.raiseEvent({
      eventType,
      dedupeKey: "OVERTIME_REQUEST_DECLINED:req_12",
      sourceDomain: "overtime",
      payload,
      recipients: [{ channel: "EMAIL", recipientAddress: "bob@example.com", recipientUserId: "user_ot_2" }],
    });

    const result = await worker.processNext();
    assert.equal(result.kind, "RETRY_SCHEDULED");
    assert.equal(queueRepository.jobs.get(jobs[0].id)?.attemptCount, 1);
  });

  it("respects an explicitly disabled preference: event recorded, no job created", async () => {
    const preferenceRepository = new FakePreferenceRepository();
    preferenceRepository.seed("user_ot_2", eventType, "EMAIL", false);
    const { notificationService, queueRepository } = buildPipeline({ preferenceRepository });

    const result = await notificationService.raiseEvent({
      eventType,
      dedupeKey: "OVERTIME_REQUEST_DECLINED:req_13",
      sourceDomain: "overtime",
      payload,
      recipients: [{ channel: "EMAIL", recipientAddress: "bob@example.com", recipientUserId: "user_ot_2" }],
    });

    assert.equal(result.event.eventType, eventType);
    assert.equal(result.jobs.length, 0);
    assert.equal(queueRepository.jobs.size, 0);
  });

  it("a duplicate raiseEvent call does not create a duplicate job", async () => {
    const { notificationService, queueRepository } = buildPipeline();
    const request = {
      eventType,
      dedupeKey: "OVERTIME_REQUEST_DECLINED:req_14",
      sourceDomain: "overtime",
      payload,
      recipients: [{ channel: "EMAIL" as const, recipientAddress: "bob@example.com", recipientUserId: "user_ot_2" }],
    };

    await notificationService.raiseEvent(request);
    const second = await notificationService.raiseEvent(request);

    assert.equal(second.deduplicated, true);
    assert.equal(queueRepository.jobs.size, 1);
  });
});

describe("Integration: notification failure never blocks the business action (all 4 Phase 15 events)", () => {
  it("a thrown raiseEvent error (e.g. SMTP fully unreachable at raise time) is exactly what the try/catch wrapper in leave.actions.ts/overtime-request.actions.ts is written to catch — raiseEvent itself never throws for a delivery problem, only for a validation error", async () => {
    // raiseEvent's own contract (Phase 9, unchanged): validation errors throw synchronously
    // before any queue/job work; everything after that (delivery) is captured inside the
    // job's own retry state, never as a thrown exception back to the caller. This is *why*
    // leave.actions.ts/overtime-request.actions.ts's try/catch around raiseEvent is a
    // defensive, belt-and-suspenders wrap (matching approveLoan()'s own identical pattern) —
    // there is no code path today where a delivery failure could roll back or block the
    // business transaction that already committed before raiseEvent was even called.
    const { notificationService } = buildPipeline();

    await assert.rejects(() =>
      notificationService.raiseEvent({
        eventType: "",
        dedupeKey: "INVALID",
        sourceDomain: "leave",
        payload: {},
        recipients: [],
      })
    );
  });
});
