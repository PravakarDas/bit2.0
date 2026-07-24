import { NotificationError, NotificationErrorCode } from "./notification-error";

/**
 * Reserved for the future Document Engine (PDF generation, Google Drive
 * upload — see NotificationEngineDesign.md §11-§15). Defined now so the
 * error hierarchy is complete; nothing in this phase throws it yet, since
 * no PDF/Drive integration exists yet.
 */
export class DocumentError extends NotificationError {
  readonly code: NotificationErrorCode = "DOCUMENT_ERROR";

  constructor(
    message: string,
    readonly documentId?: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
  }
}
