import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Deep, RELATIVE imports — not the top-level "@/lib/services/notification-engine"
// barrel, and not the "@/" alias at all — matching every other file in this
// project that's part of the dependency-free `node --test` harness (e.g.
// google-drive-client.ts, google-drive-config.ts, payslip-pdf.service.ts all
// use relative imports exclusively). Two independent reasons:
//   1. The barrel re-exports container.ts, which imports "@/lib/prisma" —
//      pulling that in would break the harness regardless of alias resolution.
//   2. The "@/" alias itself is a TypeScript `paths` mapping resolved only by
//      Next.js's own bundler (webpack/SWC) and by `tsc` for type-checking —
//      it is NOT rewritten in emitted JS. Compiled output run directly via
//      plain `node --test` (this project's test harness, no bundler) hits an
//      unresolvable `require("@/...")` and crashes with "Cannot find module".
import type { IDocumentRepository } from "./notification-engine/repositories/interfaces";
import type { RaiseEventRequest, RaiseEventResult } from "./notification-engine/dto";
import type { PayslipData } from "./payslip-pdf.service";
import { generatePayslipFilename, generatePayrollMonthFolderName, resolveBranchFolderName, getMonthName, sanitizeForDriveName } from "../payslip-filename";
import { GoogleDriveService, type ResolvedGoogleDriveConfig } from "./google-drive-client";

/**
 * Connects the already-built payslip PDF (Phase 18a), Document/attachment
 * pipeline (Phase 18b), Google Drive folder/upload capability, and
 * Notification Engine into the real per-employee post-payroll flow — see
 * `PayrollEmailImplementationPlan.md` §16 (Phase 18c). No Prisma import
 * here (kept dependency-free/testable, matching `google-drive-client.ts`'s
 * own split): `payroll.actions.ts` supplies real, Prisma-backed
 * implementations of every dependency below.
 *
 * Google Drive upload failure must never stop the payslip email — see
 * `dispatchPayslipForEmployee`'s Drive step, wrapped in its own `try/catch`
 * that never aborts the rest of the function. One employee's failure (at
 * any stage) must never stop the rest of a payroll run — see
 * `dispatchPayslipsForPayrollRun`'s per-employee `try/catch`.
 */

export type PayslipDispatchStage = "pdf_generation" | "drive_upload" | "document_creation" | "notification_raise";

export interface PayslipDispatchFailure {
  salaryPaymentId: string;
  userId: string;
  stage: PayslipDispatchStage;
  /** Always a safe, human-readable message — never a raw error object, private key, or file content (see `toSafeMessage`). */
  message: string;
}

export interface PayslipDispatchInput {
  salaryPaymentId: string;
  userId: string;
  email: string;
  employeeName: string;
  /** `null` when the employee has no assigned branch — resolved to the "Unassigned" Drive folder. */
  branchName: string | null;
  /** Used to pick the branch's letterhead template. */
  branchId?: string | null;
  year: number;
  /** 1-12 */
  monthNumber: number;
  payslipData: PayslipData;
  /** Set on a manual resend so the notification's dedupe key differs from the original send (otherwise the engine would treat it as a duplicate). */
  dedupeKeySuffix?: string;
}

/** The one Drive-side capability this module needs — built once per payroll run by `createPayslipDriveTarget`, reused across every employee so month/branch folders are looked up (and cached) only once each, not once per employee. */
export interface PayslipDriveTarget {
  resolveFolder(year: number, monthNumber: number, branchName: string | null): Promise<{ id: string }>;
  upload(input: { parentFolderId: string; filename: string; content: Buffer }): Promise<{ id: string; webViewLink: string | null }>;
}

export interface PayslipDispatchDeps {
  generatePdf: (data: PayslipData, input: PayslipDispatchInput) => Promise<Buffer>;
  /**
   * `uniqueKey` (the salary payment id) keeps each payslip in its own folder: the emailed attachment
   * name is the file's name, and it has no employee id in it, so two employees with the same name
   * must not share a path.
   */
  writeLocalFile: (filename: string, content: Buffer, uniqueKey: string) => Promise<string>;
  /** `null` when Google Drive is not configured at all — the Drive step is then skipped and recorded as a `drive_upload` failure, but email delivery still proceeds. */
  drive: PayslipDriveTarget | null;
  documentRepository: IDocumentRepository;
  notificationService: { raiseEvent(request: RaiseEventRequest): Promise<RaiseEventResult> };
  /** Optional hook for recording a per-employee failure (e.g. `console.error`, or collecting for a single run-level admin alert — see Task 14). Never receives PDF bytes or credentials. */
  onFailure?: (failure: PayslipDispatchFailure) => void;
}

export interface PayslipDispatchResult {
  salaryPaymentId: string;
  userId: string;
  pdfGenerated: boolean;
  driveUploaded: boolean;
  documentId: string | null;
  notificationRaised: boolean;
  failures: PayslipDispatchFailure[];
}

export interface PayslipDispatchSummary {
  total: number;
  results: PayslipDispatchResult[];
  employeesWithFailures: number;
  pdfFailures: number;
  driveFailures: number;
  notificationFailures: number;
}

/** Never returns a raw error object or its stack — Drive errors are already mapped by `mapDriveError` inside `findOrCreateFolder`/`uploadFile`, so this only needs to defend PDF/document/notification-layer errors from leaking anything unexpected. */
function toSafeMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function emptyResult(input: PayslipDispatchInput, failures: PayslipDispatchFailure[]): PayslipDispatchResult {
  return {
    salaryPaymentId: input.salaryPaymentId,
    userId: input.userId,
    pdfGenerated: false,
    driveUploaded: false,
    documentId: null,
    notificationRaised: false,
    failures,
  };
}

/**
 * The full per-employee flow: generate PDF -> upload to Drive (best-effort)
 * -> create the `Document` row the attachment pipeline reads -> raise
 * `PAYROLL_PROCESSED`. Never throws — every stage is isolated so a failure
 * at one stage is recorded and, where the business rules require it (Drive),
 * does not stop the remaining stages.
 *
 * Important, discovered during integration: `DocumentAttachmentResolver`
 * (Phase 18b, frozen) only resolves an attachment when `Document.status ===
 * "GENERATED_LOCAL"`. This function therefore never transitions a payslip
 * `Document`'s status away from `GENERATED_LOCAL` — not even after a
 * successful Drive upload — since doing so would make the email attachment
 * silently stop resolving. Drive's own outcome is recorded through
 * `driveFileId`/`driveFileUrl`/`uploadedAt` and a `DocumentUploadAttempt`
 * row instead, exactly as those fields/table already exist for.
 */
export async function dispatchPayslipForEmployee(input: PayslipDispatchInput, deps: PayslipDispatchDeps): Promise<PayslipDispatchResult> {
  const failures: PayslipDispatchFailure[] = [];
  const recordFailure = (stage: PayslipDispatchStage, message: string) => {
    const failure: PayslipDispatchFailure = { salaryPaymentId: input.salaryPaymentId, userId: input.userId, stage, message };
    failures.push(failure);
    deps.onFailure?.(failure);
  };

  const filename = generatePayslipFilename({
    employeeName: input.employeeName,
    year: input.year,
    monthNumber: input.monthNumber,
  });

  // --- Stage 1: PDF generation. A failure here means there is nothing to
  // upload, attach, or email — the whole employee is skipped, per Task 13's
  // "Employee B -> PDF failure -> record failure -> continue" example.
  let pdfBuffer: Buffer;
  let localPath: string;
  try {
    pdfBuffer = await deps.generatePdf(input.payslipData, input);
    localPath = await deps.writeLocalFile(filename, pdfBuffer, input.salaryPaymentId);
  } catch (error) {
    recordFailure("pdf_generation", toSafeMessage(error));
    return emptyResult(input, failures);
  }

  // --- Stage 2: Google Drive upload (best-effort — CRITICAL BUSINESS RULE:
  // must never stop the email). Caught independently from stage 1/3/4.
  let driveUpload: { id: string; webViewLink: string | null } | null = null;
  if (deps.drive) {
    try {
      const folder = await deps.drive.resolveFolder(input.year, input.monthNumber, input.branchName);
      driveUpload = await deps.drive.upload({ parentFolderId: folder.id, filename, content: pdfBuffer });
    } catch (error) {
      recordFailure("drive_upload", toSafeMessage(error));
    }
  } else {
    recordFailure("drive_upload", "Google Drive is not configured.");
  }

  // --- Stage 3: Document record — always created regardless of the Drive
  // outcome above, so the generated PDF is available for the email
  // attachment even when Drive failed (see module doc comment).
  let documentId: string;
  try {
    const document = await deps.documentRepository.create({
      type: "PAYSLIP",
      sourceEntityId: input.salaryPaymentId,
      status: "GENERATED_LOCAL",
      localTempPath: localPath,
    });

    const updated = await deps.documentRepository.update(document.id, {
      generatedAt: new Date(),
      ...(driveUpload
        ? { driveFileId: driveUpload.id, driveFileUrl: driveUpload.webViewLink ?? null, uploadedAt: new Date() }
        : {}),
    });
    documentId = updated.id;

    const driveFailure = failures.find((f) => f.stage === "drive_upload");
    await deps.documentRepository.addUploadAttempt({
      documentId,
      attemptNumber: 1,
      outcome: driveUpload ? "SUCCESS" : "FAILURE",
      errorMessage: driveFailure?.message,
    });
  } catch (error) {
    recordFailure("document_creation", toSafeMessage(error));
    return { ...emptyResult(input, failures), pdfGenerated: true, driveUploaded: !!driveUpload };
  }

  // --- Stage 4: raise PAYROLL_PROCESSED — NotificationService owns
  // preference checking, job creation, rendering, dispatch, retry, and SMTP
  // delivery from here on (never bypassed).
  let notificationRaised = false;
  try {
    await deps.notificationService.raiseEvent({
      eventType: "PAYROLL_PROCESSED",
      dedupeKey: `PAYROLL_PROCESSED:${input.salaryPaymentId}${input.dedupeKeySuffix ? `:${input.dedupeKeySuffix}` : ""}`,
      sourceDomain: "payroll",
      payload: {
        employeeName: input.employeeName,
        month: getMonthName(input.monthNumber),
        year: input.year,
      },
      recipients: [{ channel: "EMAIL", recipientAddress: input.email, recipientUserId: input.userId, documentId }],
    });
    notificationRaised = true;
  } catch (error) {
    recordFailure("notification_raise", toSafeMessage(error));
  }

  return {
    salaryPaymentId: input.salaryPaymentId,
    userId: input.userId,
    pdfGenerated: true,
    driveUploaded: !!driveUpload,
    documentId,
    notificationRaised,
    failures,
  };
}

/**
 * Runs `dispatchPayslipForEmployee` for every employee in a payroll run,
 * isolating each one — Task 13: "one employee's failure must not stop the
 * rest." The outer `try/catch` is defense-in-depth only:
 * `dispatchPayslipForEmployee` is designed to never throw.
 */
export async function dispatchPayslipsForPayrollRun(
  inputs: PayslipDispatchInput[],
  deps: PayslipDispatchDeps
): Promise<PayslipDispatchSummary> {
  const results: PayslipDispatchResult[] = [];

  for (const input of inputs) {
    try {
      results.push(await dispatchPayslipForEmployee(input, deps));
    } catch (error) {
      const message = toSafeMessage(error);
      deps.onFailure?.({ salaryPaymentId: input.salaryPaymentId, userId: input.userId, stage: "pdf_generation", message });
      results.push(emptyResult(input, [{ salaryPaymentId: input.salaryPaymentId, userId: input.userId, stage: "pdf_generation", message }]));
    }
  }

  return {
    total: inputs.length,
    results,
    employeesWithFailures: results.filter((r) => r.failures.length > 0).length,
    pdfFailures: results.filter((r) => r.failures.some((f) => f.stage === "pdf_generation")).length,
    driveFailures: results.filter((r) => r.failures.some((f) => f.stage === "drive_upload")).length,
    notificationFailures: results.filter((r) => r.failures.some((f) => f.stage === "notification_raise")).length,
  };
}

const PAYSLIP_TEMP_DIR = join(tmpdir(), "bit2-payroll-payslips");

/**
 * Real `writeLocalFile` implementation — writes into a dedicated OS temp
 * subdirectory (`Document.localTempPath`'s only real location today, per
 * `document-attachment-resolver.ts`'s own doc comment). Not a permanent
 * store: Google Drive (when configured) is the durable archive: this is
 * just where the file waits to be read once by the attachment resolver.
 */
export async function writePayslipTempFile(filename: string, content: Buffer, uniqueKey: string): Promise<string> {
  const directory = join(PAYSLIP_TEMP_DIR, sanitizeForDriveName(uniqueKey));
  await mkdir(directory, { recursive: true });
  const filePath = join(directory, filename);
  await writeFile(filePath, content);
  return filePath;
}

/**
 * Builds the real `PayslipDriveTarget` used in production: a resolved
 * Google Drive config + the existing `GoogleDriveService.findOrCreateFolder`/
 * `uploadFile` (no second Drive client). Caches each unique (month, branch)
 * folder lookup for the lifetime of one payroll run, so N employees in the
 * same branch trigger the Drive folder lookup once, not N times, while still
 * relying on `findOrCreateFolder`'s own list-then-create idempotency as the
 * source of truth against duplicate folders.
 */
export function createPayslipDriveTarget(driveService: GoogleDriveService, config: ResolvedGoogleDriveConfig): PayslipDriveTarget {
  // Two cache levels so N employees across M branches in one payroll run
  // trigger at most 1 month-folder lookup + M branch-folder lookups total —
  // not one full month+branch chain per employee.
  const monthFolderCache = new Map<string, Promise<{ id: string; name: string }>>();
  const branchFolderCache = new Map<string, Promise<{ id: string; name: string }>>();

  function getMonthFolder(monthFolderName: string): Promise<{ id: string; name: string }> {
    let pending = monthFolderCache.get(monthFolderName);
    if (!pending) {
      pending = driveService.findOrCreateFolder(config, config.rootFolderId, monthFolderName);
      monthFolderCache.set(monthFolderName, pending);
    }
    return pending;
  }

  return {
    async resolveFolder(year, monthNumber, branchName) {
      const monthFolderName = generatePayrollMonthFolderName(year, monthNumber);
      const branchFolderName = resolveBranchFolderName(branchName);
      const cacheKey = `${monthFolderName}/${branchFolderName}`;

      let pending = branchFolderCache.get(cacheKey);
      if (!pending) {
        pending = (async () => {
          const monthFolder = await getMonthFolder(monthFolderName);
          return driveService.findOrCreateFolder(config, monthFolder.id, branchFolderName);
        })();
        branchFolderCache.set(cacheKey, pending);
      }
      return pending;
    },

    async upload({ parentFolderId, filename, content }) {
      const uploaded = await driveService.uploadFile(config, { parentFolderId, filename, content, mimeType: "application/pdf" });
      return { id: uploaded.id, webViewLink: uploaded.webViewLink };
    },
  };
}
