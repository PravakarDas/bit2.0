import { NotificationError, NotificationErrorCode } from "./notification-error";

/**
 * Thrown by any repository when the underlying database access itself fails
 * (constraint violation, connection error, unexpected Prisma error, etc.).
 * Never thrown for "not found" — repositories return `null` for that; this is
 * reserved for genuine data-access failures.
 */
export class RepositoryError extends NotificationError {
  readonly code: NotificationErrorCode = "REPOSITORY_ERROR";

  constructor(
    message: string,
    readonly repositoryName?: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
  }
}
