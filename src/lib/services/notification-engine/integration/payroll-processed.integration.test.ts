import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
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
  CreateDocumentInput,
  DocumentDTO,
  DocumentQueryCriteria,
  DocumentUploadAttemptDTO,
  CreateDocumentUploadAttemptInput,
  UpdateDocumentInput,
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
import { NotificationService } from "../notification.service";
import {
  dispatchPayslipForEmployee,
  dispatchPayslipsForPayrollRun,
  type PayslipDispatchDeps,
  type PayslipDispatchInput,
  type PayslipDriveTarget,
} from "../../payroll-payslip-dispatch.service";
import { generatePayslipPdf } from "../../payslip-pdf.service";

/**
 * Full-pipeline proof for Phase 18c (Task 15): `dispatchPayslipForEmployee`
 * -> real `NotificationService.raiseEvent` -> real `QueueEngine` -> real
 * `NotificationWorker`/`JobDispatcher` (with `DocumentAttachmentResolver`
 * wired in, matching the container.ts/production-worker.ts fix this phase
 * also made) -> real `TemplateEngine` -> real `DeliveryManager` -> real
 * `SmtpDeliveryProvider` -> a `FakeTransporter`. Only Google Drive and SMTP
 * are faked (no real network, no real credentials, no real email) — PDF
 * generation is the real, already-verified `generatePayslipPdf`, and the
 * generated file is a real file on disk (in a per-test temp dir), read back
 * by the real, unmodified `DocumentAttachmentResolver`.
 */

const ALL_STATUSES = Object.values(NotificationJobStatus);

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
    if (!job) throw new InvalidQueueTransitionError(jobId, attemptedTransitionTo, "NOT_FOUND");
    if (!expectedStatuses.includes(job.status)) throw new InvalidQueueTransitionError(jobId, attemptedTransitionTo, "INVALID_CURRENT_STATE");
    if (lockedBy !== undefined && job.lockedBy !== lockedBy) throw new InvalidQueueTransitionError(jobId, attemptedTransitionTo, "LOCK_NOT_HELD");
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
    return this.guardedTransition(jobId, ["PROCESSING"], workerId, { status: "DEAD_LETTER", lockedAt: null, lockedBy: null }, "DEAD_LETTER");
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
    for (const job of this.jobs.values()) stats[job.status]++;
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

/** Default-enabled — `PAYROLL_PROCESSED` opt-out is not this phase's focus (already covered generically by `notification.service.test.ts`). */
class AlwaysEnabledPreferenceRepository implements INotificationPreferenceRepository {
  async findOne(): Promise<NotificationPreferenceDTO | null> {
    return null;
  }
  async findByUser(): Promise<NotificationPreferenceDTO[]> {
    return [];
  }
  async upsert(): Promise<NotificationPreferenceDTO> {
    throw new Error("not used in these tests");
  }
  async deleteOne(): Promise<void> {}
}

/** Real, working `IDocumentRepository` — both `NotificationService` and `DocumentAttachmentResolver` read/write through this one instance, exactly like the real `DocumentRepository` (Prisma-backed) does in production. */
class FakeDocumentRepository implements IDocumentRepository {
  readonly documents = new Map<string, DocumentDTO>();
  readonly uploadAttempts: DocumentUploadAttemptDTO[] = [];
  private idCounter = 0;
  async create(input: CreateDocumentInput): Promise<DocumentDTO> {
    const now = new Date();
    const document: DocumentDTO = {
      id: `doc_${++this.idCounter}`,
      type: input.type,
      sourceEntityId: input.sourceEntityId,
      status: input.status ?? "PENDING_GENERATION",
      localTempPath: input.localTempPath ?? null,
      driveFileId: null,
      driveFileUrl: null,
      generatedAt: null,
      uploadedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.documents.set(document.id, document);
    return document;
  }
  async findById(id: string): Promise<DocumentDTO | null> {
    return this.documents.get(id) ?? null;
  }
  async findMany(_criteria?: DocumentQueryCriteria): Promise<DocumentDTO[]> {
    return [...this.documents.values()];
  }
  async update(id: string, input: UpdateDocumentInput): Promise<DocumentDTO> {
    const existing = this.documents.get(id);
    if (!existing) throw new Error(`Document not found: ${id}`);
    const updated = { ...existing, ...input, updatedAt: new Date() };
    this.documents.set(id, updated);
    return updated;
  }
  async addUploadAttempt(input: CreateDocumentUploadAttemptInput): Promise<DocumentUploadAttemptDTO> {
    const attempt: DocumentUploadAttemptDTO = {
      id: `attempt_${this.uploadAttempts.length + 1}`,
      documentId: input.documentId,
      attemptNumber: input.attemptNumber,
      outcome: input.outcome,
      errorMessage: input.errorMessage ?? null,
      attemptedAt: new Date(),
    };
    this.uploadAttempts.push(attempt);
    return attempt;
  }
  async findUploadAttemptsByDocumentId(documentId: string): Promise<DocumentUploadAttemptDTO[]> {
    return this.uploadAttempts.filter((a) => a.documentId === documentId);
  }
}

class FakeDriveTarget implements PayslipDriveTarget {
  shouldFail = false;
  uploadCalls: Array<{ filename: string; contentLength: number }> = [];
  async resolveFolder(): Promise<{ id: string }> {
    return { id: "folder_branch" };
  }
  async upload(input: { parentFolderId: string; filename: string; content: Buffer }): Promise<{ id: string; webViewLink: string | null }> {
    if (this.shouldFail) {
      throw new Error("Google Drive API is temporarily unavailable. Try again shortly.");
    }
    this.uploadCalls.push({ filename: input.filename, contentLength: input.content.length });
    return { id: "drivefile_1", webViewLink: "https://drive.google.com/file/d/drivefile_1/view" };
  }
}

const smtpConfig: ResolvedEmailConfig = {
  smtpHost: "smtp.gmail.com",
  smtpPort: 587,
  secure: false,
  senderEmail: "notifications@example.com",
  appPassword: "app-password",
};

// Exact production content from prisma/seed.js's PAYROLL_PROCESSED template.
const PAYROLL_TEMPLATE = {
  key: "PAYROLL_PROCESSED",
  channel: NotificationChannel.EMAIL,
  subjectTemplate: "Your Payslip for {{month}} {{year}}",
  bodyTemplateHtml: "<p>Hello {{employeeName}},</p><p>Your payslip for {{month}} {{year}} is ready.</p><p>Please find your payslip attached to this email.</p><p>Regards,<br/>HR / Payroll Team</p>",
  bodyTemplateText: "Hello {{employeeName}},\n\nYour payslip for {{month}} {{year}} is ready.\n\nPlease find your payslip attached to this email.\n\nRegards,\nHR / Payroll Team",
};

function buildPipeline() {
  const queueRepository = new FakeQueueRepository();
  const queueEngine = new QueueEngine(queueRepository);
  const eventRepository = new FakeEventRepository();
  const jobRepository = new FakeJobRepository(queueRepository);
  const documentRepository = new FakeDocumentRepository();
  const preferenceRepository = new AlwaysEnabledPreferenceRepository();
  const templateEngine = new TemplateEngine(new TemplateRegistry(new FakeNotificationTemplateRepository()));
  const documentAttachmentResolver = new DocumentAttachmentResolver(documentRepository);

  const fakeTransporter = new FakeTransporter("success");
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

  const notificationService = new NotificationService(
    eventRepository,
    jobRepository,
    new UnusedHistoryRepository(),
    new UnusedTemplateRepository(),
    new UnusedProviderRepository(),
    documentRepository,
    new ChannelAdapterFactory(),
    queueEngine,
    preferenceRepository
  );

  return { notificationService, queueEngine, queueRepository, eventRepository, templateEngine, worker, fakeTransporter, documentRepository };
}

describe("Integration (Phase 18c): payroll payslip dispatch -> Document -> PAYROLL_PROCESSED -> Worker -> SMTP attachment", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "payroll-payslip-integration-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function buildDeps(pipeline: ReturnType<typeof buildPipeline>, drive: PayslipDriveTarget | null): PayslipDispatchDeps {
    return {
      generatePdf: (data) => generatePayslipPdf(data), // the real, already-verified PDF generator — no second implementation
      // Mirrors the real writer: each payslip gets its own folder, so two employees with the same
      // name cannot overwrite each other's file (the emailed attachment name is the file's name).
      writeLocalFile: async (filename, content, uniqueKey) => {
        const directory = join(dir, uniqueKey);
        await mkdir(directory, { recursive: true });
        const filePath = join(directory, filename);
        await writeFile(filePath, content);
        return filePath;
      },
      drive,
      documentRepository: pipeline.documentRepository,
      notificationService: pipeline.notificationService,
    };
  }

  function input(overrides: Partial<PayslipDispatchInput> = {}): PayslipDispatchInput {
    return {
      salaryPaymentId: "sp_1",
      userId: "user_1",
      email: "jane@example.com",
      employeeName: "Jane Doe",
      branchName: "Dhaka Main",
      year: 2026,
      monthNumber: 2,
      payslipData: {
        employeeName: "Jane Doe",
        employeeEmail: "jane@example.com",
        month: "2026-02",
        baseSalary: 50000,
        totalBonuses: 2000,
        totalAllowances: 1000,
        medicalReimbursement: 0,
        loanDeduction: 3000,
        walletAdjustment: 0,
        netAmount: 50000,
      },
      ...overrides,
    };
  }

  it("delivers the real generated payslip PDF end to end: PAYROLL_PROCESSED -> queued job -> worker -> template render -> SMTP, with attachment bytes matching the real PDF exactly", async () => {
    const pipeline = buildPipeline();
    await pipeline.templateEngine.register(PAYROLL_TEMPLATE);
    const drive = new FakeDriveTarget();

    // Capture the exact buffer `generatePayslipPdf` produces for THIS dispatch,
    // rather than calling it a second, independent time to build an "expected"
    // value: pdfkit embeds a creation timestamp and a per-document random /ID
    // in the PDF trailer, so two calls with identical logical data never
    // produce byte-identical output — that's expected pdfkit behavior, not a
    // bug. The real invariant this test verifies is "the bytes generated for
    // this run reach SMTP unmodified," which only requires capturing what was
    // actually generated, not regenerating a second copy to diff against.
    let generatedPdf: Buffer | undefined;
    const deps: PayslipDispatchDeps = {
      ...buildDeps(pipeline, drive),
      generatePdf: async (data) => {
        generatedPdf = await generatePayslipPdf(data);
        return generatedPdf;
      },
    };
    const result = await dispatchPayslipForEmployee(input(), deps);

    assert.equal(result.notificationRaised, true);
    assert.equal(result.driveUploaded, true);
    assert.equal(pipeline.queueRepository.jobs.size, 1);

    const workerResult = await pipeline.worker.processNext();

    assert.equal(workerResult.kind, "SUCCESS");
    assert.equal(pipeline.fakeTransporter.sendMailCalls.length, 1);
    const call = pipeline.fakeTransporter.sendMailCalls[0] as {
      to: string;
      subject: string;
      attachments?: Array<{ filename: string; contentType: string; content: Buffer }>;
    };
    assert.equal(call.to, "jane@example.com");
    assert.equal(call.subject, "Your Payslip for February 2026");
    assert.equal(call.attachments?.length, 1);
    assert.equal(call.attachments?.[0].filename, "Jane_Doe_February_2026.pdf"); // no employee id in the name
    assert.equal(call.attachments?.[0].contentType, "application/pdf");
    assert.deepEqual(call.attachments?.[0].content, generatedPdf); // exact bytes, unmodified through the whole pipeline

    // Drive succeeded too, in this run.
    assert.equal(drive.uploadCalls.length, 1);
    const document = pipeline.documentRepository.documents.get(result.documentId!);
    assert.ok(document?.driveFileId);
  });

  it("a Google Drive upload failure does not prevent the email — the attachment still arrives at SMTP", async () => {
    const pipeline = buildPipeline();
    await pipeline.templateEngine.register(PAYROLL_TEMPLATE);
    const drive = new FakeDriveTarget();
    drive.shouldFail = true;

    const result = await dispatchPayslipForEmployee(input(), buildDeps(pipeline, drive));
    assert.equal(result.driveUploaded, false);
    assert.equal(result.notificationRaised, true);

    const document = pipeline.documentRepository.documents.get(result.documentId!);
    assert.equal(document?.status, "GENERATED_LOCAL"); // attachment resolver still works
    assert.equal(document?.driveFileId, null);
    const attempts = pipeline.documentRepository.uploadAttempts.filter((a) => a.documentId === result.documentId);
    assert.equal(attempts[0]?.outcome, "FAILURE");

    const workerResult = await pipeline.worker.processNext();

    assert.equal(workerResult.kind, "SUCCESS");
    const call = pipeline.fakeTransporter.sendMailCalls[0] as { attachments?: Array<{ filename: string }> };
    assert.equal(call.attachments?.length, 1); // email still has its PDF attached despite the Drive failure
  });

  it("two employees with the same name in the same month each get their own PDF attached (no shared file)", async () => {
    const pipeline = buildPipeline();
    const deps = buildDeps(pipeline, null);
    const twin = (salaryPaymentId: string, userId: string, email: string, baseSalary: number) =>
      input({
        salaryPaymentId,
        userId,
        email,
        employeeName: "Same Name",
        payslipData: { ...input().payslipData, employeeName: "Same Name", employeeEmail: email, baseSalary },
      });

    const summary = await dispatchPayslipsForPayrollRun([twin("sp_a", "user_a", "a@example.com", 11111), twin("sp_b", "user_b", "b@example.com", 22222)], deps);
    assert.ok(summary.results.every((r) => r.pdfGenerated && r.notificationRaised), "both PDFs generated and both emails queued");

    const docA = pipeline.documentRepository.documents.get(summary.results[0].documentId!);
    const docB = pipeline.documentRepository.documents.get(summary.results[1].documentId!);
    assert.notEqual(docA?.localTempPath, docB?.localTempPath, "different files on disk");
    assert.equal(basename(docA!.localTempPath!), "Same_Name_February_2026.pdf");
    assert.equal(basename(docB!.localTempPath!), "Same_Name_February_2026.pdf");
    assert.notDeepEqual(await readFile(docA!.localTempPath!), await readFile(docB!.localTempPath!), "each keeps its own content");
  });

  it("one employee's PDF generation failure does not stop the other employee's email in the same payroll run", async () => {
    const pipeline = buildPipeline();
    await pipeline.templateEngine.register(PAYROLL_TEMPLATE);
    const drive = new FakeDriveTarget();

    const deps: PayslipDispatchDeps = {
      ...buildDeps(pipeline, drive),
      generatePdf: async (data) => {
        if (data.employeeName === "Broken Employee") {
          throw new Error("pdfkit exploded for this employee");
        }
        return generatePayslipPdf(data);
      },
    };

    const inputs = [
      input({ salaryPaymentId: "sp_broken", userId: "user_broken", email: "broken@example.com", employeeName: "Broken Employee", payslipData: { ...input().payslipData, employeeName: "Broken Employee" } }),
      input({ salaryPaymentId: "sp_ok", userId: "user_ok", email: "ok@example.com", employeeName: "OK Employee", payslipData: { ...input().payslipData, employeeName: "OK Employee" } }),
    ];

    const summary = await dispatchPayslipsForPayrollRun(inputs, deps);

    assert.equal(summary.pdfFailures, 1);
    assert.equal(pipeline.queueRepository.jobs.size, 1); // only the OK employee reached raiseEvent

    const workerResult = await pipeline.worker.processNext();
    assert.equal(workerResult.kind, "SUCCESS");
    assert.equal((pipeline.fakeTransporter.sendMailCalls[0] as { to: string }).to, "ok@example.com");
  });

  it("re-dispatching the same salaryPaymentId does not create a duplicate NotificationJob (dedupeKey-based idempotency)", async () => {
    const pipeline = buildPipeline();
    await pipeline.templateEngine.register(PAYROLL_TEMPLATE);
    const drive = new FakeDriveTarget();
    const deps = buildDeps(pipeline, drive);
    const dispatchInput = input();

    const first = await dispatchPayslipForEmployee(dispatchInput, deps);
    const second = await dispatchPayslipForEmployee(dispatchInput, deps);

    assert.equal(first.notificationRaised, true);
    assert.equal(second.notificationRaised, true); // raiseEvent itself doesn't throw on a dedupe hit
    assert.equal(pipeline.queueRepository.jobs.size, 1); // but only one job was ever created
  });
});
