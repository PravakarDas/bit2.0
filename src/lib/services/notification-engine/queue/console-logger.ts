import type { IQueueLogger, LogContext } from "./logger.interface";

/**
 * Phase 11's first real (non-`NoopLogger`) `IQueueLogger` implementation.
 * `WorkerRuntime`/`NotificationWorker`/`QueueEngine` have logged startup,
 * shutdown, and job-lifecycle events since Phase 2–4 — but every prior phase
 * wired `NoopLogger` (or left the default), so nothing was ever visible.
 * Plain `console.*`, matching this project's one existing logging
 * convention (no logging library anywhere in this codebase) — the exact gap
 * WorkerRuntimeReport.md's "Intentionally Postponed" section named.
 */
export class ConsoleQueueLogger implements IQueueLogger {
  constructor(private readonly namespace: string = "notification-engine") {}

  debug(event: string, context?: LogContext): void {
    console.debug(`[${this.namespace}] ${event}`, context ?? {});
  }

  info(event: string, context?: LogContext): void {
    console.log(`[${this.namespace}] ${event}`, context ?? {});
  }

  warn(event: string, context?: LogContext): void {
    console.warn(`[${this.namespace}] ${event}`, context ?? {});
  }

  error(event: string, context?: LogContext): void {
    console.error(`[${this.namespace}] ${event}`, context ?? {});
  }
}
