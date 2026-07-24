# Update — File Change Report & Technical Audit

This file captures, in full, the two most recent status responses covering all work done across Phase 0 through Phase 4 of the Notification Engine build: (1) a complete file-change report with per-file justification and phase attribution, and (2) a precise technical audit (classes/interfaces/functions inventory, breaking changes, performance/concurrency review, and a design-conformance check against `NotificationEngineDesign.md`).

---

# Part 1 — File Change Report (All Phases)

Compiled from git history (3 commits + current uncommitted state) cross-referenced against which phase actually produced each file — several files were committed together even though they originated in different phases. One earlier commit (`276bf55`, "added.md files") is the pre-existing project documentation that existed **before** Phase 0 started and is excluded as not part of this engagement.

**103 unique files touched.** Every change was within the scope of the phase that made it. A handful of files created in one phase were touched again in a later phase — always a small, additive, explicitly-disclosed extension (never altering existing behavior) — marked "cross-phase" below with both phases noted.

## Phase 0 — Notification Engine Design

| File | Why | Scope |
|---|---|---|
| `NotificationEngineDesign.md` | The master architecture blueprint requested by Phase 0 — 45 sections, no code. | **In scope.** Phase 0 explicitly forbade implementation code; this is documentation only. |

## Phase 1 — Database Foundation

| File | Why | Scope |
|---|---|---|
| `prisma/schema.prisma` | Added the 9 Notification Engine models + 5 enums from Design §31, plus 2 relation-array fields on `User` (Prisma requires both sides of a relation declared — this adds zero real columns to the `User` table, purely a type-level addition). | **In scope**, with the `User` touch specifically disclosed and justified in the report (Phase 1's own instruction allowed touching an existing table "if absolutely required," and explained why). |
| `prisma/migrations/20260722000000_add_notification_engine_foundation/migration.sql` | The reviewed, pure-additive SQL for the 9 tables — applied via `prisma db execute` (not `migrate dev`) because of pre-existing migration-history drift discovered mid-phase. | **In scope.** |
| `DatabaseImplementationReport.md` | The deliverable report for this phase. | **In scope.** |

## Phase 1.5 — Migration Recovery

| File | Why | Scope |
|---|---|---|
| `prisma/migrations/20260401230630_y/migration.sql` | Empty, documented placeholder for an orphaned migration (real content unrecoverable — verified via `git log --all` across every branch) whose bookkeeping entry already existed in the live DB. | **In scope.** No `migrate reset` used; only `_prisma_migrations` bookkeeping was touched, per the phase's explicit constraints. |
| `prisma/migrations/20260622000000_time_balance_leave/migration.sql` | Same situation — orphaned, empty placeholder, matches the memory note that this feature's data was previously wiped. | **In scope.** |
| `prisma/migrations/20260613010000_add_email_config/migration.sql` | `EmailConfig` had **zero** migration history despite existing live — reconstructed via an isolated schema diff (verified against the live table before being marked resolved). | **In scope.** |
| `MigrationRecoveryReport.md` | The deliverable report for this phase. | **In scope.** |

## (Audit) — Database Audit

| File | Why | Scope |
|---|---|---|
| `NotificationEngineDatabaseAudit.md` | Read-only verification report (catalog queries, Prisma Client smoke tests) — no schema, code, or bookkeeping change. | **In scope** — purely investigative deliverable. |

## Phase 2 — Core Infrastructure

All new, under `src/lib/services/notification-engine/`, following the repository/DTO/value-object/validator/factory pattern this phase explicitly requested (a deliberate divergence from the rest of the codebase's plain-Server-Actions style, disclosed at the top of `CoreInfrastructureReport.md`).

| Files | Why | Scope |
|---|---|---|
| `errors/notification-error.ts`, `repository-error.ts`, `validation-error.ts`, `provider-error.ts`, `document-error.ts`, `queue-error.ts`, `template-error.ts`, `errors/index.ts` | The exact 7-class error hierarchy requested. | **In scope.** |
| `constants/notification-engine.constants.ts`, `constants/index.ts` | Named defaults mirroring `NotificationSettings`' own schema defaults (worker/retry/retention/provider/template numbers). | **In scope.** |
| `types/enums.ts` | Re-exports (not redefines) the 5 Prisma enums — avoids duplicated interfaces. | **In scope.** |
| `value-objects/dedupe-key.ts`, `idempotency-key.ts`, `channel-address.ts`, `index.ts` | The 3 value objects, `IdempotencyKey` implementing Design §17's exact key format. | **In scope.** |
| `dto/notification-event.dto.ts`, `notification-job.dto.ts`, `notification-delivery-attempt.dto.ts`, `notification-template.dto.ts`, `notification-provider.dto.ts`, `document.dto.ts`, `document-upload-attempt.dto.ts`, `index.ts` | DTOs derived from `@prisma/client` types via `Pick`/`Partial` for all 7 relevant models. | **In scope.** |
| `validators/notification-event.validator.ts`, `notification-job.validator.ts`, `notification-delivery-attempt.validator.ts`, `notification-template.validator.ts`, `notification-provider.validator.ts`, `document.validator.ts`, `document-upload-attempt.validator.ts`, `index.ts` | Structural-only validators (no business rules), one per model. | **In scope.** |
| `repositories/base.repository.ts`, `notification.repository.ts`, `notification-job.repository.ts`, `notification-history.repository.ts`, `notification-template.repository.ts`, `notification-provider.repository.ts`, `document.repository.ts`, `index.ts`, `interfaces/*.interface.ts` (6) + `interfaces/index.ts` | The 6 requested repositories + their interfaces, pure data access only. | **In scope.** |
| `factories/notification-job.factory.ts`, `document.factory.ts`, `channel-adapter.factory.ts`, `channel-adapter.interface.ts`, `index.ts` | 2 fully-implemented construction-only factories + 1 deliberately **empty** `ChannelAdapterFactory` (throws for every channel until registered). | **In scope** — explicitly required to stay empty this phase. |
| `utils/clock.ts`, `pagination.util.ts`, `index.ts` | `IClock`/`SystemClock` (testability) and pagination bounds-checking. | **In scope.** |
| `notification-engine/notification.service.ts` | The `NotificationService` class — read methods fully implemented, `raiseEvent`/`processJob`/`resendJob` are typed stubs only, per this phase's explicit requirement. | **In scope.** |
| `notification-engine/container.ts` | Manual DI wiring (no framework, matching project convention) — first version, wires only Phase 2 pieces. | **In scope.** *(Touched again in Phase 3 and Phase 4 — see below.)* |
| `notification-engine/index.ts` | Barrel export — first version. | **In scope.** *(Touched again in Phase 3 and Phase 4.)* |
| `notification.service.ts` (top-level, `src/lib/services/`) | The frozen public entry point at the exact path Design §21 specifies — first version, exports `notificationService`. | **In scope.** *(Touched again in Phase 3 and Phase 4.)* |
| `CoreInfrastructureReport.md` | The deliverable report for this phase. | **In scope.** |

## Phase 3 — Queue Engine

| Files | Why | Scope |
|---|---|---|
| `queue/queue-engine.ts`, `queue.repository.ts`, `queue-repository.interface.ts`, `queue-state-machine.ts`, `retry-scheduler.ts`, `idempotency-guard.ts`, `logger.interface.ts`, `queue-query.dto.ts`, `errors/duplicate-job.error.ts`, `errors/invalid-queue-transition.error.ts`, `errors/index.ts`, `index.ts` | The Queue Engine itself — atomic locking (`SELECT...FOR UPDATE SKIP LOCKED`), retry math, state machine, idempotency, 2 new error subclasses extending Phase 2's frozen `QueueError`. | **In scope.** |
| `queue/queue-engine.test.ts`, `queue-state-machine.test.ts`, `retry-scheduler.test.ts`, `idempotency-guard.test.ts` | 54 unit tests, zero DB access. | **In scope.** |
| `tsconfig.test.json` (new) | Dependency-free test compile config (`tsc` → CommonJS → `node --test`). | **In scope.** |
| `package.json` | Added `test`/`test:clean` scripts. | **In scope** — a new npm script is not a new dependency. |
| `.gitignore` | Added `/.test-build/`. | **In scope.** |
| `QueueEngineReport.md` | The deliverable report for this phase. | **In scope.** |
| **`repositories/base.repository.ts`** *(created Phase 2)* | **Cross-phase edit.** Broadened `wrap()`'s error passthrough from `instanceof RepositoryError` to `instanceof NotificationError`, because `QueueError` subclasses thrown by the new `QueueRepository` would otherwise have been incorrectly re-wrapped. | **Disclosed exception, in scope.** Strictly additive/backward-compatible (widens a check, changes no existing behavior); explained under "Architecture Compliance" in `QueueEngineReport.md` rather than made silently. |
| **`constants/notification-engine.constants.ts`** *(created Phase 2)* | **Cross-phase edit.** Added a new `queue: { defaultLeaseDurationMs, maxBatchSize }` namespace — no existing field changed. | **Disclosed exception, in scope.** |
| **`notification-engine/container.ts`** *(created Phase 2)* | **Cross-phase edit.** Added `queueEngine` construction/export alongside the existing `notificationService`. | **In scope** — this is the expected "wire the new phase's component into the shared container" step every phase performs. |
| **`notification-engine/index.ts`** *(created Phase 2)* | **Cross-phase edit.** Added `export * from "./queue"`. | **In scope.** |
| **`notification.service.ts`** (top-level) *(created Phase 2)* | **Cross-phase edit.** Added `QueueEngine`/`queueEngine` re-exports. | **In scope.** |

## Phase 4 — Worker Runtime

| Files | Why | Scope |
|---|---|---|
| `worker/worker-lifecycle-state.ts`, `worker-health-status.ts`, `worker-state-machine.ts`, `worker-lifecycle.ts` | The 9-state lifecycle (given sequence + `PAUSED`/`RECOVERING`, required by the public API but absent from the given diagram) and its transition table/tracker. | **In scope**, with the 2 added states explicitly disclosed as this phase's own interpretation, not a hidden addition. |
| `worker/worker-heartbeat.ts`, `worker-health-monitor.ts`, `worker-metrics.ts` | Heartbeat, 5-category health derivation, the 6 requested metrics — all in-memory, no schema change. | **In scope.** |
| `worker/worker-config.ts`, `execution-context.ts` | Configuration + per-job execution context with `AbortController`-based cancellation. | **In scope.** |
| `worker/errors/provider-not-implemented.error.ts`, `errors/index.ts` | `ProviderNotImplementedError`, extending Phase 2's frozen `ProviderError`. | **In scope.** |
| `worker/channel-adapters/stub-channel.adapter.ts`, `register-stub-adapters.ts`, `index.ts` | One generic stub adapter (registered for all 8 channels) that always throws — exactly what this phase's "Provider Adapter" instruction requested, no SMTP. | **In scope.** |
| `worker/job-dispatcher.ts`, `notification-worker.ts`, `notification-worker.interface.ts`, `worker-runtime.ts` | The execution pipeline, the `INotificationWorker` interface (needed to make "mock QueueEngine/mock Provider Adapter" possible), and the lifecycle/loop harness with graceful shutdown. | **In scope.** |
| `worker/create-worker-runtime.ts`, `index.ts` | DI wiring factory + barrel — constructs but never calls `.start()`. | **In scope**, and the non-activation is explicitly called out as a deliberate choice, not an oversight. |
| `worker/*.test.ts` (8 files: state machine, lifecycle, heartbeat, health monitor, metrics, job-dispatcher, notification-worker, worker-runtime) | 75 new unit tests, zero DB access — including 2 real bugs the tests caught and I fixed in source (a `ProviderError` classification gap and a missing defensive `try/catch` in the tick loop). | **In scope.** |
| `WorkerRuntimeReport.md` | The deliverable report for this phase. | **In scope.** |
| **`queue/queue-engine.interface.ts`** (new) | **Cross-phase addition to Phase 3's folder.** `IQueueEngine`, extracted from `QueueEngine`'s already-existing public shape — required because `QueueEngine`'s private fields make it structurally un-mockable without an interface. | **Disclosed exception, in scope.** No method changed; `QueueEngine` just gained `implements IQueueEngine`. |
| **`queue/queue-repository.interface.ts`, `queue.repository.ts`, `queue-engine.ts`** *(created Phase 3)* | **Cross-phase edit.** Added `renewLease(jobId, workerId)` — Phase 3's own report explicitly deferred lease renewal to "the worker that would call it," i.e., this phase. Same guarded compare-and-swap pattern as every other transition. | **Disclosed exception, in scope** — the exact deferral Phase 3 flagged for itself. |
| **`queue/queue-engine.test.ts`, `queue/index.ts`** *(created Phase 3)* | **Cross-phase edit.** Test fake updated to implement the new `renewLease` method (required by the interface extension above); barrel updated to export `IQueueEngine`. | **In scope** — mechanical consequence of the additive interface change. |
| **`notification-engine/container.ts`, `notification-engine/index.ts`, `notification.service.ts`** (top-level) *(created Phase 2, edited Phase 3)* | **Cross-phase edit.** Added `workerRuntime` construction/export, `export * from "./worker"`, and `WorkerRuntime`/`workerRuntime` re-exports respectively. | **In scope** — same "wire the new phase in" pattern as Phase 3's touch. |
| **`package.json`, `tsconfig.test.json`** *(created Phase 3)* | **Cross-phase edit.** Test script glob and `include` extended to cover `worker/**`. | **In scope.** |

### Bottom line

Nothing in any phase touched a business module (`loan.actions.ts` and its siblings), `instrumentation.ts`, any Server Action, any component, or any UI file — confirmed across all 5 phases' own reports and re-confirmed against git. Every cross-phase touch was small, additive, and explicitly disclosed in the report of the phase that made it — none were discovered only while compiling this list.

---

# Part 2 — Technical Audit

Verified directly against the code (not from memory) — grepped every `export class`/`export interface`/`export function`, checked for `$transaction` usage, inspected the actual `search()` query, and confirmed whether the tick loop calls `recoverExpiredLocks`.

## 1. New Public Classes (45)

**Errors (10):** `NotificationError` (abstract), `RepositoryError`, `ValidationError`, `ProviderError`, `DocumentError`, `QueueError`, `TemplateError`, `DuplicateJobError`, `InvalidQueueTransitionError`, `ProviderNotImplementedError`

**Repositories (7):** `BaseRepository` (abstract), `NotificationRepository`, `NotificationJobRepository`, `NotificationHistoryRepository`, `NotificationTemplateRepository`, `NotificationProviderRepository`, `DocumentRepository`

**Value objects (3):** `DedupeKey`, `IdempotencyKey`, `ChannelAddress`

**Factories (3):** `NotificationJobFactory`, `DocumentFactory`, `ChannelAdapterFactory`

**Validators (7):** `NotificationEventValidator`, `NotificationJobValidator`, `NotificationDeliveryAttemptValidator`, `NotificationTemplateValidator`, `NotificationProviderValidator`, `DocumentValidator`, `DocumentUploadAttemptValidator`

**Queue Engine (6):** `QueueRepository`, `QueueEngine`, `QueueStateMachine`, `RetryScheduler`, `IdempotencyGuard`, `NoopLogger`

**Worker Runtime (9):** `WorkerLifecycle`, `WorkerStateMachine`, `WorkerHeartbeat`, `WorkerHealthMonitor`, `WorkerMetricsCollector`, `ExecutionContext`, `JobDispatcher`, `NotificationWorker`, `WorkerRuntime`

**Other (3):** `NotificationService`, `SystemClock`, `StubChannelAdapter`

## 2. New Interfaces (30)

`NotificationEventQueryCriteria`, `NotificationJobQueryCriteria`, `DocumentQueryCriteria`, `ValidationIssue`, `RenderedNotificationContent`, `ChannelDeliveryOutcome`, `NotificationChannelAdapter`, `BuildDocumentParams`, `BuildNotificationJobParams`, `IQueueLogger`, `IQueueEngine`, `QueueSearchCriteria`, `QueueSearchResult`, `PaginationParams`, `IQueueRepository`, `RetryDecision`, `RetrySchedulerOptions`, `IDocumentRepository`, `INotificationHistoryRepository`, `INotificationJobRepository`, `INotificationProviderRepository`, `INotificationRepository`, `INotificationTemplateRepository`, `IClock`, `NormalizedPagination`, `INotificationWorker`, `WorkerConfig`, `WorkerHeartbeatSnapshot`, `WorkerLifecycleTransitionRecord`, `WorkerMetricsSnapshot`

*(Type aliases like `NotificationEventDTO`, `LogContext`, `DispatchOutcome`, `ProcessResult`, `WorkerLifecycleState` are `type`, not `interface` — omitted since only interfaces were asked for.)*

## 3. Exported Functions (5)

| Function | File |
|---|---|
| `createNotificationEngineContainer` | `container.ts` |
| `normalizePagination` | `utils/pagination.util.ts` |
| `registerStubChannelAdapters` | `worker/channel-adapters/register-stub-adapters.ts` |
| `createWorkerRuntime` | `worker/create-worker-runtime.ts` |
| `resolveWorkerConfig` | `worker/worker-config.ts` |

(Plus the module-level singleton `const`s — `notificationEngineContainer`, `notificationService`, `queueEngine`, `workerRuntime` — not functions, listed for completeness since they're the actual consumable exports.)

## 4. Breaking Changes

**None to any already-shipped public signature.** Every cross-phase touch added a method/field/export; nothing was removed, renamed, or had its parameters/return type changed. One item worth flagging precisely rather than glossing over:

- `BaseRepository.wrap()`'s **internal catch condition** was widened from `instanceof RepositoryError` to `instanceof NotificationError` (Phase 3). The method's own signature is unchanged, and no Phase 2 repository ever threw a non-`RepositoryError` `NotificationError` before this, so no real caller observes different behavior — but it *is* a semantic change to error-wrapping behavior, not purely additive in the strictest sense. Worth naming as the one genuinely gray area.

## 5. O(n²) Algorithms

**None found.** Every loop in the queue/worker layer was checked:
- `QueueRepository.recoverExpiredLocks` — one `for` loop over stale jobs, one DB call each (O(n) round trips — a real concern, but it's an **N+1 query pattern**, not O(n²) compute; see below).
- `QueueRepository.getStatistics` — one `for` loop over the grouped-by-status result (max 7 rows, in-memory only).
- `WorkerLifecycle`'s history array uses `push`/`shift`, bounded at 50 entries — negligible even though `shift` is technically O(n).
- No nested loops (loop-inside-a-loop) exist anywhere in this code.

## 6. Unnecessary DB Queries

Two real, worth-naming patterns — both already disclosed as deliberate tradeoffs in the reports, but here is the precise cost:

1. **`recoverExpiredLocks` is N+1**: one `findMany` to locate stale jobs, then one `updateMany` **per job** (to guard on each row's individually-read `lockedAt`). For the expected volume (a handful of crashed jobs at a time), this is fine; if hundreds of jobs were simultaneously stale, this would be hundreds of round trips. A single bulk `UPDATE...RETURNING` with a `WHERE lockedAt = ANY(...)` per-row comparison isn't expressible in one statement without raw SQL — not done, correctly flagged as a "future" consideration, not fixed.
2. **Every guarded transition (`release`, `complete`, `archive`, `markFailed`, `scheduleRetry`, `cancel`, `renewLease`) is 2 queries**: an `updateMany` (the actual guard) followed by a `findUnique` (to fetch the row to return, since `updateMany` doesn't return data). This is intentional — the query builder was chosen over raw `UPDATE...RETURNING` for these, reserving raw SQL only for `claimBatch`'s `SKIP LOCKED` — but it is measurably "2 queries where 1 raw-SQL statement could do it."
3. **`search()` runs `findMany` + `count` in parallel** — 2 queries for one logical call. Standard pagination-with-total pattern; could be one query with a `COUNT(*) OVER()` window function via raw SQL, not worth the complexity at this scale.

## 7. Missing Indexes

Checked every query shape against the 6 indexes actually declared on `NotificationJob` (`[status, nextAttemptAt]`, `[status, lockedAt]`, `[eventId]`, `[recipientUserId]`, `[channel, status]`, `[createdAt]`):

- `claimBatch`, `findQueued`, `findProcessing`, `findRetryCandidates`, `recoverExpiredLocks` — all fully covered.
- **One real gap**: `search()`'s `recipientAddressContains` filter (`{ contains, mode: "insensitive" }`) has **no index at all**, and — more importantly — a plain btree index couldn't help it anyway (substring search needs `pg_trgm` + a GIN index, which doesn't exist in this schema). Any search filtered *only* by recipient-address substring forces a sequential scan. Not fixed; worth a note for whenever the Notification Center UI actually uses this filter.
- No other missing index found.

## 8. Race Conditions

Two different levels, with genuinely different answers:

**Data-level (the part that actually matters for correctness): safe by design.** Every state transition is a Postgres-guarded compare-and-swap (`WHERE status=X AND lockedBy=Y`); `claimBatch` uses `SELECT...FOR UPDATE SKIP LOCKED`. Two concurrent claimers cannot double-claim the same job — the database itself is the source of truth, not any in-process flag.

**In-process lifecycle bookkeeping: a real, narrow, already-partially-disclosed race exists.** `WorkerRuntime.pause()`/`resume()`/`stop()` mutate plain booleans (`pauseRequested`, `stopRequested`) checked at specific points in `tick()`. A rapid `pause()` → `resume()` sequence, called while a tick that was scheduled *before* the pause is still pending, can result in that stale tick firing after resume, attempting `PAUSED → PAUSED` (invalid — caught by `safeTransition`, logged as `worker.transition_race_ignored`, not thrown), and in the narrowest window, briefly having two `scheduleTick` calls in flight. This **cannot** cause double-processing of a job (that's protected at the data level above) — worst case is a harmless duplicate log line or a slightly-early extra tick. The general mitigation (`safeTransition`) was disclosed in the report; this exact scenario had not previously been spelled out.

## 9. Deadlocks

**None identified, and the design specifically avoids the classic setup for them.** Postgres deadlocks require multiple transactions holding locks on multiple rows in inconsistent order. This codebase has **zero explicit multi-statement `$transaction` calls** (verified — grep returns nothing) — every mutation is a single atomic statement. `claimBatch`'s `SKIP LOCKED` exists specifically to avoid lock-wait contention between concurrent claimers rather than have them block on each other at all. No code path acquires more than one row's lock at a time.

## 10. Does the Implementation Match `NotificationEngineDesign.md` 100%?

**No.** Every deviation, listed in one place for the first time:

| # | Deviation | Design reference | Status |
|---|---|---|---|
| 1 | **The crash-recovery reaper is never actually called automatically.** Design §8 states "Every tick starts with a reaper sweep, before claiming new work." `WorkerRuntime.tick()` does not call `recoverExpiredLocks()` at all — verified directly in the code. It's exposed as a callable method (`QueueEngine.recoverExpiredLocks`) but nothing invokes it periodically. | §8 | **Real gap, not previously stated this explicitly.** The report said "no scheduler for calling it" but didn't make clear it isn't even called once per tick as designed. |
| 2 | **`NotificationSettings` (the DB-backed config table, built in Phase 1) is never read.** Design §16/§25/§40 describe worker poll interval, batch size, retry policy, and retention as DB-configurable at runtime (matching this project's own `SystemControlSettings`/`EmailConfig` convention). The actual `WorkerConfig`/`NOTIFICATION_ENGINE_DEFAULTS` are hard-coded TypeScript constants — no repository or code path reads the `NotificationSettings` row at all. | §16, §25, §40 | **Real gap**, not stated in any prior report. |
| 3 | SMTP failover (§9/§10) isn't wired up — `ChannelAdapterFactory` holds exactly one adapter per channel (a `Map`, last `register()` wins), not a priority-ordered list. `JobDispatcher` never tries a second provider. The `NotificationProvider` table's `priority`/`healthStatus` fields exist but are unconsumed by any dispatch logic. | §9, §10 | Disclosed as deferred, but the specific fact that the data model exists unused wasn't spelled out. |
| 4 | `IN_APP_ADMIN`/`IN_APP_EMPLOYEE` are registered with the same `send()`-based `StubChannelAdapter` as external channels. Design §2/§6 describe these as writing *directly* into `AdminNotification`/`EmployeeNotification`, not going through a provider-adapter abstraction at all. | §2, §6 | **Real architectural mismatch**, not previously named. |
| 5 | `RETRY_SCHEDULED → QUEUED` is not a separately-persisted transition; it's folded into `claimBatch`'s atomic promote-and-claim. | §5 (state diagram) | Disclosed in `QueueEngineReport.md`. |
| 6 | `FAILED` is never persisted as an independently-observable resting state — `markFailed()` writes `DEAD_LETTER` directly. | §16, §23 | Disclosed in `QueueEngineReport.md`. |
| 7 | `cancel()` targets `DEAD_LETTER`; the design has no `CANCELLED` state. | — (not in design at all) | Disclosed as an interpretation in `QueueEngineReport.md`. |
| 8 | Document Engine, PDF generation, Google Drive upload, template rendering — entirely unbuilt. | §7, §11–§15 | Disclosed, phased/deferred by explicit instruction each time. |
| 9 | `NotificationPreference` (recipient opt-out checking, §6) has no repository and is never consulted — there's no fan-out/resolution logic to consult it from yet, since `raiseEvent` is still a stub. | §6 | Disclosed as postponed in `CoreInfrastructureReport.md`. |

Items 1, 2, and 4 are the three not previously stated with full clarity — items 1 and 2 in particular are gaps a reader of the prior reports could reasonably have missed.
