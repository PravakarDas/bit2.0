import type {
  IDocumentRepository,
  INotificationHistoryRepository,
  INotificationJobRepository,
  INotificationProviderRepository,
  INotificationRepository,
  INotificationTemplateRepository,
} from "./repositories";
import type { ChannelAdapterFactory } from "./factories";
import type {
  DocumentDTO,
  NotificationDeliveryAttemptDTO,
  NotificationEventDTO,
  NotificationJobDTO,
  NotificationProviderDTO,
  NotificationTemplateDTO,
} from "./dto";
import type { NotificationChannel } from "./types/enums";
import { QueueError } from "./errors";

/**
 * The public façade for the Notification Engine's core infrastructure.
 *
 * IMPORTANT — scope boundary for this phase (see NotificationEngineDesign.md
 * §7/§22 and CoreInfrastructureReport.md): this class does NOT send email,
 * does NOT talk to SMTP, does NOT enqueue/claim/retry jobs, does NOT render
 * templates, and does NOT resolve recipients from a domain event. Every
 * method that would require one of those things is present as a typed,
 * documented stub that throws — the *shape* future phases will implement
 * against, not a working implementation of the business logic itself.
 *
 * The read-only passthrough methods (`getEventById`, `getJobById`, ...) ARE
 * fully implemented: they involve zero business logic, just delegation to a
 * repository, so there's no reason to stub what's already safe to ship.
 *
 * Depends only on repository *interfaces* (Dependency Inversion) — this
 * class has no idea whether it's talking to Prisma or a test double.
 */
export class NotificationService {
  constructor(
    private readonly notificationRepository: INotificationRepository,
    private readonly jobRepository: INotificationJobRepository,
    private readonly historyRepository: INotificationHistoryRepository,
    private readonly templateRepository: INotificationTemplateRepository,
    private readonly providerRepository: INotificationProviderRepository,
    private readonly documentRepository: IDocumentRepository,
    private readonly channelAdapterFactory: ChannelAdapterFactory
  ) {}

  // ---------------------------------------------------------------------
  // Read-only passthrough — safe to implement now (no business logic)
  // ---------------------------------------------------------------------

  async getEventById(id: string): Promise<NotificationEventDTO | null> {
    return this.notificationRepository.findById(id);
  }

  async getEventByDedupeKey(dedupeKey: string): Promise<NotificationEventDTO | null> {
    return this.notificationRepository.findByDedupeKey(dedupeKey);
  }

  async getJobById(id: string): Promise<NotificationJobDTO | null> {
    return this.jobRepository.findById(id);
  }

  async getJobHistory(jobId: string): Promise<NotificationDeliveryAttemptDTO[]> {
    return this.historyRepository.findByJobId(jobId);
  }

  async getActiveTemplate(key: string, channel: NotificationChannel): Promise<NotificationTemplateDTO | null> {
    return this.templateRepository.findActiveByKeyAndChannel(key, channel);
  }

  async getActiveProvidersForChannel(channel: NotificationChannel): Promise<NotificationProviderDTO[]> {
    return this.providerRepository.findActiveByChannelOrderedByPriority(channel);
  }

  async getDocumentById(id: string): Promise<DocumentDTO | null> {
    return this.documentRepository.findById(id);
  }

  // ---------------------------------------------------------------------
  // Business-logic entry points — STUBS ONLY in this phase.
  //
  // These signatures match NotificationEngineDesign.md §7/§22 exactly, so a
  // later phase implements *behavior* here without changing this class's
  // public contract or any caller of it (Open/Closed Principle).
  // ---------------------------------------------------------------------

  /**
   * Will: idempotently record a domain event (via `dedupeKey`) and fan it out
   * into one `NotificationJob` per recipient/channel pair (Design §6). NOT
   * implemented in this phase — recipient/channel resolution is business
   * logic, and job creation here would mean this method enqueues work, which
   * this phase is explicitly barred from doing.
   */
  async raiseEvent(): Promise<never> {
    throw new QueueError(
      "NotificationService.raiseEvent is not implemented in this phase — it requires recipient/channel resolution and job fan-out, both explicitly out of scope for the Core Infrastructure phase. See NotificationEngineDesign.md §6."
    );
  }

  /**
   * Will: render a job's template, resolve its provider list, attempt
   * delivery with failover, and record the outcome (Design §7). NOT
   * implemented in this phase — this is the queue worker's job, and this
   * phase builds no worker, no SMTP client, and no template renderer.
   */
  async processJob(): Promise<never> {
    throw new QueueError(
      "NotificationService.processJob is not implemented in this phase — it requires template rendering, provider dispatch, and retry scheduling, all explicitly out of scope for the Core Infrastructure phase. See NotificationEngineDesign.md §7-§10, §16."
    );
  }

  /**
   * Will: manually re-queue a dead-lettered or failed job (Design §7, §32).
   * NOT implemented in this phase — requeueing is queue/business logic.
   */
  async resendJob(): Promise<never> {
    throw new QueueError(
      "NotificationService.resendJob is not implemented in this phase — resending is queue-processing logic, explicitly out of scope for the Core Infrastructure phase. See NotificationEngineDesign.md §7, §32."
    );
  }
}
