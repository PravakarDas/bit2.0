import {
  DocumentRepository,
  NotificationHistoryRepository,
  NotificationJobRepository,
  NotificationProviderRepository,
  NotificationRepository,
  NotificationTemplateRepository,
} from "./repositories";
import { ChannelAdapterFactory } from "./factories";
import { NotificationService } from "./notification.service";
import { QueueEngine, QueueRepository } from "./queue";

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
  };
}

export const notificationEngineContainer = createNotificationEngineContainer();
