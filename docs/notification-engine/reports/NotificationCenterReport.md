# Notification Center Report (Phase 12 — Notification Center)

This phase builds a read-oriented presentation/management layer over the Notification Engine: an Employee Notification Center (view/read/archive/delete one's own notifications) and an Administrator Notification Center (everything employees have, plus queue/delivery/provider visibility and two manual queue actions). No frozen Notification Engine component (`QueueEngine`, `WorkerRuntime`, `TemplateEngine`, `DeliveryManager`, `NotificationService`, SMTP Provider) was redesigned, extended, or modified.

## Goal & Scope

Give employees and administrators a UI over data the engine already produces (`NotificationJob`, `NotificationEvent`, `NotificationDeliveryAttempt`, `NotificationProvider`) without ever enqueuing, sending, retrying automatically, bypassing `NotificationService`, or touching `WorkerRuntime`. The only two mutations this phase adds (manual retry, dead-letter requeue) change `NotificationJob.status`/`nextAttemptAt`/`attemptCount` directly via Phase 2's existing generic repository — never through `QueueEngine`.

## A Schema Question, Resolved With the User Before Implementation

The FEATURES list requires read/unread/archived/deleted state and filtering by delivery status + channel — none of which exist on `NotificationJob`/`NotificationEvent` (frozen) or on the pre-existing, unrelated `EmployeeNotification`/`AdminNotification` tables (which have no channel/delivery-status concept and are a different, older in-app notification system this phase does not touch). This was surfaced to the user directly before writing any code. Agreed design:

- **One new, purely additive table**, `NotificationJobInboxState` (one row per `(notificationJobId, userId)`), added to `prisma/schema.prisma`. No column was added to `NotificationJob`, `NotificationEvent`, or any other existing table — verified by reading the generated migration SQL end to end (it contains exactly one `CREATE TABLE`, four `CREATE INDEX`/`CREATE UNIQUE INDEX`, and two `ALTER TABLE ... ADD CONSTRAINT` statements, all targeting `NotificationJobInboxState` only).
- **Two required virtual back-relation fields** (`NotificationJob.inboxStates` and `User.notificationJobInboxStates`) were added to satisfy Prisma's schema validation (a `@relation(fields:...)` on one side requires a corresponding relation field on the other) — these produce **zero migration SQL**; they exist only in `schema.prisma` for query ergonomics. Both are clearly commented at the point of change.
- **The migration was generated but not applied.** `prisma migrate dev --create-only` was attempted first; it detected pre-existing drift between this project's live database and its migration history (unrelated to this phase — three earlier migrations, including the original `20260722000000_add_notification_engine_foundation`, already have this exact issue documented in their own file headers) and refused to proceed without offering a full schema reset. Per the user's explicit instruction, no reset — or any other database-touching command — was run. The migration SQL was instead **hand-authored**, matching the exact style/conventions of every other file in `prisma/migrations/`, and committed unapplied at `prisma/migrations/20260728120000_add_notification_job_inbox_state/migration.sql`, with its own header explaining why. `prisma generate` (schema-only, no database connection) was run so the Prisma Client recognizes the new model at compile time; until the migration is actually applied, any real (non-test) code path that touches `notificationJobInboxState` will fail at runtime against the live database. **The user must apply this migration before using the Notification Center feature in the real application** — see "Known Limitations."

## Files Created

**Schema / migration**
- `prisma/migrations/20260728120000_add_notification_job_inbox_state/migration.sql` — hand-authored, not applied.

**Backend (`src/lib/services/notification-engine/inbox/`)**
- `dto/notification-job-inbox-state.dto.ts`, `dto/inbox-view-model.dto.ts`, `dto/inbox-query.dto.ts`, `dto/index.ts`
- `event-title.util.ts` — pure `eventType` → display title formatter (no template rendering)
- `repositories/interfaces/notification-inbox-state-repository.interface.ts`, `repositories/interfaces/notification-center-jobs-repository.interface.ts`, `repositories/interfaces/index.ts`
- `repositories/notification-inbox-state.repository.ts`, `repositories/notification-center-jobs.repository.ts`, `repositories/index.ts`
- `notification-inbox.service.ts` — the core query + command logic (see "Architecture")
- `notification-inbox.service.test.ts` — 31 tests
- `index.ts` (barrel)

**Server Actions**
- `src/actions/notification-inbox.actions.ts` (employee-facing)
- `src/actions/notification-admin.actions.ts` (administrator-facing)

**UI**
- `src/components/shared/notification-center/NotificationStatusBadge.tsx`
- `src/components/shared/notification-center/NotificationTable.tsx`
- `src/components/shared/notification-center/NotificationFiltersBar.tsx`
- `src/components/shared/notification-center/NotificationPagination.tsx`
- `src/components/shared/notification-center/NotificationDetailDrawer.tsx`
- `src/app/(employee)/notification-center/page.tsx`
- `src/app/(admin)/admin/notification-center/page.tsx`

**Docs**
- `docs/notification-engine/reports/NotificationCenterReport.md` — this file.

## Files Modified

| File | Change |
|---|---|
| `prisma/schema.prisma` | Added `NotificationJobInboxState` model + the two virtual back-relation fields described above. No other model changed. |
| `container.ts` | Constructs `NotificationCenterJobsRepository`/`NotificationInboxStateRepository`/`NotificationInboxService` and exposes `inboxService` on the container — additive, reuses `jobRepository`/`templateEngine`/`queueEngine` already built there. |
| `index.ts` (engine barrel) | `export * from "./inbox"`. |
| `src/components/AppSidebar.tsx` | One new nav entry each for admin (`/admin/notification-center`) and employee (`/notification-center`) — the pre-existing `/admin/notifications` entry (the older, unrelated `AdminNotification`-based page) is untouched. |
| `tsconfig.test.json` / `package.json` | Added `inbox/**/*.ts` to the compiled/run test set. |

## Architecture

`NotificationInboxService` is the one class both actions files call into. It depends only on interfaces — two new ones this phase adds (`INotificationCenterJobsRepository`, `INotificationInboxStateRepository`), plus three reused unmodified: `INotificationJobRepository` (Phase 2 — used only for the two manual queue actions' `findById`/`update`), `ITemplateEngine` (Phase 5 — on-demand rendering in detail views only), `IQueueEngine` (Phase 3 — `getQueueStatus()` delegates directly to `getStatistics()`). It never imports `QueueEngine`, `WorkerRuntime`, or `NotificationService` — nothing in this phase can enqueue, dispatch, or raise an event.

`INotificationCenterJobsRepository` (new) exists because Phase 2's `INotificationJobRepository.findMany` has no pagination-with-total-count, no join with `NotificationEvent`, and no arbitrary include/exclude id-set filtering — a genuinely different, list-shaped read concern this module is the first caller of. It reuses `NotificationJob`'s **existing** relations (`event`, `deliveryAttempts`, `recipient` — all Phase 1, unmodified) via Prisma's `include`, never a per-row query.

## Design Decisions

**"Notifications" are `NotificationJob` rows, not the pre-existing `EmployeeNotification`/`AdminNotification` tables.** Those tables (used elsewhere in the app, e.g. `loan.actions.ts`'s in-app alerts) have no channel or delivery-status concept and are unrelated to this engine; the FEATURES list's explicit "filter by delivery status/channel" and the admin section's "provider used/rendered content/payload/worker information" are only expressible against `NotificationJob`+`NotificationEvent`+`NotificationDeliveryAttempt`.

**Admin read/unread/archived filtering only applies when scoped to one `recipientUserId`.** Read/archived/deleted are inherently per-recipient state (`NotificationJobInboxState.userId` is always the job's actual recipient). Viewing "all notifications across every employee" at once has no single owner to resolve those flags against, so `listForAdmin` skips them unless the admin scopes to a specific employee — at which point the exact same resolution logic the employee view uses applies. Channel/status/date-range/search filters work at every scope.

**"Retry failed manually" and "Requeue dead-letter" bypass `QueueEngine` entirely, using Phase 2's plain `INotificationJobRepository.update()`.** This phase's own STOP conditions forbid changing `QueueEngine` or `NotificationService` — including adding a new method to either, even an additive one. `QueueStateMachine` (Phase 3, frozen) already declares `DEAD_LETTER -> QUEUED` as legal, which is what makes dead-letter requeue possible "cleanly" per this phase's own conditional instruction; `requeueDeadLetter` deliberately checks `job.status === "DEAD_LETTER"` directly rather than the broader `QueueStateMachine.canTransition(job.status, "QUEUED")`, because that broader check is *also* true from `PROCESSING` (the worker's own `release()` transition) — an admin action must never race a live worker. `retryNow` only ever advances `nextAttemptAt` on an already-`RETRY_SCHEDULED` job; it never touches `status`. `NotificationService.resendJob()`'s own docstring anticipated exactly this capability for "a future admin/dashboard phase" — but since touching `notification.service.ts` is explicitly off-limits this phase, that stub remains untouched, and this logic lives entirely in the new `NotificationInboxService` instead. A future phase that's allowed to modify `NotificationService` could migrate this logic into `resendJob()` without changing either action's public contract.

**Search is a best-effort proxy, not full-text.** "Title" search matches `eventType` (benefits from its existing `@@index([eventType])`); "body" search matches the event's JSON `payload` cast to text via one raw SQL query (Prisma's query builder has no free-text `contains` for an unstructured `Json` column, and adding a GIN index would mean altering the frozen `NotificationEvent` table). Acceptable at this app's data scale; disclosed as a known limitation, not silently assumed adequate forever.

## Security & Authorization

- **Employee actions** (`notification-inbox.actions.ts`) resolve the caller via `getDbUser()` and pass `user.id` into every service call; the service itself double-checks ownership on every mutation and on `getDetailForUser` (`row.job.recipientUserId === userId`) — a job that isn't the caller's returns the same "not found" result as a genuinely missing job, so existence is never leaked.
- **Administrator viewing** (`getAllNotifications`/`getNotificationDetailForAdmin`/`getNotificationQueueStatus`) requires `SUPERADMIN` or `HR`, matching this codebase's existing "administrator" convention (see `loan.actions.ts`'s `approveLoan`).
- **Manual retry/requeue** require `SUPERADMIN` specifically, per this phase's own explicit Security requirement — checked inline in each action, matching this project's "every action re-checks permission" convention (no shared middleware).
- **Soft-deleted notifications** are excluded from every list and from `getDetailForUser`/ownership checks, for both the owner and (implicitly, since admin detail doesn't special-case it) — deleted state is a UI-visibility concern, not a data-removal one.

## Performance

- **List queries**: exactly one `search()` call (one `findMany` + one `count`, run in parallel) plus, when read/unread/archived/search filters are active, a small constant number of additional single-purpose id-set queries (`findJobIdsByFlag` × up to 2, `findSearchMatchJobIds` × 1) — never one query per row. Verified directly by a dedicated test asserting call counts stay at 1 regardless of how many notifications exist.
- **Detail views**: one job+event lookup, one inbox-state lookup, and (admin only) one delivery-attempts-with-provider lookup — three queries total, independent of history length.
- **Rendered content is never loaded in list views** — `formatEventTypeAsTitle()` is a pure string function; `TemplateEngine.render()` is only ever called from `buildDetail()`, i.e. only when a specific notification's detail is opened.
- **Recipient display names** (admin list/detail) are resolved via the same single query as the job/event (`include: { recipient: { select: {...} } }`, using `NotificationJob`'s existing `recipient` relation), not a per-row lookup.
- **`getCounts`**: 4 queries total (3 flag-id-sets + 1 all-ids), independent of page size — acceptable for a per-user count computation, not a per-row cost.

## Accessibility

Table rows use semantic `<table>` markup (shadcn's `Table` primitives, built on standard HTML table elements); every icon-only button (`MoreHorizontal`, pagination chevrons) has either visible text nearby or an `aria-label`; the unread indicator dot is supplemented by a visible `aria-label="Unread"` and, in the table, the entire row's background tint — not color alone. The detail drawer uses `Sheet` (Radix Dialog under the hood), which provides focus trapping and `Escape`-to-close for free.

## Tests Executed

Clean rebuild, stable across 2 consecutive runs (backend/service tests only — this codebase has no React/UI test runner in any prior phase, and this phase does not introduce one; UI pages were verified via `tsc --noEmit` type-checking and manual review, not automated component tests):

```
tests 476   suites 121   pass 476   fail 0
```

31 new tests in `notification-inbox.service.test.ts`. All 445 pre-existing tests remain green, unmodified.

## Coverage

| Testing section item | Covered by |
|---|---|
| Employee access | "employee access (authorization/scoping)" suite — own-jobs-only scoping, ownership-checked detail/mutations |
| Administrator access | "administrator access" suite — cross-recipient listing, recipient-scoped read/archived state, admin-only detail fields, queue status pass-through |
| Search | "search" suite — title proxy, body proxy, employee-scoped search |
| Filtering | "filtering" suite — channel, delivery status, date range, archived, read/unread (including jobs with no inbox-state row yet), deleted-always-excluded |
| Pagination | "pagination" suite — page/pageSize/totalPages across multiple pages |
| Read/unread | "read/unread" suite — markRead, markAllRead (including idempotent re-run), getCounts |
| Archive | "archive" suite — archive/unarchive round-trip, deleteArchived's archived-only precondition |
| Manual retry | "manual retry" suite — success, wrong-status refusal, not-found |
| Dead-letter requeue | "dead-letter requeue" suite — success (status/attemptCount/lock reset), PROCESSING refusal (the live-worker-race guard), terminal-status refusal |
| Authorization | Woven through the employee-access and administrator-access suites (ownership checks; SUPERADMIN-only enforced at the action layer, not independently re-tested at the service layer since the service has no role awareness by design) |
| Performance-sensitive query behavior | "performance-sensitive query behavior" suite — asserts constant repository-call counts for both list and detail reads |

## Build Verification (Post-Phase-11 Finding)

Running `pnpm run build` surfaced 5 Turbopack warnings ("A Node.js module ... is not supported in the Edge Runtime") tracing `node:crypto`/`process.pid` through `container.ts` → `production-worker.ts` → `instrumentation.ts` (a Phase 11 wiring path, re-surfaced during this phase's verification). Root cause: `proxy.ts`'s `clerkMiddleware` has no declared runtime, so it defaults to Edge; since it matches nearly every route, Next.js also compiles `instrumentation.ts` for the Edge runtime, and Turbopack's warning pass flags any Node-only code reachable in that graph regardless of the existing `NEXT_RUNTIME === "nodejs"` runtime guard. Converting `production-worker.ts`'s import in `instrumentation.ts` from a static top-level import to a dynamic `import()` (still guarded by the same `NEXT_RUNTIME` check) was applied — it does not silence the warning (Turbopack's warning pass runs before the dead-code elimination that would prove the branch unreachable for Edge), but it does ensure the Node-only chain is never eagerly loaded/evaluated in an Edge context, which a static import risked. The build still completes successfully (`✓ Compiled successfully`, full route table generated, including this phase's own routes). The one way to eliminate the warnings entirely — declaring `proxy.ts`'s middleware `runtime: "nodejs"` — was presented to the user and explicitly declined for this phase, since it touches authentication middleware and is a separate, security-sensitive decision outside either Phase 11 or 12's scope. Confirmed with the user as an accepted, cosmetic limitation.

## Technical Debt

- The generated migration is **not yet applied** to the live database — by explicit user instruction, not an oversight. The Notification Center's UI/actions will throw at runtime against the real database until it is applied (`prisma migrate resolve --applied ... && prisma migrate deploy`, or `prisma db execute`, per the migration file's own header).
- Body search (`payload::text ILIKE`) is unindexed — acceptable now, would need revisiting if per-user notification volume grows into the tens of thousands.
- Admin list filtering by read/archived/unread is unavailable when viewing across *every* employee at once (only when scoped to one) — a deliberate, disclosed scope decision, not a bug.

## Breaking Changes

**None.** Every previously-completed phase's public API (`QueueEngine`, `WorkerRuntime`, `TemplateEngine`, `DeliveryManager`, `NotificationService`, SMTP provider) is untouched. The pre-existing `/admin/notifications` page (a different, older feature) is untouched. `container.ts`'s new `inboxService` field is additive.

## Engineering Review Summary

- **Architecture**: A pure read/management layer, exactly as scoped — verified by grep: this phase's new code imports `QueueEngine`/`WorkerRuntime`/`NotificationService` nowhere.
- **Security/Authorization**: Ownership checks on every employee mutation and detail read; role checks (SUPERADMIN-or-HR for viewing, SUPERADMIN for manual queue actions) at the action layer, matching existing convention.
- **Performance/Pagination**: Constant query counts per request regardless of data volume or page size; rendered content never loaded outside detail views — both verified by dedicated tests.
- **Maintainability**: One service, two thin action files, five small shared UI components reused by both employee and admin pages — no logic duplicated between the two roles' pages.
- **SOLID**: `NotificationInboxService` depends only on interfaces (Dependency Inversion); `INotificationCenterJobsRepository` is a narrow, purpose-built interface rather than widening Phase 2's existing one (Interface Segregation); `WorkerLifecycleManager`-style separation is mirrored here — data access, orchestration, and presentation stay in separate layers.
- **DRY**: `NotificationTable`/`NotificationFiltersBar`/`NotificationPagination`/`NotificationDetailDrawer` are shared verbatim between the employee and admin pages, parameterized by props (`showRecipient`, `isAdmin`) rather than duplicated.
- **Accessibility**: Semantic table markup, labeled icon-only controls, focus-trapped/keyboard-dismissable detail drawer.
- **Future extensibility**: Adding a new business event or channel requires no change here — this phase reads whatever `NotificationJob`/`NotificationEvent` rows already exist, regardless of which event type or channel produced them.

## Current Project Status

| Phase | Status |
|---|---|
| 0 — Design | Complete |
| 1 — Database Foundation | Complete |
| 1.5 — Migration Recovery | Complete |
| 2 — Core Infrastructure | Complete |
| 3 — Queue Engine | Complete |
| 4 — Worker Runtime | Complete |
| 5 — Template Engine | Complete |
| 6 — Delivery Framework | Complete |
| 7 — SMTP Delivery Provider | Complete |
| 8 — Engine Integration | Complete |
| 9 — Notification API & Orchestration | Complete |
| 10 — First Business Module Integration | Complete |
| 11 — Production Worker Activation & Operations | Complete |
| **12 — Notification Center** | **Complete (migration generated, not yet applied — see Known Limitations)** |
| 13+ — Notification Preferences, additional channels/business events | Not started |

476/476 tests passing project-wide. `tsc --noEmit` and `eslint` both clean across the entire repository.

## Next Recommended Phase

Apply the generated migration when ready, then verify the Notification Center end to end against the real database. Beyond that: Notification Preferences (per-user channel opt-out — explicitly deferred by this phase's own DO NOT IMPLEMENT list), additional business events, and additional channels — all still the same extension points this engine has been built around since Phase 2.
