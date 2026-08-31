import {
  DocumentRepository,
  NotificationHistoryRepository,
  NotificationJobRepository,
  NotificationPreferenceRepository,
  NotificationProviderRepository,
  NotificationRepository,
  NotificationTemplateRepository,
} from "./repositories";
import { randomUUID } from "node:crypto";
import { ChannelAdapterFactory } from "./factories";
import { NotificationService } from "./notification.service";
import { QueueEngine, QueueRepository } from "./queue";
import { createWorkerRuntime, DocumentAttachmentResolver } from "./worker";
import { TemplateEngine, TemplateRegistry } from "./template";
import { DeliveryManager, ProviderHealthMonitor, ProviderMetricsCollector, ProviderRegistry, ProviderResolver } from "./delivery";
import { registerSmtpProvider } from "./delivery/providers/smtp";
import { NotificationCenterJobsRepository, NotificationInboxService, NotificationInboxStateRepository } from "./inbox";
import { NotificationPreferenceService } from "./preferences";

/**
 * Manual dependency wiring — this project has no DI framework/container
 * anywhere else (every existing `src/lib/services/*.service.ts` is a plain
 * exported singleton instance, e.g. `export const emailService = new
 * EmailService()`), so this module "follows current architecture" per this
 * phase's own instruction rather than introducing a DI library as a new
 * dependency. Constructor injection still gives the Dependency Inversion
 * benefit (NotificationService depends on repository *interfaces*, wired
 * here, not on concrete Prisma calls) without adding a framework.
 *
 * `createNotificationEngineContainer()` exists as a factory so tests can
 * build an isolated container with fake repositories; `notificationEngineContainer`
 * is the one real, Prisma-backed instance the app actually uses, exported
 * as a singleton for the same reason `emailService`/`zkTecoService` are.
 */
export function createNotificationEngineContainer(overrides?: {
  notificationRepository?: NotificationRepository;
  jobRepository?: NotificationJobRepository;
  historyRepository?: NotificationHistoryRepository;
  templateRepository?: NotificationTemplateRepository;
  providerRepository?: NotificationProviderRepository;
  documentRepository?: DocumentRepository;
  channelAdapterFactory?: ChannelAdapterFactory;
  queueRepository?: QueueRepository;
  preferenceRepository?: NotificationPreferenceRepository;
}) {
  const notificationRepository = overrides?.notificationRepository ?? new NotificationRepository();
  const jobRepository = overrides?.jobRepository ?? new NotificationJobRepository();
  const historyRepository = overrides?.historyRepository ?? new NotificationHistoryRepository();
  const templateRepository = overrides?.templateRepository ?? new NotificationTemplateRepository();
  const providerRepository = overrides?.providerRepository ?? new NotificationProviderRepository();
  const documentRepository = overrides?.documentRepository ?? new DocumentRepository();
  const channelAdapterFactory = overrides?.channelAdapterFactory ?? new ChannelAdapterFactory();
  const queueRepository = overrides?.queueRepository ?? new QueueRepository();
  const preferenceRepository = overrides?.preferenceRepository ?? new NotificationPreferenceRepository();

  // QueueEngine (Phase 3) — a standalone, directly-usable component per its
  // own scope. As of Phase 9, this is also the mechanism `NotificationService.raiseEvent`
  // fans jobs out through (job-level idempotency is QueueEngine.enqueue's,
  // reused unmodified — see NotificationServiceReport.md).
  const queueEngine = new QueueEngine(queueRepository);

  const notificationService = new NotificationService(
    notificationRepository,
    jobRepository,
    historyRepository,
    templateRepository,
    providerRepository,
    documentRepository,
    channelAdapterFactory,
    queueEngine,
    preferenceRepository
  );

  // NotificationPreferenceService (Phase 13) — read/write access to a user's
  // own preferences, built directly on `preferenceRepository` above (the same
  // instance `NotificationService.raiseEvent` reads from enforcement-side).
  const preferenceService = new NotificationPreferenceService(preferenceRepository);

  // TemplateEngine (Phase 5) — a standalone component, per its own scope,
  // built directly on the same `templateRepository` above (Phase 2,
  // unmodified). As of Phase 8, this IS the instance `workerRuntime`'s
  // `JobDispatcher` renders through before every EMAIL dispatch — see
  // EngineIntegrationReport.md.
  const templateRegistry = new TemplateRegistry(templateRepository);
  const templateEngine = new TemplateEngine(templateRegistry);

  // DeliveryManager (Phase 6) + SmtpDeliveryProvider (Phase 7) — Phase 8
  // registers the engine's one real provider, for EMAIL only.
  // `registerSmtpProvider` is the same registration mechanism any future
  // channel's provider will use (`registerXyzProvider(providerRegistry)`).
  const providerRegistry = new ProviderRegistry();
  const providerHealthMonitor = new ProviderHealthMonitor();
  const providerMetrics = new ProviderMetricsCollector();
  const providerResolver = new ProviderResolver(providerRegistry, providerHealthMonitor);
  const deliveryManager = new DeliveryManager(providerResolver, providerHealthMonitor, providerMetrics);
  registerSmtpProvider(providerRegistry);

  // WorkerRuntime (Phase 4) — constructed, but NOT started, here. Nothing in
  // this container (or anywhere else this phase) calls `.start()`; wiring it
  // into application boot (instrumentation.ts) is explicitly deferred — see
  // WorkerRuntimeReport.md "Intentionally Postponed" (still true as of
  // Phase 8 — "Do NOT activate any worker" is one of this phase's own STOP
  // conditions). Its own `ChannelAdapterFactory` (registered by
  // `createWorkerRuntime`, below) is deliberately separate from the
  // `channelAdapterFactory` above — that one belongs to `NotificationService`'s
  // eventual dispatch path (still unimplemented), this one belongs to the
  // worker's own dispatch pipeline.
  //
  // Phase 8: EMAIL now routes through `deliveryManager` (via
  // `DeliveryManagerChannelAdapter`, registered inside `createWorkerRuntime`)
  // instead of `StubChannelAdapter`; every other channel is still a stub.
  // Dispatch renders through `templateEngine` (using `notificationRepository`
  // to resolve each job's `NotificationEvent`) before handing
  // `RenderedNotificationContent` to the channel adapter — see
  // job-dispatcher.ts's `renderContent()`.
  // DocumentAttachmentResolver (Phase 18b) — turns a job's `documentId` into
  // a delivery-ready attachment (real bytes off `documentRepository`'s
  // `Document.localTempPath`) before dispatch. Built on the same
  // `documentRepository` instance above; see job-dispatcher.ts's
  // `renderContent()` for exactly where this plugs in.
  const documentAttachmentResolver = new DocumentAttachmentResolver(documentRepository);

  const { runtime: workerRuntime } = createWorkerRuntime(
    queueEngine,
    { workerId: `worker-${randomUUID()}` },
    undefined,
    { deliveryManager, eventRepository: notificationRepository, templateEngine, documentAttachmentResolver }
  );

  // Notification Center (Phase 12) — pure read/management layer over the
  // existing repositories/engines above; see inbox/notification-inbox.service.ts's
  // own doc comment. `notificationCenterJobsRepository`/`inboxStateRepository`
  // are this phase's own new, additive repositories; every other dependency
  // handed to `inboxService` (jobRepository, templateEngine, queueEngine) is
  // reused unmodified from above.
  const notificationCenterJobsRepository = new NotificationCenterJobsRepository();
  const inboxStateRepository = new NotificationInboxStateRepository();
  const inboxService = new NotificationInboxService(
    notificationCenterJobsRepository,
    inboxStateRepository,
    jobRepository,
    templateEngine,
    queueEngine
  );

  return {
    repositories: {
      notificationRepository,
      jobRepository,
      historyRepository,
      templateRepository,
      providerRepository,
      documentRepository,
      queueRepository,
      notificationCenterJobsRepository,
      inboxStateRepository,
      preferenceRepository,
    },
    channelAdapterFactory,
    notificationService,
    queueEngine,
    workerRuntime,
    templateEngine,
    providerRegistry,
    providerHealthMonitor,
    providerMetrics,
    preferenceService,
    deliveryManager,
    inboxService,
    documentAttachmentResolver,
  };
}

export const notificationEngineContainer = createNotificationEngineContainer();
