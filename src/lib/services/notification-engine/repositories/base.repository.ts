import { NotificationError, RepositoryError } from "../errors";

/**
 * Shared plumbing for every repository in this module: consistent error
 * wrapping only. Deliberately not a generic `BaseRepository<T>` bound to a
 * specific Prisma delegate — Prisma's per-model delegate types are not
 * uniform enough to make that generic useful, and forcing one would fight
 * the ORM rather than help it. What *is* shared and worth DRY-ing is "catch
 * whatever Prisma throws, don't leak it raw, wrap it in this module's own
 * error type" — every repository method funnels through `wrap`.
 *
 * Phase 3 addendum (see QueueEngineReport.md "Architecture Compliance"):
 * originally this only re-threw `RepositoryError` unwrapped, because no
 * repository threw any other `NotificationError` subclass yet. `QueueRepository`
 * (Phase 3) deliberately throws `DuplicateJobError`/`InvalidQueueTransitionError`
 * (both `QueueError` subclasses) *from inside* a `wrap()` callback — the check
 * was broadened from `instanceof RepositoryError` to `instanceof NotificationError`
 * so those pass through unwrapped too, instead of being incorrectly re-wrapped
 * into a generic `RepositoryError` that would destroy the specific error type.
 * Strictly more permissive than before; changes no existing behavior for any
 * Phase 2 caller (`RepositoryError` still passes through exactly as it did).
 */
export abstract class BaseRepository {
  protected abstract readonly repositoryName: string;

  protected async wrap<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof NotificationError) {
        throw error;
      }
      throw new RepositoryError(
        `${this.repositoryName}.${operation} failed: ${error instanceof Error ? error.message : String(error)}`,
        this.repositoryName,
        { cause: error }
      );
    }
  }
}
