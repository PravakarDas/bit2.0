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
import { WorkerRuntime } from "../worker/worker-runtime";
import { WorkerLifecycleManager } from "../worker/worker-lifecycle-manager";
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

/** Verbatim copy of the same fake this `integration/` folder's other test files already use — see loan-approved.integration.test.ts's doc comment for why it's duplicated, not shared. */
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

/** Every recipient has no explicit preference in these tests — the default-enabled path (Phase 13) — so delivery proceeds exactly as it did before preferences existed. */
class AlwaysEnabledPreferenceRepository implements INotificationPreferenceRepository {
  async findOne(): Promise<null> {
    return null;
  }
  async findByUser(): Promise<never[]> {
    return [];
  }
  async upsert(): Promise<never> {
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

const smtpConfig: ResolvedEmailConfig = {
  smtpHost: "smtp.gmail.com",
  smtpPort: 587,
  secure: false,
  senderEmail: "notifications@example.com",
  appPassword: "app-password",
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(predicate: () => boolean, timeoutMs: number, stepMs = 10): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(stepMs);
  }
  throw new Error(`waitUntil timed out after ${timeoutMs}ms`);
}

/**
 * The full production shape (Phase 11): `WorkerLifecycleManager` wrapping a
 * `WorkerRuntime` that polls on its own — nothing in these tests calls
 * `worker.processNext()` manually, unlike Phase 10's integration test. This
 * is what actually distinguishes "the pipeline works" (Phase 10) from "the
 * pipeline runs unattended in production" (this phase).
 */
function buildPipeline(options: { transporter?: FakeTransporter } = {}) {
  const queueRepository = new FakeQueueRepository();
  const queueEngine = new QueueEngine(queueRepository);

  const eventRepository = new FakeEventRepository();
  const jobRepository = new FakeJobRepository(queueRepository);

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
    new SmtpDeliveryProvider(new SmtpConnectionManager(() => fakeTransporter.asTransporter()), undefined, undefined, undefined, async () => smtpConfig)
  );
  const providerHealthMonitor = new ProviderHealthMonitor();
  const providerResolver = new ProviderResolver(providerRegistry, providerHealthMonitor);
  const deliveryManager = new DeliveryManager(providerResolver, providerHealthMonitor, new ProviderMetricsCollector());

  const channelAdapterFactory = new ChannelAdapterFactory();
  registerStubChannelAdapters(channelAdapterFactory);
  channelAdapterFactory.register(new DeliveryManagerChannelAdapter(NotificationChannel.EMAIL, deliveryManager));

  const jobDispatcher = new JobDispatcher(channelAdapterFactory, undefined, eventRepository, templateEngine);
  const metrics = new WorkerMetricsCollector();
  // Fast poll/lease-renewal intervals — this is a test, not production (see production-worker.ts for the real, settings-driven values).
  const config = resolveWorkerConfig({ workerId: "worker-1", pollIntervalMs: 15, leaseRenewalIntervalMs: 50 });
  const worker = new NotificationWorker(queueEngine, jobDispatcher, metrics, config);
  const runtime = new WorkerRuntime(worker, metrics, config);

  const lifecycleManager = new WorkerLifecycleManager({
    runtime,
    queueEngine,
    leaseDurationMs: 300_000,
    reaperIntervalMs: 10_000, // not the focus of this file — see worker-lifecycle-manager.test.ts for dedicated reaper tests
  });

  const notificationService = new NotificationService(
    eventRepository,
    jobRepository,
    new UnusedHistoryRepository(),
    new UnusedTemplateRepository(),
    new UnusedProviderRepository(),
    new UnusedDocumentRepository(),
    new ChannelAdapterFactory(),
    queueEngine,
    new AlwaysEnabledPreferenceRepository()
  );

  return { notificationService, lifecycleManager, runtime, queueRepository, templateEngine, fakeTransporter };
}

describe("Integration: Application Start -> Worker Starts -> Queued Loan Notification -> Worker Claims Job -> Template Render -> SMTP -> Email -> Worker Continues Running", () => {
  it("processes a notification raised after startup automatically, with no manual processNext() call, and keeps running for a second one", async () => {
    const { notificationService, lifecycleManager, runtime, queueRepository, templateEngine, fakeTransporter } = buildPipeline();

    await templateEngine.register({
      key: "LOAN_APPROVED",
      channel: NotificationChannel.EMAIL,
      subjectTemplate: "Your loan has been approved",
      bodyTemplateHtml: "<p>Hi {{employee.name}}, ৳{{amount}} approved.</p>",
      bodyTemplateText: "Hi {{employee.name}}, ৳{{amount}} approved.",
    });

    // Application Start -> Worker Starts.
    await lifecycleManager.start();
    assert.equal(lifecycleManager.isStarted(), true);
    assert.equal(runtime.status(), "IDLE");

    try {
      // Queued Loan Notification (the business action's own entry point).
      const { jobs } = await notificationService.raiseEvent({
        eventType: "LOAN_APPROVED",
        dedupeKey: "LOAN_APPROVED:loan_1",
        sourceDomain: "loan",
        payload: { employee: { id: "user_1", name: "Jane Doe" }, amount: 50000, approvedBy: "Admin Alex" },
        recipients: [{ channel: "EMAIL", recipientAddress: "jane@example.com", recipientUserId: "user_1" }],
      });

      // Worker Claims Job -> Template Render -> SMTP -> Email — all via the runtime's own poll loop.
      await waitUntil(() => queueRepository.jobs.get(jobs[0].id)?.status === "SENT", 2000);
      assert.equal(fakeTransporter.sendMailCalls.length, 1);
      assert.deepEqual(fakeTransporter.sendMailCalls[0], {
        from: "notifications@example.com",
        to: "jane@example.com",
        subject: "Your loan has been approved",
        html: "<p>Hi Jane Doe, ৳50000 approved.</p>",
        text: "Hi Jane Doe, ৳50000 approved.",
      });

      // Worker Continues Running: back to IDLE, and a second event is picked up without any restart.
      await waitUntil(() => runtime.status() === "IDLE", 500);

      const { jobs: secondJobs } = await notificationService.raiseEvent({
        eventType: "LOAN_APPROVED",
        dedupeKey: "LOAN_APPROVED:loan_2",
        sourceDomain: "loan",
        payload: { employee: { id: "user_2", name: "John Roe" }, amount: 20000, approvedBy: "Admin Alex" },
        recipients: [{ channel: "EMAIL", recipientAddress: "john@example.com", recipientUserId: "user_2" }],
      });

      await waitUntil(() => queueRepository.jobs.get(secondJobs[0].id)?.status === "SENT", 2000);
      assert.equal(fakeTransporter.sendMailCalls.length, 2);
    } finally {
      await lifecycleManager.stop();
    }
  });

  it("crash recovery: a job stuck PROCESSING from a previous (crashed) run is reclaimed on startup and then processed normally", async () => {
    const { notificationService, lifecycleManager, queueRepository, templateEngine, fakeTransporter } = buildPipeline();

    await templateEngine.register({ key: "LOAN_APPROVED", channel: NotificationChannel.EMAIL, subjectTemplate: "Your loan has been approved" });

    // Simulate a job a *previous* (crashed) worker process claimed and never finished — locked well past the lease window.
    const { jobs } = await notificationService.raiseEvent({
      eventType: "LOAN_APPROVED",
      dedupeKey: "LOAN_APPROVED:loan_crash",
      sourceDomain: "loan",
      payload: { employee: { id: "user_3", name: "Jane Doe" }, amount: 10000, approvedBy: "Admin Alex" },
      recipients: [{ channel: "EMAIL", recipientAddress: "jane@example.com", recipientUserId: "user_3" }],
    });
    const job = queueRepository.jobs.get(jobs[0].id)!;
    job.status = "PROCESSING";
    job.lockedBy = "worker-that-crashed";
    job.lockedAt = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago, well past the 5-minute lease window

    // Application (re)start: the startup recovery sweep must reclaim this job before/alongside normal polling.
    await lifecycleManager.start();
    try {
      await waitUntil(() => queueRepository.jobs.get(jobs[0].id)?.status === "SENT", 2000);
      assert.equal(fakeTransporter.sendMailCalls.length, 1);
    } finally {
      await lifecycleManager.stop();
    }
  });
});
