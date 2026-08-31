import { readFile } from "node:fs/promises";
import { extname, basename } from "node:path";
import type { IDocumentRepository } from "../repositories/interfaces";
import type { NotificationAttachment } from "../factories";
import { DocumentError } from "../errors";
import { NOTIFICATION_ENGINE_LIMITS } from "../constants";

/**
 * Generic filename-extension → MIME type lookup. Deliberately not a
 * "PDF-specific" table — any future `Document.type` (offer letter, EMI
 * schedule, ...) that happens to also be a PDF, image, etc. resolves
 * correctly through the same generic path. Unknown extensions fall back to
 * `application/octet-stream`, never a guess.
 */
const EXTENSION_CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".txt": "text/plain",
  ".csv": "text/csv",
});

function inferContentType(filename: string): string {
  return EXTENSION_CONTENT_TYPES[extname(filename).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Turns a `NotificationJob.documentId` into a delivery-ready
 * `NotificationAttachment` (real bytes, filename, content type) — the one
 * place in the dispatch pipeline that touches the `Document` model and the
 * local filesystem. Kept as its own interface (mirroring `ITemplateEngine`/
 * `INotificationRepository` — both injected into `JobDispatcher` as
 * interfaces, never concrete Prisma-backed classes) so `JobDispatcher`
 * stays testable with a fake, and so `SmtpDeliveryProvider` (and any future
 * channel provider) never needs to know `Document`/Prisma/the filesystem
 * exist — it only ever receives an already-resolved `NotificationAttachment`.
 */
export interface IDocumentAttachmentResolver {
  resolve(documentId: string): Promise<NotificationAttachment>;
}

/**
 * Real implementation: `IDocumentRepository` (existing, Phase 1) for the
 * `Document` row, `node:fs/promises` for the bytes at `Document.localTempPath`
 * (the only location a generated document lives today — `driveFileId`/
 * `driveFileUrl` remain unused, per DocumentEngine's own dormant-scaffolding
 * state; a future Drive-backed resolver would implement the same
 * `IDocumentAttachmentResolver` interface, not replace this class).
 *
 * Every failure mode below throws `DocumentError` (Phase 1, defined but
 * never thrown until now) rather than returning a "no attachment" value —
 * a job with a `documentId` that cannot be resolved must never silently
 * send without its required attachment (fails the whole `dispatch()` call,
 * which the existing worker retry/dead-letter routing already handles
 * exactly like a `TemplateNotFoundError` today — no new outcome kind
 * needed). Never logs file bytes/content, only metadata.
 */
export class DocumentAttachmentResolver implements IDocumentAttachmentResolver {
  constructor(
    private readonly documentRepository: IDocumentRepository,
    /** Injectable for testability — a real multi-MB fixture file would be wasteful in a unit test. */
    private readonly maxAttachmentBytes: number = NOTIFICATION_ENGINE_LIMITS.maxAttachmentBytes
  ) {}

  async resolve(documentId: string): Promise<NotificationAttachment> {
    const document = await this.documentRepository.findById(documentId);
    if (!document) {
      throw new DocumentError(`Document not found: ${documentId}`, documentId);
    }

    if (document.status !== "GENERATED_LOCAL" || !document.localTempPath) {
      throw new DocumentError(
        `Document ${documentId} has no locally generated file to attach (status=${document.status})`,
        documentId
      );
    }

    let content: Buffer;
    try {
      content = await readFile(document.localTempPath);
    } catch (cause) {
      throw new DocumentError(`Failed to read file for document ${documentId}`, documentId, { cause });
    }

    if (content.length === 0) {
      throw new DocumentError(`Document ${documentId} resolved to an empty file`, documentId);
    }

    if (content.length > this.maxAttachmentBytes) {
      throw new DocumentError(
        `Document ${documentId} exceeds the maximum attachment size (${content.length} > ${this.maxAttachmentBytes} bytes)`,
        documentId
      );
    }

    const filename = basename(document.localTempPath);
    return { filename, contentType: inferContentType(filename), content };
  }
}
