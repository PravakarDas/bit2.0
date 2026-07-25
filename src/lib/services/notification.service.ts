// Public entry point for the Notification Engine, at the exact path fixed by
// NotificationEngineDesign.md §21 ("src/lib/services/notification.service.ts"),
// matching this project's existing singleton-service convention (see
// email.service.ts's `export const emailService = new EmailService()`).
//
// The class itself, its repositories, DTOs, value objects, and DI wiring live
// under ./notification-engine/ — kept out of this file so the public import
// path stays stable while the internals can be reorganized freely. See
// CoreInfrastructureReport.md for the full internal structure.
//
// IMPORTANT: Phase 2 (Core Infrastructure) does not implement email sending,
// SMTP, queueing, workers, Google Drive, or PDF generation.
// `notificationService`'s business-logic methods (`raiseEvent`, `processJob`,
// `resendJob`) are typed stubs only — see notification-engine/notification.service.ts.
//
// Phase 3 (Queue Engine) adds `queueEngine`, re-exported the same way —
// queue persistence/locking/retry-scheduling only, still no SMTP/worker
// loop/PDF/Drive. See QueueEngineReport.md.
//
// Phase 4 (Worker Runtime) adds `workerRuntime` — constructed here, NOT
// started. No code in this repository calls `workerRuntime.start()`; doing
// so is explicitly deferred (see WorkerRuntimeReport.md "Intentionally
// Postponed"). Its dispatch pipeline resolves only `StubChannelAdapter`s
// that throw `ProviderNotImplementedError` — still no real SMTP/delivery.
//
// Phase 5 (Template Engine) adds `templateEngine` — template management,
// rendering, variable substitution, validation, preview, and
// (architecture-only) localization. It sends nothing, and nothing yet
// calls it from `notificationService`/`workerRuntime`'s dispatch path —
// wiring rendering into actual delivery is a later phase. See
// TemplateEngineReport.md.
export { NotificationService } from "./notification-engine/notification.service";
export { QueueEngine } from "./notification-engine/queue";
export { WorkerRuntime } from "./notification-engine/worker";
export { TemplateEngine } from "./notification-engine/template";
export { notificationEngineContainer } from "./notification-engine/container";

import { notificationEngineContainer } from "./notification-engine/container";

export const notificationService = notificationEngineContainer.notificationService;
export const queueEngine = notificationEngineContainer.queueEngine;
export const workerRuntime = notificationEngineContainer.workerRuntime;
export const templateEngine = notificationEngineContainer.templateEngine;
