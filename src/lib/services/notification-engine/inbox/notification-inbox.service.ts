import type { INotificationJobRepository } from "../repositories/interfaces";
// Imported directly from their own files, NOT the `../queue` barrel — that
// barrel also value-exports `QueueRepository`, which transitively pulls in
// `@/lib/prisma` and breaks plain `node --test` — the same pitfall
// documented in job-dispatcher.ts, applied here.
import type { IQueueEngine } from "../queue/queue-engine.interface";
import { QueueStateMachine } from "../queue/queue-state-machine";
import type { ITemplateEngine } from "../template/template-engine.interface";
import type { RenderedNotificationContent } from "../factories";
import type { NotificationChannel } from "../types/enums";
import type { NotificationEventDTO, NotificationJobDTO } from "../dto";
import type { QueueStatistics } from "../queue/queue-query.dto";
import type { INotificationCenterJobsRepository, INotificationInboxStateRepository } from "./repositories/interfaces";
import type { NotificationJobInboxStateDTO } from "./dto";
import type {
  AdminInboxDetail,
  AdminInboxListItem,
  InboxCounts,
  InboxDetail,
  InboxListFilters,
  InboxListItem,
  PagedResult,
  PageRequest,
} from "./dto";
import { formatEventTypeAsTitle } from "./event-title.util";

export type ManualActionResult = { success: true } | { success: false; reason: string };

/**
 * The Notification Center's core query + command logic (Phase 12). Pure
 * presentation/management layer, per this phase's ARCHITECTURE section:
 * every read here composes existing, unmodified repository interfaces
 * (`INotificationCenterJobsRepository`/`INotificationInboxStateRepository` —
 * new, additive, Phase 12's own — plus Phase 2's `INotificationJobRepository`
 * and Phase 5's `ITemplateEngine`, reused as-is); the two mutating actions
 * (`retryNow`/`requeueDeadLetter`) only ever change `NotificationJob.status`/
 * `nextAttemptAt`/`attemptCount` via that same existing, generic
 * `INotificationJobRepository.update()` — never `QueueEngine`,
 * `WorkerRuntime`, or `NotificationService`, none of which this class
 * imports. Nothing here enqueues, sends, or retries automatically.
 */
export class NotificationInboxService {
  constructor(
    private readonly jobsRepository: INotificationCenterJobsRepository,
    private readonly inboxStateRepository: INotificationInboxStateRepository,
    private readonly jobRepository: INotificationJobRepository,
    private readonly templateEngine: ITemplateEngine,
    private readonly queueEngine: IQueueEngine
  ) {}

  // ---------------------------------------------------------------------
  // Employee-facing reads
  // ---------------------------------------------------------------------

  async listForUser(userId: string, filters: InboxListFilters, page: PageRequest): Promise<PagedResult<InboxListItem>> {
    const idFilters = await this.resolveIdFilters(userId, filters);
    const { items: rows, total } = await this.jobsRepository.search({
      recipientUserId: userId,
      channel: filters.channel,
      status: filters.deliveryStatus,
      createdAfter: filters.createdAfter,
      createdBefore: filters.createdBefore,
      includeJobIds: idFilters.include,
      excludeJobIds: idFilters.exclude,
      take: page.pageSize,
      skip: (page.page - 1) * page.pageSize,
    });

    const states = await this.inboxStateRepository.findByJobIds(
      rows.map((row) => row.job.id),
      userId
    );
    const stateByJobId = new Map(states.map((state) => [state.notificationJobId, state]));

    const items = rows.map(({ job, event }) => this.toListItem(job, event, stateByJobId.get(job.id)));
    return this.paginate(items, total, page);
  }

  async getDetailForUser(jobId: string, userId: string): Promise<InboxDetail | null> {
    const row = await this.jobsRepository.findByIdWithEvent(jobId);
    if (!row || row.job.recipientUserId !== userId) {
      return null; // not found, or not this user's notification — identical result either way, so existence isn't leaked
    }
    const state = await this.inboxStateRepository.findOne(jobId, userId);
    if (state?.deletedAt) {
      return null; // soft-deleted — the owner shouldn't see it again either
    }
    return this.buildDetail(row.job, row.event, state ?? undefined);
  }

  async getCounts(userId: string): Promise<InboxCounts> {
    const [readIds, archivedIds, deletedIds, allJobIds] = await Promise.all([
      this.inboxStateRepository.findJobIdsByFlag(userId, "READ"),
      this.inboxStateRepository.findJobIdsByFlag(userId, "ARCHIVED"),
      this.inboxStateRepository.findJobIdsByFlag(userId, "DELETED"),
      this.jobsRepository.findAllJobIds(userId),
    ]);

    const readSet = new Set(readIds);
    const archivedSet = new Set(archivedIds);
    const deletedSet = new Set(deletedIds);

    const activeIds = allJobIds.filter((id) => !deletedSet.has(id) && !archivedSet.has(id));
    const unread = activeIds.filter((id) => !readSet.has(id)).length;
    const read = activeIds.length - unread;

    return { unread, read, archived: archivedSet.size, total: activeIds.length };
  }

  // ---------------------------------------------------------------------
  // Employee-facing mutations — all lazily upsert into NotificationJobInboxState
  // ---------------------------------------------------------------------

  async markRead(jobId: string, userId: string): Promise<ManualActionResult> {
    const owns = await this.verifyOwnership(jobId, userId);
    if (!owns) return { success: false, reason: "Notification not found." };
    await this.inboxStateRepository.upsertRead(jobId, userId, new Date());
    return { success: true };
  }

  /** Marks every currently-unread, non-deleted notification read for this user — the default inbox scope, not "everything ever," so an already-archived-but-unread item is included (archiving and reading are independent flags). */
  async markAllRead(userId: string): Promise<ManualActionResult> {
    const [readIds, deletedIds, allJobIds] = await Promise.all([
      this.inboxStateRepository.findJobIdsByFlag(userId, "READ"),
      this.inboxStateRepository.findJobIdsByFlag(userId, "DELETED"),
      this.jobsRepository.findAllJobIds(userId),
    ]);
    const readSet = new Set(readIds);
    const deletedSet = new Set(deletedIds);
    const unreadIds = allJobIds.filter((id) => !readSet.has(id) && !deletedSet.has(id));
    await this.inboxStateRepository.markManyRead(unreadIds, userId, new Date());
    return { success: true };
  }

  async archive(jobId: string, userId: string): Promise<ManualActionResult> {
    const owns = await this.verifyOwnership(jobId, userId);
    if (!owns) return { success: false, reason: "Notification not found." };
    await this.inboxStateRepository.upsertArchived(jobId, userId, new Date());
    return { success: true };
  }

  async unarchive(jobId: string, userId: string): Promise<ManualActionResult> {
    const owns = await this.verifyOwnership(jobId, userId);
    if (!owns) return { success: false, reason: "Notification not found." };
    await this.inboxStateRepository.upsertUnarchived(jobId, userId);
    return { success: true };
  }

  /** Soft delete — only ever valid for an already-archived notification, matching "Delete archived notification" (not a general-purpose delete). */
  async deleteArchived(jobId: string, userId: string): Promise<ManualActionResult> {
    const owns = await this.verifyOwnership(jobId, userId);
    if (!owns) return { success: false, reason: "Notification not found." };
    const state = await this.inboxStateRepository.findOne(jobId, userId);
    if (!state?.isArchived) {
      return { success: false, reason: "Only an archived notification can be deleted." };
    }
    await this.inboxStateRepository.softDelete(jobId, userId, new Date());
    return { success: true };
  }

  // ---------------------------------------------------------------------
  // Admin-facing reads — authorization (SUPERADMIN) is the caller's (Server Action's) responsibility, not this service's
  // ---------------------------------------------------------------------

  async listForAdmin(
    filters: InboxListFilters & { recipientUserId?: string },
    page: PageRequest
  ): Promise<PagedResult<AdminInboxListItem>> {
    // Read/unread/archived are per-recipient concepts — only resolvable when
    // the admin has scoped the view to one specific employee. Viewing across
    // every employee at once skips those three filters (see
    // NotificationCenterReport.md's "Design Decisions").
    const idFilters = filters.recipientUserId
      ? await this.resolveIdFilters(filters.recipientUserId, filters)
      : filters.search?.trim()
        ? { include: await this.jobsRepository.findSearchMatchJobIds(filters.search) }
        : {};

    const { items: rows, total } = await this.jobsRepository.search({
      recipientUserId: filters.recipientUserId,
      channel: filters.channel,
      status: filters.deliveryStatus,
      createdAfter: filters.createdAfter,
      createdBefore: filters.createdBefore,
      includeJobIds: idFilters.include,
      excludeJobIds: idFilters.exclude,
      take: page.pageSize,
      skip: (page.page - 1) * page.pageSize,
    });

    const jobIds = rows.map((row) => row.job.id);
    const states = filters.recipientUserId
      ? await this.inboxStateRepository.findByJobIds(jobIds, filters.recipientUserId)
      : [];
    const stateByJobId = new Map(states.map((state) => [state.notificationJobId, state]));

    const items: AdminInboxListItem[] = rows.map(({ job, event, recipientName }) => ({
      ...this.toListItem(job, event, stateByJobId.get(job.id)),
      recipientUserId: job.recipientUserId,
      recipientName: recipientName ?? null,
    }));
    return this.paginate(items, total, page);
  }

  async getDetailForAdmin(jobId: string): Promise<AdminInboxDetail | null> {
    const row = await this.jobsRepository.findByIdWithEvent(jobId);
    if (!row) return null;

    const state = row.job.recipientUserId
      ? await this.inboxStateRepository.findOne(jobId, row.job.recipientUserId)
      : null;
    const [detail, deliveryAttempts] = await Promise.all([
      this.buildDetail(row.job, row.event, state ?? undefined),
      this.jobsRepository.findDeliveryAttemptsWithProvider(jobId),
    ]);

    return {
      ...detail,
      recipientUserId: row.job.recipientUserId,
      recipientName: row.recipientName ?? null,
      lockedBy: row.job.lockedBy,
      lockedAt: row.job.lockedAt,
      deliveryAttempts,
    };
  }

  /** Read-only pass-through to `QueueEngine.getStatistics()` (Phase 3, unmodified) — "View queue status." */
  async getQueueStatus(): Promise<QueueStatistics> {
    return this.queueEngine.getStatistics();
  }

  // ---------------------------------------------------------------------
  // Admin-facing manual actions — SUPERADMIN-only (enforced by the caller)
  // ---------------------------------------------------------------------

  /** Forces a RETRY_SCHEDULED job's next attempt to happen now instead of waiting out its backoff. Never touches DEAD_LETTER — see `requeueDeadLetter`. */
  async retryNow(jobId: string): Promise<ManualActionResult> {
    const job = await this.jobRepository.findById(jobId);
    if (!job) {
      return { success: false, reason: "Notification job not found." };
    }
    if (job.status !== "RETRY_SCHEDULED") {
      return { success: false, reason: `Only a job scheduled for retry can be retried manually (current status: ${job.status}).` };
    }
    await this.jobRepository.update(jobId, { nextAttemptAt: new Date() });
    return { success: true };
  }

  /**
   * Moves a DEAD_LETTER job back to QUEUED with a fresh attempt count — only
   * because `QueueStateMachine` (Phase 3, frozen, unmodified) already
   * declares `DEAD_LETTER -> QUEUED` as a legal transition (see
   * queue-state-machine.ts); this phase adds no new transition. Deliberately
   * checks `job.status === "DEAD_LETTER"` directly rather than a generic
   * `QueueStateMachine.canTransition(job.status, "QUEUED")` — that broader
   * check is also true from PROCESSING (the worker's own `release()`
   * transition), which must never be triggered by an admin action racing a
   * live worker.
   */
  async requeueDeadLetter(jobId: string): Promise<ManualActionResult> {
    const job = await this.jobRepository.findById(jobId);
    if (!job) {
      return { success: false, reason: "Notification job not found." };
    }
    if (job.status !== "DEAD_LETTER") {
      return { success: false, reason: `Only a dead-lettered job can be requeued (current status: ${job.status}).` };
    }
    if (!QueueStateMachine.canTransition("DEAD_LETTER", "QUEUED")) {
      return { success: false, reason: "Dead-letter requeue is not supported by the current queue design." };
    }
    await this.jobRepository.update(jobId, {
      status: "QUEUED",
      attemptCount: 0,
      nextAttemptAt: new Date(),
      lockedAt: null,
      lockedBy: null,
    });
    return { success: true };
  }

  // ---------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------

  private async verifyOwnership(jobId: string, userId: string): Promise<boolean> {
    const row = await this.jobsRepository.findByIdWithEvent(jobId);
    return row !== null && row.job.recipientUserId === userId;
  }

  private toListItem(
    job: NotificationJobDTO,
    event: NotificationEventDTO,
    state: NotificationJobInboxStateDTO | undefined
  ): InboxListItem {
    return {
      jobId: job.id,
      eventId: event.id,
      eventType: event.eventType,
      title: formatEventTypeAsTitle(event.eventType),
      channel: job.channel,
      deliveryStatus: job.status,
      recipientAddress: job.recipientAddress,
      isRead: state?.isRead ?? false,
      isArchived: state?.isArchived ?? false,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  private async buildDetail(
    job: NotificationJobDTO,
    event: NotificationEventDTO,
    state: NotificationJobInboxStateDTO | undefined
  ): Promise<InboxDetail> {
    const rendered = await this.renderSafely(event, job.channel);
    return {
      ...this.toListItem(job, event, state),
      payload: event.payload,
      renderedSubject: rendered?.subject ?? null,
      renderedBodyHtml: rendered?.bodyHtml ?? null,
      renderedBodyText: rendered?.bodyText ?? null,
      attemptCount: job.attemptCount,
      maxAttempts: job.maxAttempts,
      nextAttemptAt: job.nextAttemptAt,
    };
  }

  /** Rendering is best-effort for a detail view — a missing template or a render error just means "no preview available," not a broken page. */
  private async renderSafely(event: NotificationEventDTO, channel: NotificationChannel): Promise<RenderedNotificationContent | null> {
    const payload = event.payload;
    const context = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
    try {
      return await this.templateEngine.render({ key: event.eventType, channel, context });
    } catch {
      return null;
    }
  }

  private async resolveIdFilters(
    scopeUserId: string,
    filters: InboxListFilters
  ): Promise<{ include?: string[]; exclude?: string[] }> {
    const deletedIds = await this.inboxStateRepository.findJobIdsByFlag(scopeUserId, "DELETED");
    let include: string[] | undefined;
    let exclude: string[] | undefined = deletedIds.length ? [...deletedIds] : undefined;

    if (filters.readStatus === "READ") {
      include = await this.inboxStateRepository.findJobIdsByFlag(scopeUserId, "READ");
    } else if (filters.readStatus === "UNREAD") {
      const readIds = await this.inboxStateRepository.findJobIdsByFlag(scopeUserId, "READ");
      exclude = [...(exclude ?? []), ...readIds];
    }

    const archivedIds = await this.inboxStateRepository.findJobIdsByFlag(scopeUserId, "ARCHIVED");
    if (filters.archived === true) {
      include = include ? include.filter((id) => archivedIds.includes(id)) : archivedIds;
    } else {
      exclude = [...(exclude ?? []), ...archivedIds];
    }

    if (filters.search?.trim()) {
      const searchIds = await this.jobsRepository.findSearchMatchJobIds(filters.search, scopeUserId);
      include = include ? include.filter((id) => searchIds.includes(id)) : searchIds;
    }

    return { include, exclude };
  }

  private paginate<T>(items: T[], total: number, page: PageRequest): PagedResult<T> {
    return {
      items,
      total,
      page: page.page,
      pageSize: page.pageSize,
      totalPages: page.pageSize > 0 ? Math.ceil(total / page.pageSize) : 0,
    };
  }
}
