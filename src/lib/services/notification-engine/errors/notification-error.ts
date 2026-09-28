export type NotificationErrorCode =
  | "NOTIFICATION_ERROR"
  | "REPOSITORY_ERROR"
  | "VALIDATION_ERROR"
  | "PROVIDER_ERROR"
  | "DOCUMENT_ERROR"
  | "QUEUE_ERROR"
  | "TEMPLATE_ERROR";

/**
 * Base of the Notification Engine error hierarchy. Every error thrown by this
 * module's infrastructure layer (repositories, validators, factories, services)
 * extends this class, never a bare `Error`, so callers can discriminate on
 * `instanceof NotificationError` or on `.code` without depending on any single
 * concrete subclass.
 */
export abstract class NotificationError extends Error {
  abstract readonly code: NotificationErrorCode;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
