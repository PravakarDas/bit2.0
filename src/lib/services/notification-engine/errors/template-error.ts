import { NotificationError, NotificationErrorCode } from "./notification-error";

/**
 * Reserved for the future template-rendering engine (placeholder
 * substitution — see NotificationEngineDesign.md §7). Defined now so the
 * error hierarchy is complete; nothing in this phase throws it yet, since
 * this phase only provides CRUD access to stored template rows, not
 * rendering.
 */
export class TemplateError extends NotificationError {
  readonly code: NotificationErrorCode = "TEMPLATE_ERROR";

  constructor(
    message: string,
    readonly templateKey?: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
  }
}
