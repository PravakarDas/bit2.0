import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QueueEngine } from "../queue/queue-engine";
import { DuplicateJobError, InvalidQueueTransitionError } from "../queue/errors";
import type { IQueueRepository, PaginationParams } from "../queue/queue-repository.interface";
import type { QueueSearchCriteria, QueueSearchResult, QueueStatistics } from "../queue/queue-query.dto";
import type {
  CreateNotificationJobInput,
  NotificationJobDTO,
  NotificationEventDTO,
  CreateNotificationEventInput,
  NotificationEventQueryCriteria,
  CreateDocumentInput,
  CreateDocumentUploadAttemptInput,
  DocumentDTO,
  DocumentQueryCriteria,
  DocumentUploadAttemptDTO,
  UpdateDocumentInput,
} from "../dto";
import type { INotificationRepository } from "../repositories/interfaces";
import type { IDocumentRepository } from "../repositories/interfaces";
import { NotificationJobStatus, NotificationChannel } from "../types/enums";
import { ChannelAdapterFactory } from "../factories";
import { registerStubChannelAdapters } from "../worker/channel-adapters";
import { JobDispatcher } from "../worker/job-dispatcher";
import { DocumentAttachmentResolver } from "../worker/document-attachment-resolver";
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
 * In-memory fake of `IQueueRepository` — same verbatim-copy convention as
 * `queue-to-smtp.integration.test.ts` (duplicated deliberately, not shared,
 * per that file's own doc comment: a private class in a different test
 * file, and this project's only `DATABASE_URL` is a shared live instance a
 * test must never touch).
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

/** In-memory fake of `INotificationRepository` — a job's associated `NotificationEvent`. */
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

/** In-memory fake of `IDocumentRepository` — the `Document` row this test's job's `documentId` points at. */
class FakeDocumentRepository implements IDocumentRepository {
  private readonly documents = new Map<string, DocumentDTO>();

  seed(document: DocumentDTO): void {
    this.documents.set(document.id, document);
  }

  async create(_input: CreateDocumentInput): Promise<DocumentDTO> {
    throw new Error("not used in this test");
  }
  async findById(id: string): Promise<DocumentDTO | null> {
    return this.documents.get(id) ?? null;
  }
  async findMany(_criteria?: DocumentQueryCriteria): Promise<DocumentDTO[]> {
    return [...this.documents.values()];
  }
  async update(_id: string, _input: UpdateDocumentInput): Promise<DocumentDTO> {
    throw new Error("not used in this test");
  }
  async addUploadAttempt(_input: CreateDocumentUploadAttemptInput): Promise<DocumentUploadAttemptDTO> {
    throw new Error("not used in this test");
  }
  async findUploadAttemptsByDocumentId(_documentId: string): Promise<DocumentUploadAttemptDTO[]> {
    throw new Error("not used in this test");
  }
}

function fakeDocument(overrides: Partial<DocumentDTO> = {}): DocumentDTO {
  const now = new Date();
  return {
    id: "doc_1",
    type: "PAYSLIP",
    sourceEntityId: "payment_1",
    status: "GENERATED_LOCAL",
    localTempPath: null,
    driveFileId: null,
    driveFileUrl: null,
    generatedAt: now,
    uploadedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const smtpConfig: ResolvedEmailConfig = {
  smtpHost: "smtp.gmail.com",
  smtpPort: 587,
  secure: false,
  senderEmail: "notifications@example.com",
  appPassword: "app-password",
};

/** Builds the same complete pipeline as `queue-to-smtp.integration.test.ts`, additionally wiring a `DocumentAttachmentResolver` into JobDispatcher — the Phase 18b addition. */
function buildPipeline(documentRepository: IDocumentRepository, transporter?: FakeTransporter) {
  const queueRepository = new FakeQueueRepository();
  const queueEngine = new QueueEngine(queueRepository);

  const eventRepository = new FakeEventRepository();
  const templateEngine = new TemplateEngine(new TemplateRegistry(new FakeNotificationTemplateRepository()));
  const documentAttachmentResolver = new DocumentAttachmentResolver(documentRepository);

  const fakeTransporter = transporter ?? new FakeTransporter("success");
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

  const jobDispatcher = new JobDispatcher(channelAdapterFactory, undefined, eventRepository, templateEngine, documentAttachmentResolver);
  const metrics = new WorkerMetricsCollector();
  const config = resolveWorkerConfig({ workerId: "worker-1" });
  const worker = new NotificationWorker(queueEngine, jobDispatcher, metrics, config);

  return { queueEngine, queueRepository, eventRepository, templateEngine, worker, fakeTransporter };
}

describe("Integration (Phase 18b): Document -> NotificationJob.documentId -> Worker -> JobDispatcher -> DeliveryManager -> SMTP provider -> attachment", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "notification-engine-attachment-integration-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("delivers an EMAIL job whose documentId resolves to a real file, and the exact PDF bytes reach the SMTP transporter's sendMail() call", async () => {
    const pdfBytes = Buffer.from("%PDF-1.3 fake payslip bytes for integration testing");
    const filePath = join(dir, "payslip-2026-08.pdf");
    await writeFile(filePath, pdfBytes);

    const documentRepository = new FakeDocumentRepository();
    documentRepository.seed(fakeDocument({ id: "doc_1", localTempPath: filePath }));

    const { queueEngine, queueRepository, eventRepository, templateEngine, worker, fakeTransporter } = buildPipeline(documentRepository);

    await templateEngine.register({ key: "PAYROLL_PROCESSED_TEST", channel: NotificationChannel.EMAIL, subjectTemplate: "Your payslip is ready" });

    const event = await eventRepository.create({
      eventType: "PAYROLL_PROCESSED_TEST",
      dedupeKey: "PAYROLL_PROCESSED_TEST:payment_1",
      sourceDomain: "test",
      payload: {},
    });

    const job = await queueEngine.enqueue({
      eventId: event.id,
      dedupeKey: event.dedupeKey,
      channel: NotificationChannel.EMAIL,
      recipientAddress: "jane@example.com",
      documentId: "doc_1",
    });
    assert.equal(job.documentId, "doc_1"); // confirms the already-tested raiseEvent()->documentId plumbing this phase builds on

    const result = await worker.processNext();

    assert.equal(result.kind, "SUCCESS");
    assert.equal(queueRepository.jobs.get(job.id)?.status, "SENT");

    assert.equal(fakeTransporter.sendMailCalls.length, 1);
    const call = fakeTransporter.sendMailCalls[0] as { attachments?: Array<{ filename: string; contentType: string; content: Buffer }> };
    assert.equal(call.attachments?.length, 1);
    assert.equal(call.attachments?.[0].filename, "payslip-2026-08.pdf");
    assert.equal(call.attachments?.[0].contentType, "application/pdf");
    assert.deepEqual(call.attachments?.[0].content, pdfBytes); // exact bytes, unmodified through the whole pipeline
  });

  it("a job whose documentId cannot be resolved (Document missing) is scheduled for retry, and no email is sent without its required attachment", async () => {
    const documentRepository = new FakeDocumentRepository(); // nothing seeded — doc_missing will not resolve
    const { queueEngine, queueRepository, eventRepository, templateEngine, worker, fakeTransporter } = buildPipeline(documentRepository);

    await templateEngine.register({ key: "PAYROLL_PROCESSED_TEST", channel: NotificationChannel.EMAIL, subjectTemplate: "Your payslip is ready" });

    const event = await eventRepository.create({
      eventType: "PAYROLL_PROCESSED_TEST",
      dedupeKey: "PAYROLL_PROCESSED_TEST:payment_2",
      sourceDomain: "test",
      payload: {},
    });
    const job = await queueEngine.enqueue({
      eventId: event.id,
      dedupeKey: event.dedupeKey,
      channel: NotificationChannel.EMAIL,
      recipientAddress: "jane@example.com",
      documentId: "doc_missing",
    });

    const result = await worker.processNext();

    assert.equal(result.kind, "RETRY_SCHEDULED");
    assert.equal(queueRepository.jobs.get(job.id)?.status, "RETRY_SCHEDULED");
    assert.equal(fakeTransporter.sendMailCalls.length, 0); // never sent — no silent send without the attachment
  });

  it("a job without a documentId is delivered exactly as before Phase 18b (no attachments key at all)", async () => {
    const documentRepository = new FakeDocumentRepository();
    const { queueEngine, queueRepository, eventRepository, templateEngine, worker, fakeTransporter } = buildPipeline(documentRepository);

    await templateEngine.register({ key: "PAYROLL_PROCESSED_TEST", channel: NotificationChannel.EMAIL, subjectTemplate: "Your payslip is ready" });

    const event = await eventRepository.create({
      eventType: "PAYROLL_PROCESSED_TEST",
      dedupeKey: "PAYROLL_PROCESSED_TEST:payment_3",
      sourceDomain: "test",
      payload: {},
    });
    const job = await queueEngine.enqueue({
      eventId: event.id,
      dedupeKey: event.dedupeKey,
      channel: NotificationChannel.EMAIL,
      recipientAddress: "jane@example.com",
      // no documentId
    });
    assert.equal(job.documentId, null);

    const result = await worker.processNext();

    assert.equal(result.kind, "SUCCESS");
    assert.equal(queueRepository.jobs.get(job.id)?.status, "SENT");
    assert.ok(!Object.prototype.hasOwnProperty.call(fakeTransporter.sendMailCalls[0], "attachments"));
  });
});
