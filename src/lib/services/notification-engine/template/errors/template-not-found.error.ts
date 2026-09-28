import { TemplateError } from "../../errors";
import type { NotificationChannel } from "../../types/enums";

/** Thrown by `TemplateEngine.render`/`preview` when no active template exists for the given key+channel(+locale). Extends the frozen Phase 2 `TemplateError` additively. */
export class TemplateNotFoundError extends TemplateError {
  constructor(
    templateKey: string,
    readonly channel: NotificationChannel,
    readonly locale?: string,
    options?: { cause?: unknown }
  ) {
    super(
      `No active template found for key "${templateKey}", channel "${channel}"${locale ? `, locale "${locale}"` : ""}.`,
      templateKey,
      options
    );
  }
}
