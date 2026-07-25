import {
  DocumentRepository,
  NotificationHistoryRepository,
  NotificationJobRepository,
  NotificationProviderRepository,
  NotificationRepository,
  NotificationTemplateRepository,
} from "./repositories";
import { randomUUID } from "node:crypto";
import { ChannelAdapterFactory } from "./factories";
import { NotificationService } from "./notification.service";
import { QueueEngine, QueueRepository } from "./queue";
import { createWorkerRuntime } from "./worker";
import { TemplateEngine, TemplateRegistry } from "./template";

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
}) {
  const notificationRepository = overrides?.notificationRepository ?? new NotificationRepository();
  const jobRepository = overrides?.jobRepository ?? new NotificationJobRepository();
  const historyRepository = overrides?.historyRepository ?? new NotificationHistoryRepository();
  const templateRepository = overrides?.templateRepository ?? new NotificationTemplateRepository();
  const providerRepository = overrides?.providerRepository ?? new NotificationProviderRepository();
  const documentRepository = overrides?.documentRepository ?? new DocumentRepository();
  const channelAdapterFactory = overrides?.channelAdapterFactory ?? new ChannelAdapterFactory();
  const queueRepository = overrides?.queueRepository ?? new QueueRepository();

  const notificationService = new NotificationService(
    notificationRepository,
    jobRepository,
    historyRepository,
    templateRepository,
    providerRepository,
    documentRepository,
    channelAdapterFactory
  );

  // QueueEngine (Phase 3) — a standalone, directly-usable component per its
  // own scope, not merely a private implementation detail of NotificationService
  // (whose raiseEvent/processJob/resendJob remain stubs — see notification.service.ts).
  const queueEngine = new QueueEngine(queueRepository);

  // WorkerRuntime (Phase 4) — constructed, but NOT started, here. Nothing in
  // this container (or anywhere else this phase) calls `.start()`; wiring it
  // into application boot (instrumentation.ts) is explicitly deferred — see
  // WorkerRuntimeReport.md "Intentionally Postponed". Its own
  // `ChannelAdapterFactory` (with stub adapters registered) is deliberately
  // separate from the one above — that one belongs to `NotificationService`'s
  // eventual dispatch path (still unimplemented), this one belongs to the
  // worker's own dispatch pipeline; they are not required to be the same
  // instance, and keeping them separate avoids a hidden coupling between two
  // still-independently-evolving stub surfaces.
  const { runtime: workerRuntime } = createWorkerRuntime(queueEngine, { workerId: `worker-${randomUUID()}` });

  // TemplateEngine (Phase 5) — a standalone component, per its own scope,
  // built directly on the same `templateRepository` above (Phase 2,
  // unmodified). Not consumed by `notificationService`/`queueEngine`/
  // `workerRuntime` yet — wiring template rendering into the dispatch
  // pipeline is explicitly a later phase's job (see TemplateEngineReport.md).
  const templateRegistry = new TemplateRegistry(templateRepository);
  const templateEngine = new TemplateEngine(templateRegistry);

  return {
    repositories: {
      notificationRepository,
      jobRepository,
      historyRepository,
      templateRepository,
      providerRepository,
      documentRepository,
      queueRepository,
    },
    channelAdapterFactory,
    notificationService,
    queueEngine,
    workerRuntime,
    templateEngine,
  };
}

export const notificationEngineContainer = createNotificationEngineContainer();
