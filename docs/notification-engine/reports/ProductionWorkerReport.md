# Production Worker Report (Phase 11 — Production Worker Activation & Operations)

This phase moves the Notification Engine from "provably correct in tests" (Phases 8–10) to "actually running, unattended, in production." It adds exactly one new operational layer around the six frozen components (`QueueEngine`, `WorkerRuntime`, `TemplateEngine`, `DeliveryManager`, `NotificationService`, SMTP Provider) — none of them were redesigned, extended, or modified.

## Goal & Scope

Start `WorkerRuntime` safely, exactly once per process, with crash/lease recovery, health visibility, and real logging — using this project's own existing conventions wherever one already existed, rather than introducing new infrastructure.

## Files Created

| File | Purpose |
|---|---|
| `queue/console-logger.ts` | `ConsoleQueueLogger implements IQueueLogger` — the first non-`NoopLogger` implementation. Plain `console.*`, matching this project's one logging convention. |
| `notification-settings.ts` | `getOrCreateNotificationSettings()` — same singleton-row upsert pattern as `src/lib/system-control.ts`. First reader of the `NotificationSettings` model (Phase 1, previously untouched by any code). |
| `worker/worker-lifecycle-manager.ts` | `WorkerLifecycleManager` — the prisma-free, fully-testable operational wrapper around `WorkerRuntime` (duplicate-start prevention, crash/lease recovery, combined health snapshot). See "Architecture" below for why this exists as its own class. |
| `worker/worker-lifecycle-manager.test.ts` | 9 tests: startup, duplicate startup, shutdown, restart, ongoing lease recovery (including a reaper-failure case), health snapshot. |
| `production-worker.ts` | The one prisma-touching wiring file: reads `NotificationSettings`, builds a settings-configured `QueueEngine`/`WorkerRuntime`, constructs the process-lifetime `WorkerLifecycleManager` singleton. This is what `instrumentation.ts` calls. |
| `src/app/api/notification-engine/worker-health/route.ts` | `GET`, SUPERADMIN-only — read-only JSON health/heartbeat/metrics snapshot (item 8). |
| `integration/worker-activation.integration.test.ts` | 2 tests: the full automatic loop (`WorkerLifecycleManager.start()` → `raiseEvent()` → claimed/rendered/sent with **no manual `processNext()` call** → still running for a second event) and crash recovery (a job left `PROCESSING` by a simulated crashed run is reclaimed on startup and processed normally). |
| `docs/notification-engine/reports/ProductionWorkerReport.md` | This file. |

## Files Modified

| File | Change |
|---|---|
| `src/instrumentation.ts` | One new guarded startup function, `startNotificationWorker()`, added alongside the three existing cron starters — same `global` idempotency-flag pattern, same `NEXT_RUNTIME === "nodejs"` gate. Calls `startProductionNotificationWorker()` and logs (not throws) on failure. |
| `queue/index.ts` | Export `ConsoleQueueLogger`. |
| `worker/index.ts` | Export `WorkerLifecycleManager` and its two supporting types. |

## Startup Strategy (Item 1) — Why `instrumentation.ts`

This project already has exactly one established mechanism for starting a long-running in-process background loop at application boot: `src/instrumentation.ts`'s `register()` hook, gated on `process.env.NEXT_RUNTIME === "nodejs"`, with three existing precedents (daily timeline cron, ZKTeco sync cron, leave automation cron) — each guarded by a `global.__xStarted` flag so Next.js's dev-mode module reloading can't start a second copy.

`WorkerRuntime` is the same *shape* of thing: a long-running, self-polling, in-process loop with its own graceful-shutdown semantics — not a request-scoped operation. Reusing the exact same startup mechanism was chosen over the alternatives for concrete reasons, not just convention:

- **A dedicated background process** (a second Node service) would require a new deployment artifact, a new process supervisor, and a new way for that process to reach the same Postgres database — none of which this single-Next.js-app project has ever had. It would also duplicate the exact "long-running loop started from Node boot" capability `instrumentation.ts` already provides.
- **A scheduled worker** (an external cron hitting an API route, like `/api/cron/daily-notifications`) fundamentally cannot work for this component: `WorkerRuntime` claims and holds a lease on a job for the *duration of delivery*, then immediately polls for the next one — a request/response-shaped scheduled trigger would either time out mid-delivery or force claiming to become stateless across invocations, which is a redesign of `WorkerRuntime` itself (explicitly forbidden this phase).
- **A server startup hook** is, in this framework, precisely what `instrumentation.ts` *is* — there is no separate mechanism to choose.

So: `instrumentation.ts`, using the same guarded-`global`-flag idiom as the three existing crons, is both the correct fit and the lowest-risk option — no new deployment topology, no new dependency, one small additive function in an already-established file.

## Architecture — Why a New `WorkerLifecycleManager` Class Instead of Extending `WorkerRuntime`

`WorkerRuntime` (Phase 4) already has its own graceful `start()`/`stop()`, 9-state lifecycle, heartbeat, and metrics — none of that was touched. Three things this phase needs are deliberately *not* `WorkerRuntime`'s job, per its own frozen design:

1. **Crash/lease recovery sweeping** — `QueueEngine.recoverExpiredLocks()` (Phase 3) has existed since Phase 3 but nothing has ever called it periodically; `WorkerRuntimeReport.md`'s own "Intentionally Postponed" section named this exact gap. `WorkerRuntime` has no reference to `QueueEngine` at all (it depends on the narrower `INotificationWorker`), so adding a reaper sweep *inside* `WorkerRuntime` would mean giving it a new dependency it was never designed to have — a redesign, not an addition.
2. **Process-level duplicate-start prevention as a safe no-op** — `WorkerRuntime.start()` already guards against being started while not `STOPPED`, but it does so by *throwing*. An unattended application-boot call site (`instrumentation.ts`) must never let a second, accidental start attempt crash the process; it needs a guard that logs and returns.
3. **A single combined health/heartbeat/metrics/isStarted snapshot** — `WorkerRuntime` exposes `health()`/`heartbeat()`/`metrics()`/`status()` as four separate calls; the health-check route needs one object.

All three are *operational* concerns layered around `WorkerRuntime`, not changes to what `WorkerRuntime` claims, dispatches, or retries. `WorkerLifecycleManager` composes `WorkerRuntime` and `Pick<IQueueEngine, "recoverExpiredLocks">` (Interface Segregation — it needs exactly one `IQueueEngine` method, so that's exactly what it depends on) without modifying either. It is fully prisma-free and unit-testable with the same fakes every other `worker/` test file already uses — `production-worker.ts` is the only new file that touches Prisma/`NotificationSettings`, and it is intentionally a thin, untested-by-design wiring layer (the same role `container.ts` already plays).

## Production Lifecycle

```
instrumentation.ts register()
  -> startNotificationWorker()            (global-flag guarded, once per process)
  -> production-worker.ts: startProductionNotificationWorker()
       -> getOrCreateNotificationSettings()        (NotificationSettings, item 11)
       -> new QueueEngine(container.queueRepository, ConsoleQueueLogger, retryOptionsFromSettings)
       -> createWorkerRuntime(queueEngine, configFromSettings, ConsoleQueueLogger, dispatchIntegration)
       -> new WorkerLifecycleManager({ runtime, queueEngine, leaseDurationMs, reaperIntervalMs })
       -> lifecycleManager.start()
            -> queueEngine.recoverExpiredLocks(leaseDurationMs)     (crash recovery, item 6/7)
            -> runtime.start()                                      (WorkerRuntime's own graceful startup)
            -> setInterval(() => queueEngine.recoverExpiredLocks(...), 60_000)   (ongoing lease recovery, item 7)
```

`production-worker.ts` deliberately builds its **own** `QueueEngine`/`WorkerRuntime` rather than starting `notificationEngineContainer.workerRuntime` (the instance `container.ts` has built, unstarted, since Phase 8). `container.ts` is a synchronous, module-load-time singleton — `NotificationSettings` requires an async DB read, and `NotificationService.raiseEvent` (called synchronously from `loan.actions.ts` today) depends on `notificationEngineContainer` being immediately usable at import time. Making the container's own construction async to thread settings through it would be a materially bigger, riskier change than this phase's scope. Both `QueueEngine` instances are stateless wrappers over the same `NotificationJob` table via the same `queueRepository` object — running two is exactly as safe as two worker *processes* sharing one database, which this engine's crash-recovery/lease design has always been built to tolerate. `notificationEngineContainer.workerRuntime` itself remains dormant, as it has since Phase 8; only `production-worker.ts`'s own runtime is ever started.

## Duplicate Startup Prevention (Items 3, 4)

Two independent layers, matching the existing crons' own defense-in-depth shape:

1. **`instrumentation.ts`'s `global.__notificationWorkerStarted` flag** — survives Next.js dev-mode module hot-reloading re-invoking `register()`; identical mechanism to the three existing crons.
2. **`WorkerLifecycleManager.start()`'s own `started` guard** — a second call (from any caller, not just `instrumentation.ts`) logs `worker_lifecycle.duplicate_start_prevented` and returns, rather than reaching `WorkerRuntime.start()`'s own throwing guard.

## Graceful Shutdown (Item 5)

`WorkerLifecycleManager.stop()` clears the reaper interval, then delegates to `WorkerRuntime.stop()` — already fully graceful since Phase 4 (waits for an in-flight job up to `shutdownGracePeriodMs`, force-releases the lease if the grace period is exceeded, logs the outcome). This phase does **not** wire `process.on("SIGTERM"/"SIGINT", ...)`: none of the three existing crons in `instrumentation.ts` register OS signal handlers either, and Node disables its own default terminate-on-SIGTERM behavior the moment *any* listener is added — doing so without also deciding when to call `process.exit()` (a decision about the whole Next.js process, not just this engine) would be a bigger, riskier change than "implement graceful shutdown" requires. `stopProductionNotificationWorker()` is exported and ready to be wired to a signal handler, an admin action, or a future ops phase — this is a disclosed, deliberate scope boundary, not an oversight.

## Crash & Lease Recovery (Items 6, 7)

- **Jobs left `QUEUED`/`RETRY_SCHEDULED`** after an ungraceful restart need no special handling — `QueueEngine.claimNext()` already picks them up as soon as the new process starts polling (Phase 3, unchanged).
- **Jobs left `PROCESSING`** by a process that died without calling `stop()` (a crash, `SIGKILL`, an orchestrator hard-restart) are the real gap: nothing reclaims their lease. `WorkerLifecycleManager.start()` now calls `recoverExpiredLocks()` once immediately (before the runtime starts polling), and again every 60 seconds for the life of the process — the second sweep matters in a multi-instance deployment, where a *sibling* process's crash needs to be recovered by whichever instance is still alive. Proven at both the unit level (`worker-lifecycle-manager.test.ts`) and the integration level (`worker-activation.integration.test.ts`'s crash-recovery test, which locks a job as if by a crashed run and confirms it is reclaimed and delivered on the next startup).

## Health Monitoring (Item 8)

`WorkerLifecycleManager.snapshot()` combines `isStarted`, `WorkerRuntime.status()`, `.health()`, `.heartbeat()`, and `.metrics()` into one object, exposed at `GET /api/notification-engine/worker-health` (SUPERADMIN-only, matching this project's `getDbUser()` + role-check convention). Not the forbidden "Notification Center" — that term refers to an end-user notification inbox/management UI (named consistently across every prior phase's DO NOT IMPLEMENT list); this is operations tooling in the same category as `/api/admin/generate-timeline` and `/api/cron/*`, already established API-route patterns in this codebase.

## Worker Startup/Shutdown Logging (Items 9, 10)

`WorkerRuntime` and `NotificationWorker` have logged `worker.starting`/`worker.started`/`worker.stopping`/`worker.stopped`/job-lifecycle events since Phases 2–4 — every prior phase wired `NoopLogger` (or left the default), so none of it was ever visible. `production-worker.ts` is the first call site to pass a real logger (`ConsoleQueueLogger`) into `QueueEngine`/`createWorkerRuntime`; `WorkerLifecycleManager` adds its own `worker_lifecycle.*` events (`startup_recovery`, `started`, `stopped`, `duplicate_start_prevented`, `expired_leases_recovered`, `reaper_failed`) at the same log points. No new logging *mechanism* was introduced — this closes a wiring gap the last three phases' reports each disclosed as open.

## Configuration Through `NotificationSettings` (Item 11)

| `NotificationSettings` field | Feeds into |
|---|---|
| `workerPollIntervalSeconds` | `WorkerConfig.pollIntervalMs` |
| `retryBaseDelaySeconds`, `retryMaxDelaySeconds`, `retryMaxAttempts`, `retryJitterRatio` | `QueueEngine`'s `RetrySchedulerOptions` |
| `emailChannelEnabled` | Whether `createWorkerRuntime` wires a real `DeliveryManagerChannelAdapter` for EMAIL at all — `false` keeps EMAIL on `StubChannelAdapter`, an operational kill-switch without a redeploy |

`workerBatchSize` and the two retention-day fields have no corresponding consumer yet (`NotificationWorker` claims one job at a time via `claimNext`, never a batch; retention/cleanup was never built in any phase) — left unused rather than wiring them to something that doesn't exist, per "where appropriate." If `getOrCreateNotificationSettings()` itself fails (e.g. a transient DB error at boot), `production-worker.ts` logs the failure and falls back to this engine's existing hardcoded defaults rather than failing application startup entirely.

## Production Documentation (Item 12)

This report is that documentation: startup mechanism and why, the full production call chain, duplicate-start/shutdown/recovery/health behavior, the settings mapping table above, and the health-check route's shape. `docs/notification-engine/updates/update.md`'s Phase 11 section is the changelog-style companion.

## Tests Executed

Clean rebuild, stable across 2 consecutive runs:

```
tests 445   suites 111   pass 445   fail 0
```

11 new tests: 9 in `worker-lifecycle-manager.test.ts` (startup + startup recovery logging, duplicate startup, shutdown + reaper-interval clearing + shutdown-before-start, restart, ongoing lease recovery + reaper-failure resilience, health snapshot before/after start), 2 in `worker-activation.integration.test.ts` (the full automatic-loop chain from the Testing section's diagram, and crash recovery). All 434 pre-existing tests remain green, unmodified.

## Coverage

| Testing section item | Covered by |
|---|---|
| Startup | `worker-lifecycle-manager.test.ts` "startup"; `worker-activation.integration.test.ts` |
| Shutdown | `worker-lifecycle-manager.test.ts` "shutdown" (interval cleared, stop-before-start) |
| Restart | `worker-lifecycle-manager.test.ts` "restart" |
| Duplicate startup | `worker-lifecycle-manager.test.ts` "duplicate startup" |
| Crash recovery | `worker-activation.integration.test.ts`'s crash-recovery test |
| Lease recovery | `worker-lifecycle-manager.test.ts` "ongoing lease recovery" (including a reaper-failure case) |
| Worker health | `worker-lifecycle-manager.test.ts` "health" |
| Full chain (Application Start → ... → Worker Continues Running) | `worker-activation.integration.test.ts`'s first test — no manual `processNext()` call anywhere, proven via the runtime's own poll loop, including a second event after the first completes |

## Performance

`WorkerLifecycleManager` adds exactly one `recoverExpiredLocks()` call at startup and one every 60 seconds thereafter — both already-existing, already-analyzed-as-cheap `QueueEngine` operations (a single `updateMany`-style sweep over `PROCESSING` rows past their lease, typically zero rows in the steady state). No new per-job overhead: the poll/claim/dispatch loop itself is entirely `WorkerRuntime`'s unmodified Phase 4 code.

## Memory

One long-lived `setInterval` (the reaper) for the life of the process, cleared on `stop()` — no leak. `WorkerLifecycleManager` holds no per-job state; all job-scoped state remains inside `WorkerRuntime`/`ExecutionContext`, unchanged.

## Long-Running Stability & Resource Cleanup

- The reaper timer is always cleared in `stop()`, including the "stop before start" no-op path (nothing to clear) and `restart()` (stop fully tears down before start rebuilds).
- A reaper sweep that throws (e.g. a transient DB error) is caught, logged as `worker_lifecycle.reaper_failed`, and does **not** stop the interval — proven by a dedicated test (`worker-lifecycle-manager.test.ts`'s "a reaper sweep failure is logged, not thrown, and does not stop future sweeps").
- `WorkerRuntime`'s own `maxConsecutiveErrors` safety valve (Phase 4, unmodified) still applies underneath — a persistently broken dependency (e.g. the database unreachable) still causes the runtime to stop itself rather than spin forever; this phase adds no new unbounded-retry surface.

## Technical Debt

None introduced. The `NotificationSettings` fields with no consumer (`workerBatchSize`, both retention-day fields) are pre-existing schema surface from Phase 1, not new debt from this phase.

## Breaking Changes

**None.** Every previously-completed phase's public API (`QueueEngine`, `WorkerRuntime`, `TemplateEngine`, `DeliveryManager`, `NotificationService`, SMTP provider) is untouched. `container.ts`'s existing (dormant) `workerRuntime` is unaffected — it is simply not the instance production now uses. `instrumentation.ts`'s three existing crons are unmodified; the new fourth starter follows their exact pattern.

## Engineering Review Summary

- **Production readiness**: The engine now starts automatically on boot, recovers from crashes/restarts, and exposes health — the three concrete gaps every prior phase's "Next Recommended Phase" section pointed at are closed.
- **Startup strategy**: `instrumentation.ts`, justified above — no new deployment topology.
- **Shutdown behavior**: Delegates to `WorkerRuntime.stop()`'s already-graceful implementation; OS-signal wiring deliberately deferred (see "Graceful Shutdown" above).
- **Crash recovery**: `recoverExpiredLocks()` at startup + on a 60s interval; proven at both unit and integration level.
- **Memory usage**: One interval timer; no accumulating state.
- **Long-running stability**: Reaper failures don't kill the sweep loop; `WorkerRuntime`'s own consecutive-error circuit breaker is untouched and still active.
- **Resource cleanup**: `stop()`/`restart()` always clear the reaper timer before proceeding.
- **SOLID**: `WorkerLifecycleManager` depends on `Pick<IQueueEngine, "recoverExpiredLocks">`, not the full interface (Interface Segregation); it composes `WorkerRuntime` rather than modifying it (Open/Closed — Phase 4's class gained zero new methods).
- **Maintainability**: All new operational logic lives in one small, prisma-free, directly-testable class; the only untested-by-design file (`production-worker.ts`) is a thin wiring layer with no branching logic beyond a settings-driven config mapping, mirroring `container.ts`'s own established role.

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
| **11 — Production Worker Activation & Operations** | **Complete** |
| 12+ — Notification Center, additional channels/business events | Not started |

445/445 tests passing project-wide. `tsc --noEmit` and `eslint` both clean across the entire repository.

## Next Recommended Phase

The engine is now fully live end to end: a loan approval enqueues an email, and a worker started automatically at application boot delivers it, recovers from crashes, and reports its health — with zero manual intervention required. What remains is everything every prior phase explicitly deferred: a Notification Center (admin/employee-facing dashboard over `NotificationJob`/`NotificationDeliveryAttempt`), additional business events beyond `LOAN_APPROVED`, and additional channels (SMS/WhatsApp/Push) behind their own `DeliveryProvider` + `registerXyzProvider()`, following the exact extension pattern this engine has been built around since Phase 2.
