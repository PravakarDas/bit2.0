/** Structured log context — always an object, never a free-form string concatenation. */
export type LogContext = Record<string, string | number | boolean | null | undefined>;

/**
 * Structured logging contract for the Queue Engine. Per this phase's
 * explicit instruction ("No console.log. Prepare structured logging
 * interfaces only."), this file defines ONLY the interface — no concrete
 * implementation writes to the console, a file, or any real logging
 * backend. `QueueEngine` accepts an `IQueueLogger` via constructor
 * injection (Dependency Inversion) and defaults to `NoopLogger` so it's
 * fully constructible without one. Wiring a real structured-logging backend
 * (this project has none today — see CONTRIBUTING.md's low-dependency
 * norm) is future work, listed in QueueEngineReport.md's "Intentionally
 * Postponed" section.
 */
export interface IQueueLogger {
  debug(event: string, context?: LogContext): void;
  info(event: string, context?: LogContext): void;
  warn(event: string, context?: LogContext): void;
  error(event: string, context?: LogContext): void;
}

/** Safe default — discards everything. Not "logging to console," per the phase's instruction; a real backend is a later decision. */
export class NoopLogger implements IQueueLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}
