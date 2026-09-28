import { createHash } from "node:crypto";
import type {
  IDocumentRepository,
  INotificationHistoryRepository,
  INotificationJobRepository,
  INotificationPreferenceRepository,
  INotificationProviderRepository,
  INotificationRepository,
  INotificationTemplateRepository,
} from "./repositories";
import type { ChannelAdapterFactory } from "./factories";
import type { IQueueEngine } from "./queue";
import type {
  CreateNotificationEventInput,
  DocumentDTO,
  NotificationDeliveryAttemptDTO,
  NotificationEventDTO,
  NotificationJobDTO,
  NotificationProviderDTO,
  NotificationTemplateDTO,
  RaiseEventRequest,
  RaiseEventResult,
} from "./dto";
import type { NotificationChannel } from "./types/enums";
import { QueueError, RepositoryError } from "./errors";
import { NotificationEventValidator, RaiseEventRequestValidator } from "./validators";
import { FixedClock } from "./utils";

/**
 * Prisma's unique-constraint-violation error code
 * (https://www.prisma.io/docs/orm/reference/error-reference#p2002) — same
 * constant `IdempotencyGuard` (queue/idempotency-guard.ts) uses for
 * `NotificationJob.idempotencyKey`. Not reused directly: that guard is
 * hard-coded to the `idempotencyKey` constraint name, and generalizing it to
 * take a constraint name as a parameter would touch a frozen Phase 3 file for
 * a single call site — a local check is cheaper and just as clear.
 */
const PRISMA_UNIQUE_CONSTRAINT_VIOLATION_CODE = "P2002";

/** Deterministic, key-order-independent stringification, used only to derive an event's default `dedupeKey`. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`).join(",")}}`;
}

/**
 * The public façade for the Notification Engine (Phase 9 — Orchestration).
 *
 * This is the ONLY entry point business modules should ever call — see
 * NotificationServiceReport.md's "Public API" section. `raiseEvent` is a pure
 * orchestrator: it validates the request, deduplicates on `dedupeKey`, then
 * for each supplied recipient checks `NotificationPreference` (Phase 13 —
 * see NotificationPreferencesReport.md) and fans out one `NotificationJob`
 * per still-opted-in recipient via the existing `QueueEngine` (Phase 3,
 * reused unmodified — enqueue's own idempotency handling covers job-level
 * dedup), and returns. It never renders a template, never talks to a
 * provider, never touches retry/worker state — those remain
 * `WorkerRuntime`'s job, unchanged since Phase 8.
 *
 * Depends only on repository/engine *interfaces* (Dependency Inversion) —
 * this class has no idea whether it's talking to Prisma or a test double.
 */
export class NotificationService {
  constructor(
    private readonly notificationRepository: INotificationRepository,
    private readonly jobRepository: INotificationJobRepository,
    private readonly historyRepository: INotificationHistoryRepository,
    private readonly templateRepository: INotificationTemplateRepository,
    private readonly providerRepository: INotificationProviderRepository,
    private readonly documentRepository: IDocumentRepository,
    private readonly channelAdapterFactory: ChannelAdapterFactory,
    private readonly queueEngine: IQueueEngine,
    private readonly preferenceRepository: INotificationPreferenceRepository
  ) {}

  // ---------------------------------------------------------------------
  // Read-only passthrough — no business logic
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
  // Orchestration — Phase 9
  // ---------------------------------------------------------------------

  /**
   * Idempotently records a domain event and fans it out into one
   * `NotificationJob` per supplied recipient (Design §6).
   *
   * Event-level dedup: if `dedupeKey` (explicit or derived) already
   * identifies a recorded event, that event is returned as-is — no new jobs
   * are created (Design §17's "a duplicate raiseEvent call... is a no-op").
   * Job-level idempotency is handled by `QueueEngine.enqueue` (Phase 3,
   * unmodified) for each recipient independently.
   */
  async raiseEvent(request: RaiseEventRequest): Promise<RaiseEventResult> {
    RaiseEventRequestValidator.validate(request);

    const dedupeKey = request.dedupeKey?.trim() || this.deriveDedupeKey(request.eventType, request.payload);
    const sourceDomain = request.sourceDomain?.trim() || this.deriveSourceDomain(request.eventType);

    const eventInput: CreateNotificationEventInput = {
      eventType: request.eventType,
      dedupeKey,
      sourceDomain,
      // `RaiseEventRequest.payload` is a plain `Record<string, unknown>` (the shape
      // any business module naturally has on hand) — cast to the DTO's `Prisma.JsonValue`
      // shape, which every JSON-serializable object structurally satisfies at runtime.
      payload: (request.payload ?? undefined) as CreateNotificationEventInput["payload"],
      triggeredByUserId: request.triggeredByUserId ?? undefined,
    };
    NotificationEventValidator.validate(eventInput);

    const existingEvent = await this.notificationRepository.findByDedupeKey(dedupeKey);
    if (existingEvent) {
      return this.deduplicatedResult(existingEvent);
    }

    let event: NotificationEventDTO;
    try {
      event = await this.notificationRepository.create(eventInput);
    } catch (error) {
      // A concurrent raiseEvent call for the same dedupeKey may have raced us
      // between the findByDedupeKey check and this insert — the unique
      // constraint is the real guard, this just detects the race and treats
      // it exactly like a synchronous dedupe hit rather than surfacing a raw
      // constraint-violation error to the caller.
      if (this.isDedupeKeyConflict(error)) {
        const racedEvent = await this.notificationRepository.findByDedupeKey(dedupeKey);
        if (racedEvent) {
          return this.deduplicatedResult(racedEvent);
        }
      }
      throw error;
    }

    const clock = request.scheduledAt ? new FixedClock(request.scheduledAt) : undefined;
    const jobs: NotificationJobDTO[] = [];
    for (const recipient of request.recipients) {
      if (await this.isOptedOut(recipient.recipientUserId, request.eventType, recipient.channel)) {
        // The event itself already exists (inserted above) — only this
        // recipient's delivery job is skipped, so the fact the business
        // event happened remains recorded and queryable even though nothing
        // will be delivered for this (recipient, channel) pair.
        continue;
      }

      const job = await this.queueEngine.enqueue({
        eventId: event.id,
        dedupeKey,
        channel: recipient.channel,
        recipientAddress: recipient.recipientAddress,
        recipientUserId: recipient.recipientUserId ?? undefined,
        documentId: recipient.documentId ?? undefined,
        maxAttempts: request.maxAttempts,
        clock,
      });
      jobs.push(job);
    }

    return { event, jobs, deduplicated: false };
  }

  /**
   * Will: render a job's template, resolve its provider list, attempt
   * delivery with failover, and record the outcome (Design §7). NOT
   * implemented here — this is `WorkerRuntime`'s job as of Phase 8
   * (`JobDispatcher` renders + delivers every claimed job); this method
   * remains a stub so this class never duplicates that pipeline.
   */
  async processJob(): Promise<never> {
    throw new QueueError(
      "NotificationService.processJob is not implemented — job processing is WorkerRuntime's responsibility (see EngineIntegrationReport.md), not NotificationService's. See NotificationEngineDesign.md §7-§10, §16."
    );
  }

  /**
   * Will: manually re-queue a dead-lettered or failed job (Design §7, §32).
   * NOT implemented in this phase — resend is an admin/dashboard action, out
   * of scope for orchestration.
   */
  async resendJob(): Promise<never> {
    throw new QueueError(
      "NotificationService.resendJob is not implemented in this phase — resending is a dashboard/admin action, explicitly out of scope for the Orchestration phase. See NotificationEngineDesign.md §7, §32."
    );
  }

  // ---------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------

  private async deduplicatedResult(event: NotificationEventDTO): Promise<RaiseEventResult> {
    const jobs = await this.jobRepository.findMany({ eventId: event.id });
    return { event, jobs, deduplicated: true };
  }

  /**
   * Default `dedupeKey` = `{eventType}:{hash(payload)}`. Deterministic on the
   * exact same call (a double-click or a retried Server Action reuses the
   * same payload, so it collapses to the same key — Design §17), while two
   * genuinely different events of the same `eventType` (different payload)
   * still get distinct keys. Callers with a stronger domain-specific
   * identity (e.g. "only one notification per loanId ever, regardless of
   * amount") should pass an explicit `dedupeKey`.
   */
  private deriveDedupeKey(eventType: string, payload: RaiseEventRequest["payload"]): string {
    const hash = createHash("sha256").update(stableStringify(payload ?? null)).digest("hex").slice(0, 32);
    return `${eventType}:${hash}`;
  }

  /**
   * Default `sourceDomain` = the lowercased first `_`-delimited segment of
   * `eventType` (e.g. "LOAN_APPROVED" -> "loan"), matching the schema
   * comment's own example (`sourceDomain`: "Which actions.ts domain raised
   * this event, e.g. \"loan\"").
   */
  private deriveSourceDomain(eventType: string): string {
    const [firstSegment] = eventType.split("_");
    return (firstSegment || eventType).toLowerCase();
  }

  /**
   * Resolution rule (Phase 13 — see NotificationPreferencesReport.md):
   * no `NotificationPreference` row for `(userId, notificationType, channel)`
   * means "enabled by default" — a recipient is opted out only when an
   * explicit row exists with `isEnabled: false`. A recipient with no
   * `recipientUserId` (no linked `User` to check a preference against) is
   * never opted out — there is nothing to look up.
   */
  private async isOptedOut(
    recipientUserId: string | null | undefined,
    notificationType: string,
    channel: NotificationChannel
  ): Promise<boolean> {
    if (!recipientUserId) {
      return false;
    }
    const preference = await this.preferenceRepository.findOne(recipientUserId, notificationType, channel);
    return preference?.isEnabled === false;
  }

  private isDedupeKeyConflict(error: unknown): boolean {
    if (!(error instanceof RepositoryError)) {
      return false;
    }
    const cause = error.cause as { code?: string; meta?: { target?: string[] } } | undefined;
    return cause?.code === PRISMA_UNIQUE_CONSTRAINT_VIOLATION_CODE && (cause.meta?.target?.includes("dedupeKey") ?? false);
  }
}
