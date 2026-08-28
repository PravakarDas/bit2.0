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

---

# Phase 5 — Template Engine

Full detail in [TemplateEngineReport.md](../reports/TemplateEngineReport.md). Summary below, in the same structure as the rest of this file.

## Files Created

39 new files under `src/lib/services/notification-engine/template/`:

- **Errors** (extend the frozen Phase 2 `TemplateError` additively): `template-not-found.error.ts`, `template-parse.error.ts`, `template-validation-failed.error.ts`, `errors/index.ts`.
- **Core types**: `types/template-source.ts`, `render-context.ts`, `compiled-template.ts`, `parse-issue.ts`, `template-validation-issue.ts`, `types/index.ts`.
- **Parsing/compiling**: `template-parser.ts` (item 9), `template-compiler.ts` (item 4).
- **Variable resolution** (item 5): `template-variable-resolver.ts`, `variable-resolvers/variable-resolver-plugin.interface.ts`, `dot-path-resolver.plugin.ts`, `date-variable-resolver.plugin.ts`, `variable-resolvers/index.ts`.
- **Rendering** (item 2): `template-renderer.ts`, `html-escape.ts`.
- **Validation** (item 3): `template-validator.ts`.
- **Caching** (item 7): `template-cache.ts`.
- **Version/locale metadata** (items 11, 8): `template-version.ts`, `template-locale.ts`.
- **Metrics** (item 12): `template-metrics.ts`.
- **Registry** (item 10): `template-registry.ts`, `register-template-input.ts`.
- **Facade** (item 1): `template-engine.ts`, `template-engine.interface.ts`, `render-params.ts`.
- **Test infrastructure**: `test-fakes/fake-notification-template.repository.ts` (shared by two test files — the reason it's its own file rather than inline, unlike Phase 3/4's single-file inline fakes).
- **Tests**: 11 `*.test.ts` files, ~94 individual cases.
- **Barrel**: `index.ts`.

Plus `TemplateEngineReport.md` (now under `docs/notification-engine/reports/` — see the documentation reorganization noted later in this file).

## Files Modified

| File | Created in | Why changed this phase |
|---|---|---|
| `notification-engine/container.ts` | Phase 2 | Added `templateEngine` construction (`TemplateRegistry` + `TemplateEngine`), reusing the already-existing `templateRepository` — no new repository instance. |
| `notification-engine/index.ts` | Phase 2 | Added `export * from "./template"`. |
| `notification.service.ts` (top-level) | Phase 2 | Added `TemplateEngine`/`templateEngine` re-exports — same pattern as Phase 3's `queueEngine` and Phase 4's `workerRuntime`. |
| `tsconfig.test.json` | Phase 3 | Added `template/**/*.ts` to `include`. |
| `package.json` | Phase 3 | Added `template/*.test.js` to the `test` script's glob. |

## Cross-Phase Changes

Same additive-only discipline as Phases 3 and 4 — every touch above is a new line (a construction, an export), never a modification to an existing line. Notably, **this phase needed zero new methods on any prior-phase repository or interface** — the first phase where the DI-wiring touch was the *only* cross-phase change required, since `INotificationTemplateRepository`'s existing `create`/`findById`/`findActiveByKeyAndChannel`/`findMany`/`update` (Phase 2) already covered every operation `TemplateRegistry` needed.

## Tests Executed

256 tests total across the whole engine (up from 252 after Phase 4), 0 failures, via the existing dependency-free `pnpm test` setup. Two real bugs were found and fixed while getting the suite green:

1. `template-engine.ts` imported `NoopLogger` from the `../queue` **barrel**, which also value-exports `QueueRepository` (imports `@/lib/prisma`) — transitively broke the plain-`node --test` runner exactly the way Phase 3/4's reports warned about. Fixed by importing directly from `../queue/logger.interface`.
2. One of my own test assertions (in `template-registry.test.ts`) expected the wrong outcome for locale fallback after `unregister` — fixed the assertion, not the code, since the code's actual behavior (graceful fallback to the still-active default) was correct.

## Coverage

Every public method of every new class has at least one direct test, covering both success and failure/edge paths for the state-changing operations (`register`/`unregister`/`render`/`preview`). The real, Prisma-backed `NotificationTemplateRepository` itself is not re-tested here (no new methods were added to it this phase).

## Performance Notes

Single-pass O(n) placeholder scanning (no backtracking regex), compile-once/cache-many rendering, one repository read per `render()` on a cache miss and zero on a hit, up to 3 sequential reads for a full locale-fallback chain (the common no-locale case is exactly 1). No N+1 patterns of the kind flagged in this file's Phase 3 audit section exist in this phase's code.

## Architecture Compliance

Full compliance with `NotificationEngineDesign.md` §7's own commitment to an in-house, dependency-free substitution engine (no Handlebars/Mustache/i18n library added). Three disclosed interpretations, none a redesign: (1) localization implemented as a `key`-encoding convention with a fallback chain rather than a schema change; (2) a genuinely new content validator (`TemplateValidator`) distinct from Phase 2's structural `NotificationTemplateValidator`; (3) versioning reuses the existing `BaseSalary`-style append/deactivate pattern, no history table.

## Known Limitations

- `TemplateCache` has no eviction policy — unbounded growth for the process lifetime (acceptable at this project's scale: a bounded, admin-managed template set, not user-generated content).
- "Unknown/missing/unused variable" validation checks are all opt-in (require the caller to supply `knownNamespaces`/`sampleContext`/`expectedVariables`) — there is no global hardcoded variable schema.
- No authorization check anywhere in this phase — correctly deferred to a future Server Action layer, matching this project's own convention.
- Locale fallback assumes IETF-BCP-47-shaped locale strings; a differently-shaped locale string degrades safely (skips the base-language fallback step) rather than erroring.

## Technical Debt

`TemplateEngine` depends on `TemplateRegistry`/`TemplateCompiler`/`TemplateRenderer`/`TemplateValidator`/`TemplateCache`/`TemplateMetricsCollector` as concrete classes, not interfaces — unlike Phases 2-4's repository pattern. Deliberate: the pure/I/O-free pieces have nothing to mock, and `TemplateRegistry` already delegates its own actual I/O to an interface one layer down. A minor, inherent double-parse also exists across a register→render lifecycle (validation and first-compile each independently scan the same content, at different times, for different purposes) — negligible cost given template string sizes, not fixed.

## Breaking Changes

**None.** Every prior-phase touch was a pure addition.

## Public API

`TemplateEngine`'s exact 8 methods: `render`, `preview`, `validate`, `compile`, `register`, `unregister`, `list`, `exists` — see TemplateEngineReport.md's "Public API" table for full signatures. `render()`'s output (`RenderedNotificationContent`) is Phase 2's already-frozen `{ subject?, bodyHtml?, bodyText? }`, reused verbatim — no new shape for a future channel adapter to learn.

## Engineering Review Summary

SOLID/DRY/KISS/naming/folder-organization/performance/extensibility all reviewed and found strong, with two items disclosed rather than hidden: (1) a deliberate DIP nuance (concrete-class dependencies for I/O-free pieces — see Technical Debt), and (2) **one real security vulnerability found and fixed, not merely reported**: the dot-path variable resolver used the `in` operator, which resolves inherited `Object.prototype` members — since `__proto__`/`constructor` are syntactically valid placeholder identifiers under this module's own grammar, a crafted template like `{{__proto__.constructor.name}}` would have "resolved" instead of correctly failing. Fixed by switching to `Object.prototype.hasOwnProperty.call(...)`, with 4 new regression tests. HTML-escaping of substituted values into `bodyHtml` (preventing a value like an employee's name from injecting markup) was implemented and tested from the start, not added reactively.

## Current Project Status

Phases 0 through 5 are all complete: design, database foundation, migration recovery, database audit, core infrastructure, queue engine, worker runtime, and now template engine. Four independently-tested engines exist (`queueEngine`, `workerRuntime`, `templateEngine`, plus the still-stub `notificationService`) — none wired to each other's delivery path yet, none wired to any business module or UI, nothing anywhere sends a real notification.

## Next Recommended Phase

Wire one real channel end-to-end rather than adding another isolated capability: implement a real `nodemailer`-backed `EMAIL` channel adapter (replacing `StubChannelAdapter`'s `ProviderNotImplementedError` for that one channel), and have `NotificationWorker`'s dispatch step call `templateEngine.render()` before invoking it. That connects queue → template → real delivery for one channel for the first time, while every other channel and `instrumentation.ts`/worker-startup integration remain correctly deferred until after that.

# Phase 6 — Delivery Framework

Implements the abstraction responsible for delivering already-rendered notifications: provider registration (multiple providers per channel, priority-ordered), resolution/selection/failover, passive health tracking, per-provider metrics, and a structural (non-enforcing) delivery policy. **No SMTP, no Nodemailer, no SMS/WhatsApp/Push/Firebase/Twilio client — every provider used anywhere in this phase, including its own tests, is an in-memory fake.**

## Files Created

42 new files under `src/lib/services/notification-engine/delivery/` (28 source, 14 test) across five subfolders: `types/` (health-state, result, descriptor, outcome, options), `value-objects/` (`ProviderPriority`, `ProviderCapabilities`), `provider/` (the `DeliveryProvider`/`ProviderLifecycle` interfaces + `ProviderContext`), `errors/` (`ProviderUnavailableError`, additive to Phase 2's frozen hierarchy), and the module root (`ProviderRegistry`, `ProviderHealthMonitor`, `ProviderMetricsCollector`, `ProviderResolver`, `ProviderSelector`, `DeliveryPolicy`, `DeliveryAttemptContext`, `DeliveryExceptionMapper`, `DeliveryStrategy`/`FailoverDeliveryStrategy`, `DeliveryManager`). Plus `test-fakes/` (`FakeDeliveryProvider`, `FakeNotificationProviderRepository`, a shared job fixture) — never exported from the module barrel.

## Files Modified (Cross-Phase Changes)

All purely additive: `container.ts` (constructs the registry/health-monitor/metrics/resolver/`DeliveryManager`, registry starts empty), `notification-engine/index.ts` and top-level `notification.service.ts` (export `DeliveryManager` + `deliveryManager` singleton, same pattern as every prior phase), `tsconfig.test.json` (adds the delivery glob), `package.json` (adds three explicit test globs — `node --test` doesn't recurse through a bare `**` the way a `globstar`-enabled shell would, so `delivery/`, `delivery/types/`, and `delivery/value-objects/` are each listed, matching this project's established never-point-at-a-bare-directory convention).

**Zero new repository methods needed** — the second phase in a row (after Phase 5) where Phase 2's existing repository interface (`INotificationProviderRepository`) already covered everything required.

## Public API

```ts
class DeliveryManager {
  deliver(job, content, options?: { requiredCapabilities?, policy?, correlationId? }): Promise<DeliveryOutcome>;
}
class ProviderRegistry {
  register(descriptor, provider): void;
  unregister(providerId): void;
  getByChannel(channel): RegisteredProvider[];
  getById(providerId): RegisteredProvider | undefined;
  list(): RegisteredProvider[];
  initializeAll(): Promise<void>;
  shutdownAll(): Promise<void>;
}
interface DeliveryProvider {
  deliver(job, content, context): Promise<ProviderResult>;
  initialize?(); shutdown?(); healthCheck?(); validateConfiguration?();
}
function providerDescriptorFromDTO(dto, capabilities?): ProviderDescriptor;
```

`DeliveryOutcome` is a 4-way discriminated union: `SUCCESS | PERMANENT_FAILURE | TEMPORARY_FAILURE | NO_PROVIDER_AVAILABLE`, each carrying the full `ProviderResult[]` attempt history.

## Architecture Compliance

All 15 requested units built, each with one distinct responsibility (full table in DeliveryFrameworkReport.md). Notable design resolutions: `ProviderResolver` ("who's eligible") and `ProviderSelector` ("which one's next") are deliberately separate classes so a future load-balancing `SelectionStrategy` plugs in without touching eligibility filtering; `ProviderHealthMonitor`'s 5-state model (HEALTHY/DEGRADED/OFFLINE/MAINTENANCE/UNKNOWN) is intentionally richer than the DB's 3-value `NotificationProviderHealthStatus` enum (frozen schema, no migration this phase), with an explicit lossy mapping function for future persistence.

## Tests Executed

Clean rebuild (`.test-build` + `tsconfig.test.tsbuildinfo` deleted, `tsc -p tsconfig.test.json && node --test ...`), stable across 2 consecutive runs:

```
tests 344   suites 77   pass 344   fail 0
```

88 of those tests (18 suites) are this phase's. All 256 pre-existing tests remain green, unmodified. Every test uses a mocked `DeliveryProvider` and a mocked `INotificationProviderRepository` — no database, no network, per this phase's explicit instruction.

## Coverage

Every one of the 15 units has a dedicated test file. Key scenarios: priority-ordered failover across providers, immediate stop on `PERMANENT_FAILURE` (no further candidates tried), `NO_PROVIDER_AVAILABLE` when nothing resolves, capability-based filtering, a throwing provider mapped without crashing the delivery, health DEGRADED→OFFLINE after the configured failure threshold with the now-OFFLINE provider correctly skipped on the next call, `PERMANENT_FAILURE` not penalizing provider health (business failure ≠ infra failure), sticky `MAINTENANCE` override, and retry-metric counting starting only from the 2nd attempt.

## Performance Notes

Every operation is O(1)/O(n) in *providers per channel* (expected single digits), never in delivery volume. `ProviderHealthMonitor`/`ProviderMetricsCollector` hold exactly one record per distinct provider ever registered — no unbounded growth tied to throughput.

## Known Limitations

`DeliveryPolicy` is structural only (no enforcement — no timeout race, no rate limiter, no size check). `ProviderResult` (SUCCESS/TEMPORARY_FAILURE/PERMANENT_FAILURE) and Phase 2's `ChannelDeliveryOutcome` (SUCCESS/FAILURE) remain two separate shapes pending a future integration decision. No automatic recovery from OFFLINE (no half-open/timed retry) — only a manual `setState` call clears it. Nothing persists runtime health back to the `NotificationProvider.healthStatus` DB column yet (the lossy mapping function exists, unused).

## Technical Debt

None introduced. No TODOs, no placeholder methods beyond what's explicitly disclosed as "architecture only" above.

## Breaking Changes

**None.** Every touched file received a pure addition; `JobDispatcher`, `NotificationWorker`, and `WorkerRuntime` are byte-for-byte behaviorally unchanged — their full pre-existing test suites pass without modification.

## Engineering Review Summary

SOLID (single responsibility per unit, dependency inversion throughout `DeliveryManager`'s constructor, open/closed via pluggable `SelectionStrategy`/`DeliveryStrategy`), DRY (one redundant default-strategy specification caught and removed during self-review — `FailoverDeliveryStrategy` now relies on `ProviderSelector`'s own default instead of re-specifying it), KISS (`DeliveryPolicy` does nothing beyond structural validation, no half-built enforcement), and security (no raw stack traces surfaced by `DeliveryExceptionMapper`, no credential handling in this module) were all reviewed. No O(n²) algorithms, no missing indexes (no schema touched), no race conditions or deadlocks (Node's single-threaded model, no `await` mid-mutation in any method). This is the **first phase requiring no fix to a pre-existing bug or test** — the only correction made was the DRY cleanup above, caught during self-review before it was ever a defect.

## Current Project Status

Phases 0–6 complete: design, database foundation, migration recovery, database audit, core infrastructure, queue engine, worker runtime, template engine, and now the delivery framework. Five independently-tested engines now exist (`queueEngine`, `workerRuntime`, `templateEngine`, `deliveryManager`, plus the still-stub `notificationService`) — none wired to each other's real dispatch path yet; nothing anywhere sends a real notification.

## Next Recommended Phase

A real SMTP `DeliveryProvider` for the `EMAIL` channel (reusing `email.service.ts`'s existing SMTP config/transporter/`EMAIL_SECRET_KEY` pattern), registered into `ProviderRegistry` — the first phase giving both this framework and `TemplateEngine` (Phase 5) a genuine consumer. Wiring `JobDispatcher`/`NotificationWorker` to call `DeliveryManager` instead of `ChannelAdapterFactory` directly would naturally follow once that first real provider exists.

# Phase 7 — SMTP Provider

Implements the first real `DeliveryProvider`: SMTP email, built entirely on this project's pre-existing SMTP infrastructure (`email.service.ts`, `EmailConfig`, `EMAIL_SECRET_KEY`). **No SMS/WhatsApp/Push/Firebase/Twilio, no `NotificationService` orchestration, no worker activation, no `instrumentation.ts` change.**

## Files Created

23 new files: `src/lib/smtp-shared.ts` (+ test) — a prisma-free extraction of `email.service.ts`'s transporter-options builder and SMTP error categorization, reused by both the old and new code instead of duplicated. `delivery/delivery-manager-channel-adapter.ts` (+ test) — a generic bridge from `DeliveryManager` to Phase 2's frozen `NotificationChannelAdapter` interface. `delivery/providers/smtp/` — `SmtpConfigValidator`, `SmtpTransportFactory`, `SmtpConnectionManager`, `buildSmtpCapabilities`, `isPermanentSmtpError`, `SmtpResultMapper`, `SmtpHealthChecker`, `SmtpDeliveryProvider`, `registerSmtpProvider` (no test — see Testing), a barrel, a `FakeTransporter` test fake, one `.test.ts` per unit, and an integration test proving the TemplateEngine → DeliveryManager → SMTP pipeline.

## Files Modified (Cross-Phase Changes)

`email.service.ts` refactored (behavior-preserving: removed its private config-resolver/error-mapper/transporter-options code, now imports the shared versions) — same messages, same transporter-reuse caching, same `SystemAudit` logging. `email-config.ts` gained an exported `resolveEmailConfig()` (moved verbatim from `EmailService`). `delivery/index.ts` gained `DeliveryManagerChannelAdapter` (the `providers/smtp` submodule is deliberately NOT re-exported from this barrel — see Testing). `tsconfig.test.json`/`package.json` extended with the new test paths. **`container.ts` and `notification.service.ts` are untouched** — the SMTP provider is fully built and tested but not wired into the live app (see Worker Integration).

## Public API

```ts
class SmtpDeliveryProvider implements DeliveryProvider {
  deliver(job, content, context): Promise<ProviderResult>;
  initialize(); shutdown(); healthCheck(); validateConfiguration();
}
function registerSmtpProvider(registry: ProviderRegistry, options?): void;
class SmtpConnectionManager {
  getTransporter(config); verify(config): Promise<boolean>; invalidate(); close();
}
class DeliveryManagerChannelAdapter implements NotificationChannelAdapter {
  constructor(channel, deliveryManager);
  send(job, content): Promise<ChannelDeliveryOutcome>;
}
```

## Architecture Compliance

All 10 requested units built (table in SmtpProviderReport.md). Item 9 ("SMTP Metrics Integration") needed zero new code — `DeliveryManager.invokeProvider()` (Phase 6) already wraps every provider's `deliver()` call with metrics/health tracking generically, proof that the Delivery Framework's design works exactly as intended. Error classification reuses one shared `classifySmtpErrorCategory()` for both the human-readable message (`mapSmtpError`, unchanged output) and the PERMANENT/TEMPORARY decision (`isPermanentSmtpError`) — ENVELOPE and 5xx SERVER_REJECTED are permanent (recipient/content problem); AUTH/DNS/CONNECTION/TIMEOUT/unknown are temporary (infra, potentially resolved by failover to a sibling provider), matching `DeliveryExceptionMapper`'s (Phase 6, frozen) own conservative default, which `SmtpResultMapper` genuinely delegates to rather than bypassing.

## Tests Executed

Clean rebuild, stable across 2 consecutive runs:

```
tests 401   suites 94   pass 401   fail 0
```

49 tests across 14 suites belong to this phase (45 in `providers/smtp/`, 4 in `delivery-manager-channel-adapter.test.ts`'s two describe blocks, plus `smtp-shared.test.ts`'s share of the total). All 373 pre-existing tests remain green, unmodified. Zero real network calls — every test uses a `FakeTransporter`; two integration tests prove (a) Phase 4's real `JobDispatcher` correctly drives `DeliveryManager` via `DeliveryManagerChannelAdapter`, and (b) Phase 5's real `TemplateEngine.render()` output flows unmodified into a mocked SMTP send.

One caught mistake worth recording: several new files were first written importing the shared config via the `@/lib/smtp-shared` Next.js path alias — which plain `node --test` cannot resolve (only Next.js's bundler understands `@/`), the same class of pitfall documented in every prior phase's report but this time self-inflicted rather than inherited. All 7 affected files failed to load their test suites at all (not an assertion failure — a `require()` crash). Fixed by switching to relative imports; re-verified clean on the next run.

## Coverage

Every named unit has a dedicated test file: connection reuse/invalidation/graceful-shutdown, health-probe HEALTHY/OFFLINE/MAINTENANCE, config validation, every SMTP error category's permanent/temporary classification, unconfigured-provider handling (never a crash — a retryable `TEMPORARY_FAILURE`), a full successful send with exact mail-options assertions, and both integration proofs.

## Performance Notes

One transporter per `SmtpConnectionManager`, reused until config changes — no per-message connection setup. Everything in this phase's own code is O(1) per call.

## Known Limitations

Attachments stay capability-`false` (Phase 2's frozen `RenderedNotificationContent` has no field for them yet — claiming the capability would be false advertising to `ProviderResolver`). No connection pooling (sequential reuse, matching `email.service.ts`'s existing behavior). `register-smtp-provider.ts` and the `email.service.ts` refactor have no automated test of their own — the former by the same necessity as Phase 4's untested `create-worker-runtime.ts` (importing the real Prisma-backed resolver at module scope), the latter because that file has never had a test suite (pre-existing condition, not introduced here); both were verified by careful manual review instead.

## Technical Debt

None introduced.

## Breaking Changes

**None.** `email.service.ts`'s public exports and observable `sendMail()` behavior are unchanged; every Phase 2–6 public API is untouched.

## Engineering Review Summary

SOLID (dependency inversion throughout — `SmtpDeliveryProvider` takes an injected config-resolver function, never touches Prisma directly), DRY (one shared error-categorization function feeding both the message mapper and the retry classifier; one shared transport-options builder feeding both `EmailService` and the new factory), connection lifecycle (reuse + invalidate-on-error + graceful shutdown, old transporter always closed before replacement, verified by test), security (no credentials logged, `EMAIL_SECRET_KEY` untouched), and error mapping (`DeliveryExceptionMapper` genuinely used, not bypassed) were all reviewed clean. No breaking changes, no O(n²) algorithms, no resource leaks.

## Current Project Status

Phases 0–7 complete. Six independently-tested engines now exist (`queueEngine`, `workerRuntime`, `templateEngine`, `deliveryManager` — now with a real, tested SMTP provider available to register — plus the still-stub `notificationService`). Nothing in the live application calls any of them yet; every wiring point is a deliberate, documented one-line future step.

## Next Recommended Phase

Activate what Phases 2–7 built: register the SMTP provider into the live `container.ts`, swap the worker's EMAIL channel adapter to `DeliveryManagerChannelAdapter`, and have the dispatch pipeline call `templateEngine.render()` first — the first phase where this engine sends a real email end to end.

# Phase 8 — Engine Integration

Wires Phases 2–7 into one working pipeline — **Queue → Worker → TemplateEngine → DeliveryManager → SMTP Provider** — for the `EMAIL` channel only. Every other channel is untouched (still `StubChannelAdapter`). Nothing is activated automatically: the worker still requires an explicit `.start()` call nothing in this repository makes.

## Files Created

`src/lib/services/notification-engine/integration/queue-to-smtp.integration.test.ts` (the required end-to-end proof) and `docs/notification-engine/reports/EngineIntegrationReport.md`.

## Files Modified

`worker/job-dispatcher.ts` (optional `eventRepository`/`templateEngine` params + a `renderContent()` step before `adapter.send()` — both default to nothing, preserving pre-Phase-8 behavior exactly), `worker/notification-worker.ts` (a genuine bug fix — see below), `worker/create-worker-runtime.ts` (new optional `DispatchIntegration` param; swaps EMAIL's `StubChannelAdapter` for `DeliveryManagerChannelAdapter` via `ChannelAdapterFactory.register()`'s existing extension point, every other channel untouched), `worker/index.ts` (export), `container.ts` (reordered construction, calls `registerSmtpProvider(providerRegistry)` once, passes the new integration deps into `createWorkerRuntime`), `worker/job-dispatcher.test.ts` (+7 tests), `worker/notification-worker.test.ts` (+1 regression test), `tsconfig.test.json`/`package.json` (new `integration/` test path).

## Cross-Phase Changes

**A latent gap this phase closes, not a new architecture decision**: `NotificationWorker.execute()` only ever checked `dispatchOutcome.kind === "SUCCESS"`, never `outcome.result.outcome` — harmless while every adapter (`StubChannelAdapter`) only ever *threw* on failure, but `DeliveryManagerChannelAdapter` (Phase 7) is the first adapter that resolves normally while still reporting a delivery failure (exactly what an unconfigured/failing SMTP provider does). Wiring it in without fixing this would have silently broken retry behavior — a real SMTP failure would have been marked complete instead of retried, directly violating this phase's own "preserve retry behavior" requirement. Fixed with one added condition; verified against all 82 pre-existing worker tests (unmodified, still green) plus a dedicated regression test.

## Integration Points

1. `registerSmtpProvider(providerRegistry)` — called exactly once, using Phase 7's existing registration mechanism (future channels register the same way).
2. `createWorkerRuntime` registers `StubChannelAdapter` for all 8 channels, then conditionally overwrites just `EMAIL` with `DeliveryManagerChannelAdapter` — via the `ChannelAdapterFactory.register()` extension point that has existed, documented, since Phase 2.
3. `JobDispatcher.renderContent()` resolves the job's `NotificationEvent` (`INotificationRepository.findById` — Phase 2, zero new repository methods), uses `event.eventType` as the template key and `event.payload` as the render context, and renders *before* the adapter is ever called. `DeliveryManager`/`SmtpDeliveryProvider`/`DeliveryManagerChannelAdapter` never render — verified by a test asserting exactly one render call per dispatch.

## Tests Executed

Clean rebuild, stable across 2 consecutive runs:

```
tests 411   suites 96   pass 411   fail 0
```

10 new tests (7 JobDispatcher render tests, 1 NotificationWorker regression test, 3 end-to-end integration tests). All 401 pre-existing tests remain green, unmodified.

## Coverage

The integration suite builds one complete, real pipeline (real `QueueEngine`, `NotificationWorker`, `JobDispatcher`, `TemplateEngine`, `DeliveryManager`, `SmtpDeliveryProvider`, wired exactly as `createWorkerRuntime`/`container.ts` do) against mocked repositories and a mocked SMTP transporter, proving: (1) a full success with `{{employee.name}}` rendered correctly and the job ending `SENT`; (2) a graceful SMTP failure correctly triggers `RETRY_SCHEDULED` with `attemptCount: 1` (the bug-fix, proven under real conditions); (3) a non-EMAIL (`SMS`) job is still untouched — stub adapter, `ProviderNotImplementedError`, retry.

## Performance

One additional repository lookup and one template render per dispatched job, both O(1) relative to queue depth — no new loops, no N+1 patterns.

## Known Limitations

Rendering (and the event lookup) is not raced against `ExecutionContext`'s cancellation signal — only the adapter's own network call is, unchanged from Phase 4; a hang there relies on `WorkerRuntime`'s graceful-shutdown grace period, not cancellation. The `eventType`-as-template-key mapping is a disclosed interpretation (the frozen design never specified this exact mapping) — see EngineIntegrationReport.md for the full reasoning. A missing template and a missing SMTP config currently look identical to the queue (both retry then dead-letter) — no separate observability signal distinguishes them yet.

## Technical Debt

None introduced — the one bug fixed removes debt rather than adding it.

## Breaking Changes

**None.** Every new parameter is optional with a behavior-preserving default; all 401 pre-existing tests pass unmodified. The `NotificationWorker` fix only changes behavior on a code path that was unreachable before this phase.

## Current Project Status

Phases 0–8 complete. The full pipeline (Queue → Worker → TemplateEngine → DeliveryManager → SMTP) is wired and provably correct end to end via integration tests, but still fully dormant in the live application — nothing calls `workerRuntime.start()`, and no business module calls `notificationService.raiseEvent()` (still a stub) to actually create a job.

## Next Recommended Phase

Decide how a real business event (e.g. a loan approval) calls into the engine to enqueue a job, and whether/how `instrumentation.ts` starts the worker in production — both deliberately out of scope here (explicit STOP conditions) and still open for a future, explicitly-scoped phase.

# Phase 9 — Notification API & Orchestration

Completes `NotificationService.raiseEvent()` — the single public entry point business modules will eventually call — as a pure orchestrator over Phases 2–8's already-built components. No business module, worker activation, or `instrumentation.ts` change.

## Files Created

`dto/raise-event.dto.ts` (`RaiseEventRecipient`/`RaiseEventRequest`/`RaiseEventResult`), `validators/raise-event-request.validator.ts` (`RaiseEventRequestValidator`), `notification.service.test.ts` (20 tests), `docs/notification-engine/reports/NotificationServiceReport.md`.

## Files Modified

`notification.service.ts` (`raiseEvent()` fully implemented; new required constructor parameter `queueEngine: IQueueEngine`), `container.ts` (`queueEngine` now constructed before, and passed into, `NotificationService`), `utils/clock.ts`/`utils/index.ts` (added `FixedClock`, additive — the mechanism `scheduledAt` uses), `dto/index.ts`/`validators/index.ts` (new exports), `tsconfig.test.json`/`package.json` (added the root-level `notification.service.ts`/`.test.ts` files to the compiled/run test set).

## Cross-Phase Changes

None to any previously-completed phase's frozen public API. `NotificationService`'s constructor gained one new required parameter; its only real caller (`container.ts`) was updated. `raiseEvent`/`processJob`/`resendJob` were always throw-stubs before this phase, so there is no prior working behavior to preserve or break for those two still-stubbed methods.

## Public API

```ts
await notificationService.raiseEvent({
  eventType: "LOAN_APPROVED",
  payload: { employeeId, employeeName, amount, approvedBy },
  recipients: [{ channel: "EMAIL", recipientAddress: employee.email, recipientUserId: employee.id }],
});
```

`recipients`, `dedupeKey`, `sourceDomain`, `triggeredByUserId`, `scheduledAt`, `maxAttempts` are the only other fields — none require the caller to know about `QueueEngine`, `WorkerRuntime`, `TemplateEngine`, `DeliveryManager`, SMTP, providers, retry logic, or the queue implementation. Two disclosed design decisions (full reasoning in `NotificationServiceReport.md`): `recipients` is required (recipient resolution is business logic Phase 2's own `NotificationJobFactory` already deferred to the caller, and this phase is barred from putting business logic in `NotificationService`); `dedupeKey`/`sourceDomain` are optional with a deterministic default derivation from `eventType`+`payload`, since both fields already exist on the frozen `NotificationEvent` schema.

## Integration Points

1. **Validation** — `RaiseEventRequestValidator` (new, structural) + `NotificationEventValidator` (Phase 2, unmodified) on the derived event shape.
2. **Event-level dedup** — `notificationRepository.findByDedupeKey`; a concurrent-insert race is detected via the resulting `RepositoryError`'s wrapped Prisma `P2002`/`dedupeKey` conflict and treated identically to a synchronous dedupe hit.
3. **Fan-out** — one `queueEngine.enqueue(...)` call per recipient (Phase 3, unmodified) — job-level idempotency (duplicate `(channel, recipientUserId)` pairs) is `QueueEngine.enqueue`'s own pre-existing behavior.
4. **Scheduling** — `scheduledAt` reuses the existing `IClock` seam via a new `FixedClock`, passed through to `queueEngine.enqueue`'s `clock` parameter — no new field on `BuildNotificationJobParams`/`NotificationJob`.

## Tests Executed

Clean rebuild, stable across 2 consecutive runs:

```
tests 431   suites 103   pass 431   fail 0
```

20 new tests covering every numbered IMPLEMENT item (orchestration flow, validation, deduplication, idempotency, scheduling, repository/dependency failure propagation, read-only passthroughs). All 411 pre-existing tests remain green, unmodified.

## Coverage

Every IMPLEMENT item (`raiseEvent`, event validation, recipient resolution, event creation, job creation, deduplication, idempotency, queue insertion, scheduling support, event persistence, public service methods, dependency injection) has at least one dedicated test — see `NotificationServiceReport.md`'s "Coverage" section for the full mapping.

## Performance

Exactly one validation pass, one `findByDedupeKey` read, at most one event insert, and one `queueEngine.enqueue` call per recipient — all O(1) relative to queue depth, no N+1 beyond the intentional one-job-per-recipient fan-out the design itself requires.

## Known Limitations

`NotificationPreference` opt-outs are not enforced (no repository exists yet for that model, and building one was not in this phase's scope). No cross-repository transaction wraps the event insert and its jobs' inserts — matches every prior phase's same at-least-once, no-`$transaction` posture (Design §18's own acknowledged gap), not a new one. Recipients must be supplied by the caller; there is no `eventType → recipient` mapping table yet.

## Technical Debt

None introduced — both disclosed design decisions are documented trade-offs, not shortcuts.

## Breaking Changes

**None** to any previously-completed phase. `NotificationService`'s constructor signature change is confined to its one real caller, `container.ts`.

## Current Project Status

Phases 0–9 complete. `raiseEvent()` is a real, tested orchestration entry point — event validation, dedup, idempotency, fan-out, and scheduling all work end to end against fakes. Nothing in the live application calls it yet, and the worker it feeds is still never started.

## Next Recommended Phase

Pick one real business event (e.g. loan approval), have that domain's `actions.ts` call `notificationService.raiseEvent(...)` with its own recipients, and decide how/where `workerRuntime.start()` is invoked in production — both explicit STOP conditions here and still open for a future, explicitly-scoped phase.

# Phase 10 — First Business Module Integration

Connects exactly one real business workflow — loan approval (`LOAN_APPROVED`) — to the engine: `approveLoan()` (`loan.actions.ts`) now calls `notificationService.raiseEvent(...)` after its own transaction commits, so the employee gets an email through the full Queue → Worker → TemplateEngine → DeliveryManager → SMTP pipeline. No other business event, no engine file changed.

## Files Created

`src/lib/services/notification-engine/integration/loan-approved.integration.test.ts` (3 tests, starting from `NotificationService.raiseEvent()` rather than `queueEngine.enqueue()` directly) and `docs/notification-engine/reports/BusinessIntegrationReport.md`.

## Files Modified

`src/actions/loan.actions.ts` (`approveLoan()` calls `raiseEvent` for `LOAN_APPROVED` after its `$transaction` commits, wrapped in its own `try/catch` so a notification failure never blocks or reverses an already-approved loan; one previously-duplicated employee lookup is now shared), `prisma/seed.js` (idempotently registers the `LOAN_APPROVED`/`EMAIL` `NotificationTemplate`).

## Integration Points

1. **Call site**: after the loan's own transaction commits, not inside it — `NotificationService`'s repositories use the global `prisma` singleton, not `tx`, so it cannot participate in that transaction.
2. **Failure isolation**: `raiseEvent` wrapped in `try/catch` + `console.error`, matching this codebase's standard Server Action error convention — `approveLoan`'s return value/behavior is otherwise unchanged.
3. **Payload/recipients**: `dedupeKey: LOAN_APPROVED:${loanId}` (one notification per loan, ever), `payload: { employee: { id, name }, amount, approvedBy }` (same `employee.name` dot-path convention Phase 8 already established), one `EMAIL` recipient — skipped entirely if the employee has no email.
4. **Template**: registered via a raw, idempotent `prisma.notificationTemplate.create()` in `prisma/seed.js` (this project's existing bootstrap-data mechanism) — not `TemplateEngine.register()` directly, since `seed.js` is a standalone script outside `tsconfig.test.json`'s path-alias resolution.

## Tests Executed

Clean rebuild, stable across 2 consecutive runs:

```
tests 434   suites 104   pass 434   fail 0
```

3 new tests covering success + template rendering + worker processing, queue creation, and SMTP failure + retry. All 431 pre-existing tests remain green, unmodified.

## Coverage

Every item in this phase's Testing section (success, template rendering, queue creation, worker processing, SMTP failure, retry) is covered by at least one assertion — see `BusinessIntegrationReport.md`'s "Coverage" section for the exact mapping.

## Performance

No engine component's performance characteristics changed. `approveLoan` gains one shared (not duplicated) employee lookup and one O(1) `raiseEvent` call, sequenced after — never inside — the transaction, so it never extends the transaction's lock duration.

## Technical Debt

The `seed.js` template-bootstrap step is an acknowledged stop-gap pending real template management (out of scope — part of the still-unbuilt Notification Center).

## Breaking Changes

**None.** `approveLoan`'s signature and return value are unchanged; its one existing caller never inspected the return value. No Notification Engine file was modified.

## Current Project Status

Phases 0–10 complete. `LOAN_APPROVED` emails are enqueued for real on every loan approval and provably deliverable end to end via integration tests, but nothing in the live application processes that queue yet — `workerRuntime.start()` is still never called anywhere.

## Next Recommended Phase

Decide how/where to actually run the worker in production (a scheduled job, an `instrumentation.ts` hook, or an explicit ops action) — the last piece between "provably correct" and "actually sends email in production."

# Phase 11 — Production Worker Activation & Operations

Moves the engine from "provably correct in tests" to "actually running in production." Adds one new operational layer around the six frozen components — none redesigned.

## Files Created

`queue/console-logger.ts` (`ConsoleQueueLogger`, the first real `IQueueLogger`), `notification-settings.ts` (`getOrCreateNotificationSettings()`, same upsert pattern as `system-control.ts`), `worker/worker-lifecycle-manager.ts` (`WorkerLifecycleManager` — duplicate-start prevention, crash/lease recovery, combined health snapshot; prisma-free, unit-tested), `worker/worker-lifecycle-manager.test.ts` (9 tests), `production-worker.ts` (the one prisma-touching wiring file `instrumentation.ts` calls), `src/app/api/notification-engine/worker-health/route.ts` (SUPERADMIN-only health endpoint), `integration/worker-activation.integration.test.ts` (2 tests: full automatic loop with no manual `processNext()`, and crash recovery), `docs/notification-engine/reports/ProductionWorkerReport.md`.

## Files Modified

`src/instrumentation.ts` (one new guarded starter, `startNotificationWorker()`, following the three existing crons' exact `global`-flag pattern), `queue/index.ts`/`worker/index.ts` (new exports).

## Startup Strategy

`instrumentation.ts` — this project's one established mechanism for starting a long-running in-process loop at boot, already used by three cron-style background jobs. A dedicated process or scheduled-job trigger would either need new deployment infrastructure this single-app project has never had, or would require `WorkerRuntime` to become stateless across invocations (a redesign, forbidden this phase) — see `ProductionWorkerReport.md`'s "Startup Strategy" for the full reasoning.

## Production Lifecycle

`instrumentation.ts` → `startNotificationWorker()` (global-flag guarded) → `production-worker.ts` reads `NotificationSettings`, builds a settings-configured `QueueEngine`/`WorkerRuntime` (sharing the container's real `queueRepository`, not the container's own dormant, default-configured runtime), wraps it in a `WorkerLifecycleManager`, and starts it — which sweeps expired leases once immediately (crash recovery), starts `WorkerRuntime`'s own graceful polling loop, then sweeps again every 60 seconds for the life of the process (ongoing lease recovery). `stop()` reverses cleanly; OS-signal wiring (`SIGTERM`/`SIGINT`) is deliberately not added — no precedent for it elsewhere in this codebase, and it changes process-wide behavior beyond this phase's scope; `stopProductionNotificationWorker()` is exported and ready for a future phase to wire up.

## Health Monitoring

`WorkerLifecycleManager.snapshot()` combines `isStarted` + `WorkerRuntime.status()`/`.health()`/`.heartbeat()`/`.metrics()`, exposed at `GET /api/notification-engine/worker-health` (SUPERADMIN-only) — ops tooling, not the still-out-of-scope "Notification Center."

## Tests Executed

Clean rebuild, stable across 2 consecutive runs:

```
tests 445   suites 111   pass 445   fail 0
```

11 new tests. All 434 pre-existing tests remain green, unmodified.

## Coverage

Every Testing-section item (startup, shutdown, restart, duplicate startup, crash recovery, lease recovery, worker health) has at least one dedicated test, plus one integration test proving the full diagrammed chain (Application Start → Worker Starts → Queued Loan Notification → Worker Claims Job → Template Render → SMTP → Email → Worker Continues Running) end to end with zero manual `processNext()` calls — see `ProductionWorkerReport.md`'s "Coverage" table for the exact mapping.

## Performance

One `recoverExpiredLocks()` call at startup, one every 60 seconds thereafter — both already-cheap, already-analyzed `QueueEngine` operations. No new per-job overhead; the claim/dispatch loop itself is `WorkerRuntime`'s unmodified Phase 4 code.

## Technical Debt

None introduced. Two `NotificationSettings` fields (`workerBatchSize`, both retention-day fields) have no consumer yet — pre-existing Phase 1 schema surface, not new debt.

## Breaking Changes

**None.** Every prior phase's public API is untouched; `container.ts`'s existing dormant `workerRuntime` is simply not the instance production now uses.

## Current Project Status

Phases 0–11 complete. The engine is fully live end to end: a loan approval enqueues an email, and a worker started automatically at application boot delivers it, recovers from crashes/restarts, and reports its health — zero manual intervention required.

## Next Recommended Phase

A Notification Center (admin/employee dashboard over `NotificationJob`/`NotificationDeliveryAttempt`), additional business events beyond `LOAN_APPROVED`, and additional channels (SMS/WhatsApp/Push) behind their own `DeliveryProvider` — the extension points this engine has been built around since Phase 2.

# Phase 12 — Notification Center

Builds a read-oriented presentation/management layer: an Employee Notification Center (view/read/archive/delete own notifications) and an Administrator Notification Center (everything employees have, plus queue/delivery/provider visibility and two manual queue actions). No frozen Notification Engine component was redesigned.

## Files Created

**Migration**: `prisma/migrations/20260728120000_add_notification_job_inbox_state/migration.sql` (hand-authored, generated but **not applied** — see below).

**Backend**: `inbox/dto/*` (3 files), `inbox/event-title.util.ts`, `inbox/repositories/interfaces/*` (2 interfaces), `inbox/repositories/*` (2 Prisma-backed classes), `inbox/notification-inbox.service.ts` (the core query+command logic), `inbox/notification-inbox.service.test.ts` (31 tests), `inbox/index.ts`.

**Actions**: `src/actions/notification-inbox.actions.ts` (employee), `src/actions/notification-admin.actions.ts` (admin).

**UI**: `NotificationStatusBadge`/`NotificationTable`/`NotificationFiltersBar`/`NotificationPagination`/`NotificationDetailDrawer` (shared, `src/components/shared/notification-center/`), `(employee)/notification-center/page.tsx`, `(admin)/admin/notification-center/page.tsx`.

`docs/notification-engine/reports/NotificationCenterReport.md`.

## Files Modified

`prisma/schema.prisma` (new `NotificationJobInboxState` model + two virtual, zero-migration-impact back-relation fields), `container.ts` (new `inboxService`), engine barrel `index.ts` (`export * from "./inbox"`), `AppSidebar.tsx` (one nav entry each for admin/employee), `tsconfig.test.json`/`package.json` (new `inbox/**` test path).

## A Schema Decision, Resolved With the User First

Read/unread/archived/deleted state and channel/delivery-status filtering can't be expressed by `NotificationJob`/`NotificationEvent` (frozen) or by the pre-existing, unrelated `EmployeeNotification`/`AdminNotification` tables. Confirmed with the user before writing code: one new, purely additive table (`NotificationJobInboxState`, one row per `(notificationJobId, userId)`) — no column added to any existing table. `prisma migrate dev --create-only` hit pre-existing, undocumented-until-now drift between this project's live database and its migration history (present since before this phase, shared by three earlier migrations) and refused to proceed without offering a schema reset; per the user's explicit instruction, the migration SQL was hand-authored instead (matching this repo's existing migration style) and left **unapplied** — the user will apply it when ready. See `NotificationCenterReport.md`'s own section for full detail and the exact commands to apply it.

## UI Pages

`/notification-center` (employee) and `/admin/notification-center` (admin) — both reachable from the sidebar. Admin adds a Queue Status summary card and a detail-drawer section (delivery attempts, worker/lock info, raw payload, retry/requeue buttons) employees never see.

## Components

Five shared components (`NotificationStatusBadge`, `NotificationTable`, `NotificationFiltersBar`, `NotificationPagination`, `NotificationDetailDrawer`) reused verbatim by both role pages via props (`showRecipient`, `isAdmin`) — no logic duplicated between roles.

## Queries

New `INotificationCenterJobsRepository` (paginated, joined `NotificationJob`+`NotificationEvent`+`recipient` search with a total count; delivery-attempts-with-provider join; search-match id resolution) and `INotificationInboxStateRepository` (read/archived/deleted flag tracking) — both new, additive interfaces reusing `NotificationJob`'s existing relations. The two manual queue actions (retry-now, dead-letter requeue) use Phase 2's existing generic `INotificationJobRepository.update()` directly — `QueueEngine`/`NotificationService` were not modified to add this capability, per this phase's own STOP conditions.

## API Endpoints

None added. Every read/write in this phase is a Server Action, matching this project's dominant convention for this class of feature (list/detail/mutate from a UI) — Phase 11's `/api/notification-engine/worker-health` already covers the one legitimate "hit it directly" ops use case.

## Tests Executed

Clean rebuild, stable across 2 consecutive runs:

```
tests 476   suites 121   pass 476   fail 0
```

31 new tests. All 445 pre-existing tests remain green, unmodified. (No React/UI test runner exists in this project at any prior phase; UI pages were verified via `tsc --noEmit` and manual review, not automated component tests.)

## Coverage

Every Testing-section item (employee access, admin access, search, filtering, pagination, read/unread, archive, manual retry, dead-letter requeue, authorization, performance-sensitive query behavior) has a dedicated test suite — see `NotificationCenterReport.md`'s "Coverage" table for the exact mapping.

## Performance

List queries: 1 `search()` call plus up to ~3 small id-set queries when read/unread/archived/search filters are active — never per-row. Detail views: 2–3 queries total, independent of history length. Rendered template content is only ever loaded for a specific opened notification, never in a list. All verified by a dedicated "performance-sensitive query behavior" test suite asserting constant call counts.

## Technical Debt

The generated migration is not yet applied (by explicit user instruction) — the feature will not work against the live database until it is. Body search is unindexed (acceptable at this app's scale). Admin read/unread/archived filtering only works when scoped to one employee, not across all at once — a disclosed scope decision. `pnpm run build` shows 5 cosmetic Turbopack warnings (Node-only code reachable from `instrumentation.ts`'s Edge-runtime bundle, since `proxy.ts`'s middleware has no declared runtime and defaults to Edge) — build succeeds, runtime behavior is correct, and the user explicitly declined the one fix that would remove them (declaring `proxy.ts` `runtime: "nodejs"`) as out of scope for this phase. See `NotificationCenterReport.md`'s "Build Verification" section.

## Breaking Changes

**None.** Every prior phase's public API is untouched; the pre-existing `/admin/notifications` page (a different, older feature) is untouched.

## Current Project Status

Phases 0–12 complete (Phase 12's migration generated but not yet applied — see above). Employees and administrators now have a full read/management UI over the Notification Engine's delivery data, built entirely as a presentation layer with zero changes to any frozen engine component.

## Next Recommended Phase

Apply the generated migration, then verify end to end against the real database. Beyond that: Notification Preferences (per-user channel opt-out), additional business events, and additional channels — the same extension points this engine has been built around since Phase 2.

**Correction (recorded at the start of Phase 13):** the `20260728120000_add_notification_job_inbox_state` migration flagged above as "not yet applied" has since been applied — `prisma migrate status` reports the database schema up to date and `NotificationJobInboxState` is live and reachable. This was verified during a Linux-environment-recovery session that also fixed an unrelated, purely local issue (a stale generated Prisma Client from before the machine move, which had no `EmailConfig`/Notification Engine models — fixed with `pnpm prisma generate`; no schema or database change). No further action needed here.

# Phase 13 — Notification Preferences

**PHASE 13 COMPLETE**

Makes `NotificationService.raiseEvent()` honor per-user `NotificationPreference` opt-outs internally, so business modules (`loan.actions.ts` and every future one) get preference enforcement for free just by calling `raiseEvent()` — no business module contains or needs to contain preference logic. `LOAN_APPROVED`/`EMAIL` is the first notification exposed to employees for self-service management. Full detail in [NotificationPreferencesReport.md](../reports/NotificationPreferencesReport.md).

## Implementation Completed

- Preference resolution rule implemented inside `NotificationService.raiseEvent()`'s existing per-recipient fan-out loop: no explicit `NotificationPreference` row → enabled (default); explicit `isEnabled: false` → opted out (no job created, but the `NotificationEvent` is still recorded); a recipient with no `recipientUserId` is never opted out.
- Full repository/DTO/validator layer for `NotificationPreference`, matching the existing Phase 2 pattern exactly.
- `NotificationPreferenceService` (list/set a user's own preferences) + a small `MANAGEABLE_NOTIFICATION_TYPES` catalog (today: `LOAN_APPROVED`/`EMAIL` only) gating which pairs are self-service-manageable.
- Employee-only Server Actions (`notification-preferences.actions.ts`) and a new `NotificationPreferencesDialog`, added to the existing employee Notification Center page via a "Preferences" button — no new route, no redesign.
- **No admin/manager access** — per explicit product decision on this phase's own stop condition, preferences are employee self-service only in this phase.

## Files Changed

**Created:** `dto/notification-preference.dto.ts`, `repositories/interfaces/notification-preference-repository.interface.ts`, `repositories/notification-preference.repository.ts`, `validators/notification-preference.validator.ts`, `preferences/preference-catalog.ts`, `preferences/notification-preference.service.ts`, `preferences/notification-preference.service.test.ts`, `preferences/index.ts`, `src/actions/notification-preferences.actions.ts`, `src/components/shared/notification-center/NotificationPreferencesDialog.tsx`, `docs/notification-engine/reports/NotificationPreferencesReport.md`.

**Modified:** `notification.service.ts` (new required constructor param `preferenceRepository`, preference check in `raiseEvent`), `notification.service.test.ts` (+8 tests), `container.ts` (wiring), `dto/index.ts`, `repositories/index.ts`, `repositories/interfaces/index.ts`, `validators/index.ts`, top-level `index.ts` (barrel), `integration/loan-approved.integration.test.ts` + `integration/worker-activation.integration.test.ts` (updated `NotificationService` construction with a default-enabled fake), `(employee)/notification-center/page.tsx` (Preferences button), `tsconfig.test.json` + `package.json` (new test glob).

**Not touched:** `loan.actions.ts`, `prisma/schema.prisma`, `QueueEngine`, `WorkerRuntime`, `DeliveryManager`, the SMTP provider, `TemplateEngine`, `instrumentation.ts`, any admin/manager file.

## Database Changes

**None.** The existing `NotificationPreference` model (Phase 1) already had the exact shape this phase needed — no migration proposed, generated, or applied.

## Tests

```
tests 491   suites 124   pass 491   fail 0
```

476 pre-existing tests unmodified and still green + 15 new (8 in `notification.service.test.ts`'s preference block, 7 in `preferences/notification-preference.service.test.ts`), all deterministic, zero live-database access.

## Build Result

`pnpm run build` — compiles successfully. Same 5 pre-existing, previously-documented cosmetic Turbopack Edge-runtime warnings as Phase 12 (Node-only code reachable from `instrumentation.ts`'s Edge-runtime bundle); no new warnings introduced.

## Known Issues

None new. See NotificationPreferencesReport.md's "Known Limitations" for the pre-existing, deliberate scope boundaries (single-entry catalog, no admin/manager access, no bulk opt-out).

## Next Phase Recommendation

A deliberately-scoped follow-up for SUPERADMIN/HR visibility/override of employee preferences, if wanted (explicitly deferred this phase). Beyond that: additional business events (each needs only a `raiseEvent` call + a `MANAGEABLE_NOTIFICATION_TYPES` entry) and additional channels behind their own `DeliveryProvider`.

# Phase 14 — Admin / HR Notification Preference Management

**PHASE 14 COMPLETE**

Full detail in [AdminPreferenceManagementReport.md](../reports/AdminPreferenceManagementReport.md).

## Goal

Give SUPERADMIN and HR the ability to view and override any employee's notification preferences, plus reset an override back to the system default — the exact follow-up Phase 13 deferred. No engine redesign, no manager access, no new preference table.

## Implemented

- `NotificationPreferenceService.resetForUser()` — removes the explicit override row (never writes a fake "default" row), backed by a new `INotificationPreferenceRepository.deleteOne()` (Prisma `deleteMany`, safe no-op if nothing to delete). `listForUser`/`setForUser` needed **zero** changes — they already took an arbitrary `userId`, never assumed "self."
- `notification-preferences-admin.actions.ts` — `getEmployeeNotificationPreferences`, `setEmployeeNotificationPreference`, `resetEmployeeNotificationPreference`. Each independently re-checks `SUPERADMIN`/`HR` (same `isAdministrator`-style local helper `notification-admin.actions.ts` already uses), verifies the target employee exists via Prisma before touching data, and delegates all catalog validation to `NotificationPreferenceService` (rejects any non-manageable `notificationType`/`channel`).
- `EmployeeNotificationPreferencesPanel` — new "Employee Preferences" tab on the existing `/admin/notification-center` page (via the existing `Tabs` primitive). Employee search/select follows `EmployeeNotesBoard.tsx`'s established pattern; each preference row shows a DEFAULT / EXPLICITLY ENABLED / EXPLICITLY DISABLED badge (never conflating "no row" with "disabled") plus Enable/Disable/Reset actions.
- Every override/reset is change-logged to the existing `AuditLog` table (actor, employee, notificationType, channel, old value, new value), the same direct-write pattern `profile.actions.ts`/`loan.actions.ts`/`medical.actions.ts` already use for non-loan SUPERADMIN/HR actions — no new audit table. Deliberately does **not** fan out `createAdminNotification` (that helper is reserved for manager-privileged actions per CLAUDE.md, not routine SUPERADMIN/HR config changes).
- Employee self-service (`notification-preferences.actions.ts`) untouched — no `userId` parameter exists on those actions at all, so an employee cannot target another user's preferences through them by construction.

## Files

**Created:** `src/actions/notification-preferences-admin.actions.ts`, `src/components/admin/EmployeeNotificationPreferencesPanel.tsx`, `docs/notification-engine/reports/AdminPreferenceManagementReport.md`.

**Modified:** `repositories/interfaces/notification-preference-repository.interface.ts` (+`deleteOne`), `repositories/notification-preference.repository.ts` (+`deleteOne` impl), `preferences/notification-preference.service.ts` (+`resetForUser`), `preferences/notification-preference.service.test.ts` (+7 tests), `notification.service.test.ts` + both `integration/*.test.ts` files (fake repositories updated to implement the new interface method — a compile-time forcing function, no behavior change), `(admin)/admin/notification-center/page.tsx` (new tab).

**Not touched:** `prisma/schema.prisma`, `NotificationEvent`, `NotificationJob`, `NotificationDeliveryAttempt`, `NotificationProvider`, `NotificationTemplate`, `NotificationSettings`, `NotificationService.raiseEvent()`, `QueueEngine`, `WorkerRuntime`, `TemplateEngine`, `DeliveryManager`, SMTP, `loan.actions.ts`, `notification-preferences.actions.ts` (employee self-service).

## Database

**None.** The existing Phase 13 `NotificationPreference` model already had the exact shape needed — no migration proposed, generated, or applied.

## Authorization

`SUPERADMIN`/`HR` only, re-checked independently in all three new actions (never relies on page-level gating). Managers deliberately excluded. Target employee id is always re-verified against `prisma.user`, never trusted as-is. One pre-existing gap surfaced, not introduced by this phase: `(admin)/layout.tsx` gates on `role === "SUPERADMIN"` only, so HR — while fully authorized at the action layer — has no page route to reach this UI today, identical to every other existing "SUPERADMIN-or-HR" feature in this codebase (loans, wallet, medical, the rest of the admin Notification Center). Flagged for a separate routing decision, not worked around silently.

## Tests

```
tests 515   suites 128   pass 515   fail 0
```

508 pre-existing tests unmodified and still green + 7 new (`resetForUser` behavior: removes explicit row, never upserts a fake default, safe no-op, catalog rejection ×2, per-user/per-channel scoping — plus one test proving `setForUser` already worked for an arbitrary target `userId`). Stable across 2 consecutive clean-rebuild runs. Server Action authorization checks are not covered by `node --test` — same, unavoidable constraint as every other `.actions.ts` file in this codebase (the harness cannot import `@/lib/prisma`/Clerk); verified instead by direct code review against the proven `notification-admin.actions.ts` pattern.

## TypeScript

`pnpm tsc --noEmit` — zero errors, whole project.

## ESLint

`pnpm run lint` — zero warnings/errors, whole project.

## Build

Not run this phase, per standing instruction to wait for the go-ahead. No change touches `proxy.ts`/`instrumentation.ts`/anything Edge-runtime-related.

## Security

Every action independently authorizes the caller and independently re-verifies the target employee before any read/write. No credentials or sensitive data touch the new `AuditLog` rows — only preference true/false state and actor/employee identifiers. `employeeId`/`notificationType`/`channel` are all treated as untrusted client input at every layer (Prisma existence check + catalog validation), never passed straight into a query or trusted from a hidden field.

## Known Issues

HR has no page-level route to this UI today (pre-existing, cross-cutting gap — see Authorization above). `NotificationDeliveryAttempt` rows are still never written anywhere in the dispatch pipeline (pre-existing, unrelated to preferences). Manager access was deliberately not added, per the phase spec.

## Next Recommended Phase

If HR needs to actually use this in practice: a dedicated decision about HR page-level routing (new route group, or loosening `(admin)/layout.tsx`) — a routing/access-model change deserving its own scope discussion, not folded into this phase. Beyond that: the same extension points every phase since Phase 2 has been built around — additional business events and channels, picked up automatically by this admin panel the moment they're added to `MANAGEABLE_NOTIFICATION_TYPES`.

# Phase 15 — Additional Business Event Integration

**PHASE 15 COMPLETE**

Full detail in [BusinessEventsIntegrationReport.md](../reports/BusinessEventsIntegrationReport.md).

## Goal

Wire the next 4 real business events into `NotificationService.raiseEvent()`, using the exact `LOAN_APPROVED` (Phase 10) pattern — no engine redesign, no new table, no notification logic inside business modules.

## Implemented

- `LEAVE_APPROVED` / `LEAVE_REJECTED` — `approveLeaveApplication()` / `rejectLeaveApplication()` (`leave.actions.ts`), each guarded by an existing `status !== "PENDING"` check.
- `OVERTIME_REQUEST_APPROVED` / `OVERTIME_REQUEST_DECLINED` — `approveOvertimeRequest()` / `declineOvertimeRequest()` (`overtime-request.actions.ts`), each guarded by an existing `status !== "PENDING" && status !== "MANAGER_VERIFIED"` check.
- All 4: `raiseEvent()` called after the write commits, wrapped in its own `try/catch`, never blocking the business action; recipient resolved directly from existing query data (added `email: true` to an existing overtime `select`, no schema change); deterministic `dedupeKey` per record id; `EMAIL`-only channel.
- All 4 added to `MANAGEABLE_NOTIFICATION_TYPES` (Phase 13/14's preference catalog) so they're toggleable through the existing self-service and admin preference UIs — `NotificationService.raiseEvent()` itself needed zero changes, since its Phase 13 preference check already reads `NotificationPreference` generically by `(recipientUserId, eventType, channel)`.
- 4 new `NotificationTemplate`/EMAIL rows registered via the existing idempotent `prisma/seed.js` mechanism (extended with the same `findFirst`-then-`create` guard `LOAN_APPROVED`'s own template uses) and applied to the live database via a targeted, side-effect-free script — not the full `seed.js`, which also creates 2 unrelated fake `PENDING` loans.
- Small DRY extraction in `leave.actions.ts`: `leaveDecisionActorLabel()`, pulling out the `"admin"→"Admin"`/`"manager"→"Manager"` label the file's existing `notifyLeaveDecision()` already computed inline, now shared with the new `raiseEvent` payloads.

## Files

**Created:** `src/lib/services/notification-engine/integration/business-events.integration.test.ts`, `docs/notification-engine/reports/BusinessEventsIntegrationReport.md`.

**Modified:** `src/actions/leave.actions.ts` (2 `raiseEvent` calls + `leaveDecisionActorLabel` helper), `src/actions/overtime-request.actions.ts` (2 `raiseEvent` calls + `email: true` added to 2 existing `select` blocks), `preferences/preference-catalog.ts` (+4 catalog entries), `prisma/seed.js` (+4 idempotent template-registration blocks).

**Not touched:** `prisma/schema.prisma`, `NotificationService.raiseEvent()`, `QueueEngine`, `WorkerRuntime`, `TemplateEngine`, `DeliveryManager`, SMTP, the Notification Center, `notification-preferences.actions.ts`, `notification-preferences-admin.actions.ts`, `loan.actions.ts`.

## Database

**None.** No migration, no schema edit — only 4 `NotificationTemplate` data rows inserted via the existing idempotent mechanism.

## Tests

```
tests 537   suites 133   pass 537   fail 0
```

515 pre-existing tests unmodified and still green (including the untouched `LOAN_APPROVED` suite) + 22 new, covering per event: event/job creation with exact payload/recipient/dedupeKey, full delivery to `SENT`, SMTP-failure retry, disabled-preference isolation, and dedup on a repeated `raiseEvent` call. Stable across 2 consecutive clean-rebuild runs. Business-module trigger points (`approveLeaveApplication` etc. actually calling `raiseEvent`) are not directly unit-tested — same unavoidable constraint as every `.actions.ts` file in this codebase (the harness cannot import `@/lib/prisma`/Clerk) — verified instead by direct code review, with `tsc --noEmit` confirming every payload field referenced actually exists on the query result.

## TypeScript

`pnpm tsc --noEmit` — zero errors, whole project.

## ESLint

`pnpm run lint` — zero warnings/errors, whole project.

## Build

Not run this phase, per standing instruction to wait for the go-ahead.

## Security

No authorization logic changed. One pre-existing gap surfaced, not fixed: `approveLeaveApplication`/`rejectLeaveApplication` accept an unauthenticated `approvedBy` string with no server-side role check — unlike every other approve/reject action in this codebase, including the 2 overtime functions this phase also touches. No new dependency, no secret referenced anywhere in the new code.

## Known Issues

The leave-approval authorization gap above (pre-existing). `NotificationDeliveryAttempt` rows still never written anywhere (pre-existing, unrelated). The Phase 14 HR routing gap is unaffected by this phase.

## Next Recommended Phase

Extend the same pattern to `approveMedicalClaim`/`rejectMedicalClaim` and `approveTimelineModificationRequest`/`rejectTimelineModificationRequest` (both identified as safe candidates this phase deliberately deferred), or address the leave-approval authorization gap as its own explicitly-scoped fix.

# Phase 16 — Leave Approval Authorization Hardening

**PHASE 16 COMPLETE**

Full detail in [LeaveAuthorizationHardeningReport.md](../reports/LeaveAuthorizationHardeningReport.md).

## Goal

Fix the pre-existing authorization weakness flagged during Phase 15: `approveLeaveApplication()`/`rejectLeaveApplication()` trusted a client-supplied `approvedBy` string with no server-side verification of the caller at all.

## Implemented

- New pure module `src/lib/leave-authorization.ts` — `canApproveLeave()` (`SUPERADMIN | HR | (EMPLOYEE && isManager)`, matching the dominant approval-action pattern already used by `loan.actions.ts`/`overtime-request.actions.ts`/`medical.actions.ts`/`wallet.actions.ts`/`timeline.actions.ts`, deliberately distinct from this file's own `canManageOrganization`, which excludes HR and is scoped to org-configuration mutations) and `resolveApproverLabel()` (real name or role-based fallback). Zero Prisma/Clerk imports — unit-testable by the dependency-free harness, same pattern as `smtp-shared.ts`/`crypto.ts`.
- `approveLeaveApplication()`/`rejectLeaveApplication()`: now resolve the caller via `getDbUser()` and check `canApproveLeave()` as the very first statement, before any database read — an unauthorized caller triggers zero reads or writes. The old `approvedBy` client-supplied parameter is gone entirely; the verified user's resolved label now drives the DB write, the in-app notification, and the `LEAVE_APPROVED`/`LEAVE_REJECTED` email payload.
- Fixed a second, related pre-existing bug found during the same audit: `notification.actions.ts`'s `handleNotificationAction` was passing a free-text admin note into the (now-removed) `approvedBy` slot — corrected to land in the right parameter.
- `LeaveApprovalButtons.tsx` and its two page callers updated to stop passing the now-nonexistent identity argument.

## Files

**Created:** `src/lib/leave-authorization.ts`, `src/lib/leave-authorization.test.ts`, `docs/notification-engine/reports/LeaveAuthorizationHardeningReport.md`.

**Modified:** `src/actions/leave.actions.ts`, `src/actions/notification.actions.ts`, `src/components/admin/LeaveApprovalButtons.tsx`, `src/app/(manager)/manager/leave-applications/page.tsx`, `tsconfig.test.json`, `package.json`.

**Not touched:** `prisma/schema.prisma`, any migration, `NotificationService`, `QueueEngine`, `WorkerRuntime`, `TemplateEngine`, `DeliveryManager`, SMTP, the Notification Center, preferences actions, `overtime-request.actions.ts`, `loan.actions.ts`.

## Database

**None.** `LeaveApplication.approvedBy` is the same pre-existing `String?` column, now receiving a verified value instead of a trusted client string.

## Authorization Behaviour — Before vs After

**Before:** no server-side check at all; any caller reaching either function, passing any string, could approve/reject any pending leave application and have that string stored/displayed as the approver.

**After:** `getDbUser()` resolves the real session user; `canApproveLeave()` requires `SUPERADMIN`, `HR`, or an `EMPLOYEE` with `isManager: true`, checked before any data is touched; the stored/displayed "approver" is always derived from the verified user, never from client input.

## Tests

```
tests 548   suites 135   pass 548   fail 0
```

537 pre-existing tests unmodified and still green (including the full, untouched Phase 15 `business-events.integration.test.ts` and Phase 10 `loan-approved.integration.test.ts` suites) + 11 new, covering: authorized SUPERADMIN/HR/manager acceptance, unauthorized plain-employee and null-user rejection, and proof that no client-suppliable field on the authorization input can grant access. Stable across 2 consecutive clean-rebuild runs. Failed-authorization → no notification event/job, and the Phase 15 notification/preference behavior being unchanged, are verified structurally (auth check precedes the transaction and the `raiseEvent` call by several statements) and by the untouched Phase 15 suite remaining green, respectively — same action-layer verification constraint documented in every prior phase (the harness cannot import `@/lib/prisma`).

## TypeScript

`pnpm tsc --noEmit` — zero errors, whole project.

## ESLint

`pnpm run lint` — zero warnings/errors, whole project.

## Build

`pnpm run build` — compiles successfully. Same 5 pre-existing cosmetic Turbopack Edge-runtime warnings as every prior phase, no new warning introduced.

## Security

Authorization is now genuinely server-side and unforgeable via client input — the vulnerable parameter no longer exists. No new attack surface, no secret referenced, no new dependency. `handleNotificationAction`'s own lack of a top-level authorization check (a broader, pre-existing gap unrelated to leave specifically) was deliberately not touched, per this phase's explicit scope.

## Known Issues

`handleNotificationAction`'s missing top-level authorization check (pre-existing, broader than leave, not currently exploitable for leave decisions since the delegated action now authorizes independently). The Phase 14 HR routing gap (unrelated). `NotificationDeliveryAttempt` rows still never written (pre-existing, unrelated).

## Next Recommended Phase

Either extend this same authorization audit to `handleNotificationAction`'s other delegated action types, or continue the Phase 15 business-event rollout to `approveMedicalClaim`/`rejectMedicalClaim` and `approveTimelineModificationRequest`/`rejectTimelineModificationRequest`.

# Phase 17 — Notification Action Authorization Audit & Hardening

**PHASE 17 COMPLETE**

Full detail in [NotificationActionAuthorizationReport.md](../reports/NotificationActionAuthorizationReport.md).

## Goal

Complete authorization audit of `src/actions/notification.actions.ts`, closing the broader concern Phase 16 surfaced but left untouched: `handleNotificationAction` had no top-level auth check of its own.

## Findings

- `handleNotificationAction` had **zero** authentication/role check. Two of its four delegated branches (`PROFILE_UPDATE_REQUEST`, `LEAVE_APPLICATION_PENDING`) already self-authorize independently (the latter as of Phase 16) and were safe called directly; the other two (`LOAN_APPLICATION_PENDING`/`WALLET_REQUEST_PENDING`) are unconditional-success **stubs with no real business action to delegate to at all** — the most severe finding, since nothing anywhere authorized them.
- `action` was never runtime-validated — any non-`'approve'` value silently fell into the `decline` branch.
- 5 other exported functions in the same file (`markNotificationAsRead`, `markAllNotificationsAsRead`, `markNotificationAsUnread`, `deleteNotification`, `getAllNotifications`, `getUnreadCount`) had no authorization at all — `getAllNotifications` in particular is an information-disclosure risk (full `AdminNotification` feed, zero role check).
- `handleNotificationAction`'s only UI caller, `NotificationBell.tsx`, is **orphaned** — imported by no page or layout anywhere. Zero live workflow depended on its lack of protection.

## Implemented

- New pure module `src/lib/notification-action-authorization.ts`: `canProcessAdminNotificationAction()` (`SUPERADMIN | HR | (EMPLOYEE && isManager)` — the union of what every delegated action already requires) for `handleNotificationAction`; `canManageAdminNotificationInbox()` (`SUPERADMIN | HR`, matching `getUnreadNotifications`'s pre-existing precedent, no manager) for the 6 general inbox-management functions; `isValidNotificationDecision()`/`hasNotificationId()` runtime guards.
- `handleNotificationAction`: checks `canProcessAdminNotificationAction()` before reading the notification or delegating to anything.
- The 6 CRUD functions: each now checks `canManageAdminNotificationInbox()` first.
- A private `setAdminNotificationStatus()` helper holds the actual write, called by the two public mark-read/unread wrappers (after their own check) and directly by `handleNotificationAction` (after its own, correctly wider check) — so a manager who legitimately approves a leave/profile request through this flow still gets it marked read.
- Verified, not assumed: traced every real caller of every modified function; every live (non-orphaned) caller is already restricted to a strict subset of the new checks (SUPERADMIN-only route gates), so no existing workflow is broken.

## Files

**Created:** `src/lib/notification-action-authorization.ts`, `src/lib/notification-action-authorization.test.ts`, `docs/notification-engine/reports/NotificationActionAuthorizationReport.md`.

**Modified:** `src/actions/notification.actions.ts`, `tsconfig.test.json`, `package.json`.

**Not touched:** `prisma/schema.prisma`, any migration, `NotificationService`, `QueueEngine`, `WorkerRuntime`, `TemplateEngine`, `DeliveryManager`, SMTP, `instrumentation.ts`, `production-worker.ts`, `leave.actions.ts`, `profile.actions.ts`, `leave-automation.actions.ts`, any UI component/page.

## Database

**None.**

## Tests

```
tests 563   suites 139   pass 563   fail 0
```

548 pre-existing tests unmodified and still green + 15 new, covering unauthenticated/employee rejection, manager/HR/SUPERADMIN acceptance, the deliberate difference between the two authorization rules, forged-identity resistance, and invalid action/id rejection. Stable across 2 consecutive clean-rebuild runs.

## TypeScript

`pnpm tsc --noEmit` — zero errors, whole project.

## ESLint

`pnpm run lint` — zero warnings/errors, whole project.

## Build

Not run by the agent this phase, per standing instruction (the user runs `pnpm run build` and reports the output back). This phase's changes touch only `src/actions/notification.actions.ts` and two new `src/lib/*.ts` files — none Edge-runtime-adjacent — so no new build warning is expected beyond the 5 pre-existing cosmetic ones.

## Security

IDOR/cross-user access closed (every AdminNotification read/write now requires an authorized caller regardless of the id supplied). No client-controlled identity anywhere in this file. No accidental privilege escalation — every new rule is equal to or narrower than what a legitimate caller already needed via the live UI. `LOAN_APPLICATION_PENDING`/`WALLET_REQUEST_PENDING` stub behavior is now properly access-gated (still functionally incomplete, a correctness gap not a security one — see Known Issues).

## Known Issues

`LOAN_APPLICATION_PENDING`/`WALLET_REQUEST_PENDING` remain functional stubs (access-gated, not feature-complete). `api/cron/daily-notifications/route.ts` has no signature/secret check of its own (different file, out of scope). Phase 14's HR routing gap (unrelated). `NotificationDeliveryAttempt` rows still never written (pre-existing, unrelated).

## Next Recommended Phase

Wire `LOAN_APPLICATION_PENDING`/`WALLET_REQUEST_PENDING` to real `loan.actions.ts`/`wallet.actions.ts` logic (now safe to build on top of), or continue the Phase 15 business-event rollout to `approveMedicalClaim`/`rejectMedicalClaim` and `approveTimelineModificationRequest`/`rejectTimelineModificationRequest`.

