import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { IDocumentRepository } from "./notification-engine/repositories/interfaces";
import type { RaiseEventRequest, RaiseEventResult, CreateDocumentInput, DocumentDTO, DocumentUploadAttemptDTO, CreateDocumentUploadAttemptInput, UpdateDocumentInput, DocumentQueryCriteria } from "./notification-engine/dto";
import {
  dispatchPayslipForEmployee,
  dispatchPayslipsForPayrollRun,
  createPayslipDriveTarget,
  type PayslipDispatchDeps,
  type PayslipDispatchInput,
  type PayslipDriveTarget,
  type PayslipDispatchFailure,
} from "./payroll-payslip-dispatch.service";
import { GoogleDriveService } from "./google-drive-client";
import type { DriveClientFactory, ResolvedGoogleDriveConfig } from "./google-drive-client";
import type { PayslipData } from "./payslip-pdf.service";

/** Fully working in-memory `IDocumentRepository` — unlike the integration tests' "not used" stubs, this dispatch module actually calls every method. */
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

/** Records every `raiseEvent` call; returns a minimal, deterministic `RaiseEventResult` — real dedup/queue/preference/SMTP behavior is covered by the full pipeline integration test, not here. */
class FakeNotificationService {
  readonly calls: RaiseEventRequest[] = [];
  private idCounter = 0;

  async raiseEvent(request: RaiseEventRequest): Promise<RaiseEventResult> {
    this.calls.push(request);
    return {
      event: {
        id: `evt_${++this.idCounter}`,
        eventType: request.eventType,
        dedupeKey: request.dedupeKey ?? `derived:${this.idCounter}`,
        payload: (request.payload ?? null) as never,
        sourceDomain: request.sourceDomain ?? "payroll",
        triggeredByUserId: request.triggeredByUserId ?? null,
        createdAt: new Date(),
      },
      jobs: [],
      deduplicated: false,
    };
  }
}

class FakeDriveTarget implements PayslipDriveTarget {
  readonly resolveFolderCalls: Array<{ year: number; monthNumber: number; branchName: string | null }> = [];
  readonly uploadCalls: Array<{ parentFolderId: string; filename: string; contentLength: number }> = [];
  shouldFailResolve = false;
  shouldFailUpload = false;

  async resolveFolder(year: number, monthNumber: number, branchName: string | null): Promise<{ id: string }> {
    this.resolveFolderCalls.push({ year, monthNumber, branchName });
    if (this.shouldFailResolve) {
      throw new Error("Permission denied — the service account does not have access to this folder.");
    }
    return { id: `folder_${branchName ?? "unassigned"}` };
  }

  async upload(input: { parentFolderId: string; filename: string; content: Buffer }): Promise<{ id: string; webViewLink: string | null }> {
    this.uploadCalls.push({ parentFolderId: input.parentFolderId, filename: input.filename, contentLength: input.content.length });
    if (this.shouldFailUpload) {
      throw new Error("Google Drive API is temporarily unavailable. Try again shortly.");
    }
    return { id: `drivefile_${this.uploadCalls.length}`, webViewLink: `https://drive.google.com/file/d/drivefile_${this.uploadCalls.length}/view` };
  }
}

function payslipData(overrides: Partial<PayslipData> = {}): PayslipData {
  return {
    employeeName: "Abdul Kader",
    employeeEmail: "abdul@example.com",
    month: "2026-02",
    baseSalary: 50000,
    totalBonuses: 2000,
    totalAllowances: 1000,
    medicalReimbursement: 500,
    loanDeduction: 3000,
    walletAdjustment: 0,
    netAmount: 50500,
    ...overrides,
  };
}

function dispatchInput(overrides: Partial<PayslipDispatchInput> = {}): PayslipDispatchInput {
  return {
    salaryPaymentId: "sp_1",
    userId: "user_1",
    email: "abdul@example.com",
    employeeName: "Abdul Kader",
    branchName: "Dhaka Main",
    year: 2026,
    monthNumber: 2,
    payslipData: payslipData(),
    ...overrides,
  };
}

function buildDeps(overrides: Partial<PayslipDispatchDeps> = {}): { deps: PayslipDispatchDeps; documentRepository: FakeDocumentRepository; notificationService: FakeNotificationService; drive: FakeDriveTarget; failures: PayslipDispatchFailure[]; writtenFiles: Map<string, Buffer> } {
  const documentRepository = new FakeDocumentRepository();
  const notificationService = new FakeNotificationService();
  const drive = new FakeDriveTarget();
  const failures: PayslipDispatchFailure[] = [];
  const writtenFiles = new Map<string, Buffer>();

  const deps: PayslipDispatchDeps = {
    generatePdf: async () => Buffer.from("%PDF-1.4 fake payslip"),
    writeLocalFile: async (filename, content) => {
      writtenFiles.set(filename, content);
      return `/fake-temp/${filename}`;
    },
    drive,
    documentRepository,
    notificationService,
    onFailure: (failure) => failures.push(failure),
    ...overrides,
  };

  return { deps, documentRepository, notificationService, drive, failures, writtenFiles };
}

describe("dispatchPayslipForEmployee — happy path", () => {
  it("generates the PDF, uploads to Drive, creates the Document, and raises PAYROLL_PROCESSED with the documentId", async () => {
    const { deps, documentRepository, notificationService, drive, writtenFiles } = buildDeps();

    const result = await dispatchPayslipForEmployee(dispatchInput(), deps);

    assert.equal(result.pdfGenerated, true);
    assert.equal(result.driveUploaded, true);
    assert.equal(result.notificationRaised, true);
    assert.equal(result.failures.length, 0);
    assert.ok(result.documentId);

    // Filename: {sanitized name}_{Month}_{Year}.pdf — no employee id in it
    assert.ok(writtenFiles.has("Abdul_Kader_February_2026.pdf"));

    // Drive: folder resolved for the right year/month/branch, uploaded with the same filename.
    assert.deepEqual(drive.resolveFolderCalls, [{ year: 2026, monthNumber: 2, branchName: "Dhaka Main" }]);
    assert.equal(drive.uploadCalls[0]?.filename, "Abdul_Kader_February_2026.pdf");

    // Document: stays GENERATED_LOCAL (the attachment resolver requires exactly this status —
    // see the service's own doc comment), but records the Drive outcome via driveFileId/driveFileUrl.
    const document = documentRepository.documents.get(result.documentId!);
    assert.equal(document?.status, "GENERATED_LOCAL");
    assert.equal(document?.localTempPath, "/fake-temp/Abdul_Kader_February_2026.pdf");
    assert.ok(document?.driveFileId);
    assert.ok(document?.driveFileUrl);
    assert.ok(document?.generatedAt);
    assert.ok(document?.uploadedAt);

    // Exactly one upload attempt, recorded as SUCCESS.
    const attempts = documentRepository.uploadAttempts.filter((a) => a.documentId === result.documentId);
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].outcome, "SUCCESS");

    // raiseEvent: correct event type, stable per-payment dedupeKey, correct recipient + documentId.
    assert.equal(notificationService.calls.length, 1);
    const call = notificationService.calls[0];
    assert.equal(call.eventType, "PAYROLL_PROCESSED");
    assert.equal(call.dedupeKey, "PAYROLL_PROCESSED:sp_1");
    assert.deepEqual(call.payload, { employeeName: "Abdul Kader", month: "February", year: 2026 });
    assert.deepEqual(call.recipients, [{ channel: "EMAIL", recipientAddress: "abdul@example.com", recipientUserId: "user_1", documentId: result.documentId }]);
  });

  it("resolves the 'Unassigned' branch folder for an employee with no branch", async () => {
    const { deps, drive } = buildDeps();

    await dispatchPayslipForEmployee(dispatchInput({ branchName: null }), deps);

    assert.equal(drive.resolveFolderCalls[0]?.branchName, null);
    assert.equal(drive.uploadCalls[0]?.parentFolderId, "folder_unassigned");
  });
});

describe("dispatchPayslipForEmployee — PDF generation failure", () => {
  it("aborts the whole employee: no Drive call, no Document, no notification — only a pdf_generation failure is recorded", async () => {
    const { deps, documentRepository, notificationService, drive, failures } = buildDeps({
      generatePdf: async () => {
        throw new Error("pdfkit exploded");
      },
    });

    const result = await dispatchPayslipForEmployee(dispatchInput(), deps);

    assert.equal(result.pdfGenerated, false);
    assert.equal(result.driveUploaded, false);
    assert.equal(result.documentId, null);
    assert.equal(result.notificationRaised, false);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].stage, "pdf_generation");
    assert.equal(result.failures[0].message, "pdfkit exploded");

    assert.equal(drive.resolveFolderCalls.length, 0);
    assert.equal(drive.uploadCalls.length, 0);
    assert.equal(documentRepository.documents.size, 0);
    assert.equal(notificationService.calls.length, 0);
    assert.equal(failures.length, 1); // onFailure hook fired exactly once
  });
});

describe("dispatchPayslipForEmployee — Google Drive failure must never stop the email", () => {
  it("Drive resolveFolder throwing: Document still created (GENERATED_LOCAL), a FAILURE upload attempt is recorded, and PAYROLL_PROCESSED is still raised", async () => {
    const { deps, documentRepository, notificationService, drive } = buildDeps();
    drive.shouldFailResolve = true;

    const result = await dispatchPayslipForEmployee(dispatchInput(), deps);

    assert.equal(result.pdfGenerated, true);
    assert.equal(result.driveUploaded, false);
    assert.equal(result.notificationRaised, true);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].stage, "drive_upload");

    const document = documentRepository.documents.get(result.documentId!);
    assert.equal(document?.status, "GENERATED_LOCAL");
    assert.equal(document?.driveFileId, null); // never set — Drive never succeeded
    assert.ok(document?.localTempPath); // the PDF is still there for the attachment resolver

    const attempts = documentRepository.uploadAttempts.filter((a) => a.documentId === result.documentId);
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].outcome, "FAILURE");
    assert.match(attempts[0].errorMessage ?? "", /Permission denied/);

    assert.equal(notificationService.calls.length, 1);
    assert.ok(notificationService.calls[0].recipients[0].documentId); // attachment still wired up
  });

  it("Drive upload throwing (folder resolved, upload itself fails) behaves the same way", async () => {
    const { deps, documentRepository, notificationService, drive } = buildDeps();
    drive.shouldFailUpload = true;

    const result = await dispatchPayslipForEmployee(dispatchInput(), deps);

    assert.equal(result.driveUploaded, false);
    assert.equal(result.notificationRaised, true);
    assert.equal(documentRepository.documents.get(result.documentId!)?.status, "GENERATED_LOCAL");
    assert.equal(notificationService.calls.length, 1);
  });

  it("Google Drive not configured at all (drive: null): recorded as a drive_upload failure with a clear message, email still sent", async () => {
    const { deps, notificationService } = buildDeps({ drive: null });

    const result = await dispatchPayslipForEmployee(dispatchInput(), deps);

    assert.equal(result.driveUploaded, false);
    assert.equal(result.failures[0].stage, "drive_upload");
    assert.equal(result.failures[0].message, "Google Drive is not configured.");
    assert.equal(result.notificationRaised, true);
    assert.equal(notificationService.calls.length, 1);
  });
});

describe("dispatchPayslipForEmployee — never leaks secrets or PDF content", () => {
  it("a Drive failure message never contains the generated PDF bytes", async () => {
    const { deps, drive } = buildDeps();
    drive.shouldFailResolve = true;

    const result = await dispatchPayslipForEmployee(dispatchInput(), deps);

    assert.equal(result.failures[0].message.includes("%PDF"), false);
  });
});

describe("dispatchPayslipsForPayrollRun — per-employee isolation", () => {
  it("one employee's PDF failure does not stop the others in the same run", async () => {
    let callCount = 0;
    const { deps, documentRepository, notificationService } = buildDeps({
      generatePdf: async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error("PDF failed for employee B");
        }
        return Buffer.from("%PDF-1.4 fake");
      },
    });

    const inputs = [
      dispatchInput({ salaryPaymentId: "sp_a", userId: "user_a", email: "a@example.com" }),
      dispatchInput({ salaryPaymentId: "sp_b", userId: "user_b", email: "b@example.com" }),
      dispatchInput({ salaryPaymentId: "sp_c", userId: "user_c", email: "c@example.com" }),
    ];

    const summary = await dispatchPayslipsForPayrollRun(inputs, deps);

    assert.equal(summary.total, 3);
    assert.equal(summary.employeesWithFailures, 1);
    assert.equal(summary.pdfFailures, 1);
    assert.equal(summary.results[0].notificationRaised, true); // A succeeded
    assert.equal(summary.results[1].notificationRaised, false); // B failed
    assert.equal(summary.results[2].notificationRaised, true); // C succeeded, unaffected by B

    assert.equal(documentRepository.documents.size, 2); // only A and C
    assert.equal(notificationService.calls.length, 2);
  });
});

describe("createPayslipDriveTarget — month/branch folder caching within one payroll run", () => {
  function fakeDriveClientFactory(onCall: (query: string) => void): DriveClientFactory {
    let idCounter = 0;
    return () =>
      ({
        files: {
          list: async ({ q }: { q: string }) => {
            onCall(q);
            return { data: { files: [] } }; // never pre-existing — every call creates
          },
          create: async ({ requestBody }: { requestBody: { name: string } }) => ({
            data: { id: `folder_${++idCounter}`, name: requestBody.name },
          }),
        },
      }) as any;
  }

  function fakeConfig(): ResolvedGoogleDriveConfig {
    return {
      authMethod: "SERVICE_ACCOUNT",
      serviceAccountEmail: "bot@x.iam.gserviceaccount.com",
      privateKey: "fake-key",
      sharedDriveId: null,
      rootFolderId: "root_1",
      rootFolderName: "Payroll",
    };
  }

  /** Phase 19: proves `createPayslipDriveTarget`/`dispatchPayslipForEmployee` are fully authentication-method-agnostic — an OAuth2-shaped config drives the identical Drive upload flow with no code branch anywhere in this file. */
  function fakeOAuthConfig(): ResolvedGoogleDriveConfig {
    return {
      authMethod: "OAUTH2",
      clientId: "123-abc.apps.googleusercontent.com",
      clientSecret: "fake-oauth-client-secret",
      refreshToken: "fake-oauth-refresh-token",
      redirectUri: "https://hrm.example.com/api/google-drive/oauth/callback",
      sharedDriveId: null,
      rootFolderId: "root_1",
      rootFolderName: "Payroll",
    };
  }

  it("resolves the same (month, branch) folder only once across multiple employees, reusing the cached result", async () => {
    const queries: string[] = [];
    const driveService = new GoogleDriveService(fakeDriveClientFactory((q) => queries.push(q)));
    const target = createPayslipDriveTarget(driveService, fakeConfig());

    const first = await target.resolveFolder(2026, 2, "Dhaka Main");
    const second = await target.resolveFolder(2026, 2, "Dhaka Main");

    assert.equal(first.id, second.id);
    // Two Drive lookups total for the whole run (month folder + branch folder) — not four.
    assert.equal(queries.length, 2);
  });

  it("resolves a different branch in the same month as a separate (uncached) branch folder", async () => {
    const queries: string[] = [];
    const driveService = new GoogleDriveService(fakeDriveClientFactory((q) => queries.push(q)));
    const target = createPayslipDriveTarget(driveService, fakeConfig());

    await target.resolveFolder(2026, 2, "Dhaka Main");
    await target.resolveFolder(2026, 2, "Unassigned");

    // Month folder ("February 2026") is cached separately from the branch level —
    // looked up exactly once even though two different branch folders were resolved.
    assert.equal(queries.filter((q) => q.includes("'February 2026'")).length, 1);
    assert.equal(queries.filter((q) => q.includes("'Dhaka_Main'")).length, 1);
    assert.equal(queries.filter((q) => q.includes("'Unassigned'")).length, 1);
  });

  it("Phase 19: resolves folders and uploads identically when given an OAuth2-shaped ResolvedGoogleDriveConfig instead of Service Account — createPayslipDriveTarget never branches on authMethod", async () => {
    const queries: string[] = [];
    const driveService = new GoogleDriveService(fakeDriveClientFactory((q) => queries.push(q)));
    const target = createPayslipDriveTarget(driveService, fakeOAuthConfig());

    const folder = await target.resolveFolder(2026, 2, "Dhaka Main");
    assert.ok(folder.id);

    const uploaded = await target.upload({ parentFolderId: folder.id, filename: "payslip.pdf", content: Buffer.from("fake pdf bytes") });
    assert.ok(uploaded.id);
    assert.equal(queries.filter((q) => q.includes("'February 2026'")).length, 1);
  });
});
