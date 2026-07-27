import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { QueueEngine } from "../queue/queue-engine";
import { DuplicateJobError, InvalidQueueTransitionError } from "../queue/errors";
import type { IQueueRepository, PaginationParams } from "../queue/queue-repository.interface";
import type { QueueSearchCriteria, QueueSearchResult, QueueStatistics } from "../queue/queue-query.dto";
import type { CreateNotificationJobInput, NotificationJobDTO, NotificationEventDTO, CreateNotificationEventInput, NotificationEventQueryCriteria } from "../dto";
import type { INotificationRepository } from "../repositories/interfaces";
import { NotificationJobStatus, NotificationChannel } from "../types/enums";
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

const ALL_STATUSES = Object.values(NotificationJobStatus);

/**
 * In-memory fake of `IQueueRepository` — verbatim copy of `queue-engine.test.ts`'s
 * own fake (see that file's doc comment for why: this project's only
 * `DATABASE_URL` is a shared, live Neon instance a test must never touch).
 * Duplicated here rather than imported/shared, since it's a private,
 * unexported class in that test file and this is a different module
 * (`integration/`, spanning queue+worker+template+delivery) — see
 * EngineIntegrationReport.md's "Testing" section.
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

/** In-memory fake of `INotificationRepository` — a job's associated `NotificationEvent` (eventType + payload), which `JobDispatcher.renderContent()` resolves. */
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

const smtpConfig: ResolvedEmailConfig = {
  smtpHost: "smtp.gmail.com",
  smtpPort: 587,
  secure: false,
  senderEmail: "notifications@example.com",
  appPassword: "app-password",
};

/** Builds one complete, real (non-mocked-except-at-the-network-edge) pipeline: QueueEngine -> NotificationWorker -> JobDispatcher -> TemplateEngine -> DeliveryManager -> SmtpDeliveryProvider -> FakeTransporter. */
function buildPipeline(options: { resolveSmtpConfig?: () => Promise<ResolvedEmailConfig | null>; transporter?: FakeTransporter } = {}) {
  const queueRepository = new FakeQueueRepository();
  const queueEngine = new QueueEngine(queueRepository);

  const eventRepository = new FakeEventRepository();

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

  // Exactly Phase 8's wiring: every channel a StubChannelAdapter, EMAIL
  // replaced with DeliveryManagerChannelAdapter — see create-worker-runtime.ts.
  const channelAdapterFactory = new ChannelAdapterFactory();
  registerStubChannelAdapters(channelAdapterFactory);
  channelAdapterFactory.register(new DeliveryManagerChannelAdapter(NotificationChannel.EMAIL, deliveryManager));

  const jobDispatcher = new JobDispatcher(channelAdapterFactory, undefined, eventRepository, templateEngine);
  const metrics = new WorkerMetricsCollector();
  const config = resolveWorkerConfig({ workerId: "worker-1" });
  const worker = new NotificationWorker(queueEngine, jobDispatcher, metrics, config);

  return { queueEngine, queueRepository, eventRepository, templateEngine, worker, metrics, fakeTransporter };
}

describe("Integration: Queue -> Worker -> TemplateEngine -> DeliveryManager -> SMTP Provider", () => {
  it("delivers an enqueued EMAIL job end to end, with the template rendered before SMTP send, and marks the job SENT", async () => {
    const { queueEngine, queueRepository, eventRepository, templateEngine, worker, fakeTransporter } = buildPipeline();

    await templateEngine.register({
      key: "LOAN_APPROVED",
      channel: NotificationChannel.EMAIL,
      subjectTemplate: "Loan approved for {{employee.name}}",
      bodyTemplateHtml: "<p>Hi {{employee.name}}, your loan was approved.</p>",
      bodyTemplateText: "Hi {{employee.name}}, your loan was approved.",
    });

    const event = await eventRepository.create({
      eventType: "LOAN_APPROVED",
      dedupeKey: "LOAN_APPROVED:loan_1",
      sourceDomain: "loan",
      payload: { employee: { name: "Jane Doe" } },
    });

    const job = await queueEngine.enqueue({
      eventId: event.id,
      dedupeKey: event.dedupeKey,
      channel: NotificationChannel.EMAIL,
      recipientAddress: "jane@example.com",
    });

    const result = await worker.processNext();

    assert.equal(result.kind, "SUCCESS");
    assert.equal(fakeTransporter.sendMailCalls.length, 1);
    assert.deepEqual(fakeTransporter.sendMailCalls[0], {
      from: "notifications@example.com",
      to: "jane@example.com",
      subject: "Loan approved for Jane Doe",
      html: "<p>Hi Jane Doe, your loan was approved.</p>",
      text: "Hi Jane Doe, your loan was approved.",
    });

    // QueueEngine behavior preserved: complete() -> markSent() -> SENT (archive() to COMPLETED is a separate, later step no caller invokes here).
    assert.equal(queueRepository.jobs.get(job.id)?.status, "SENT");
  });

  it("preserves retry behavior: an unconfigured SMTP provider reports a graceful (non-thrown) failure, and the job is scheduled for retry, not marked complete", async () => {
    const { queueEngine, queueRepository, eventRepository, templateEngine, worker } = buildPipeline({ resolveSmtpConfig: async () => null });

    await templateEngine.register({ key: "LOAN_APPROVED", channel: NotificationChannel.EMAIL, subjectTemplate: "Loan approved" });
    const event = await eventRepository.create({
      eventType: "LOAN_APPROVED",
      dedupeKey: "LOAN_APPROVED:loan_2",
      sourceDomain: "loan",
      payload: {},
    });
    const job = await queueEngine.enqueue({
      eventId: event.id,
      dedupeKey: event.dedupeKey,
      channel: NotificationChannel.EMAIL,
      recipientAddress: "jane@example.com",
    });

    const result = await worker.processNext();

    assert.equal(result.kind, "RETRY_SCHEDULED");
    const updated = queueRepository.jobs.get(job.id);
    assert.equal(updated?.status, "RETRY_SCHEDULED");
    assert.equal(updated?.attemptCount, 1);
  });

  it("preserves WorkerRuntime/JobDispatcher behavior for every non-EMAIL channel: still a StubChannelAdapter, still ProviderNotImplementedError, still retries", async () => {
    const { queueEngine, queueRepository, eventRepository, worker } = buildPipeline();

    const event = await eventRepository.create({
      eventType: "SOME_SMS_EVENT",
      dedupeKey: "SOME_SMS_EVENT:1",
      sourceDomain: "loan",
      payload: {},
    });
    const job = await queueEngine.enqueue({
      eventId: event.id,
      dedupeKey: event.dedupeKey,
      channel: NotificationChannel.SMS,
      recipientAddress: "+10000000000",
    });

    const result = await worker.processNext();

    assert.equal(result.kind, "RETRY_SCHEDULED");
    assert.equal(queueRepository.jobs.get(job.id)?.status, "RETRY_SCHEDULED");
  });
});
