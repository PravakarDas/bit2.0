# Post-Phase-17 Gap / Unfinished-Work Audit

**Audit only — no code, schema, or migration changes were made while producing this report.** Every claim below was verified directly against the current repository and, where practical, the live database (read-only queries only), not assumed from older phase reports. Two items that older reports (predating Phase 11) still listed as open gaps turned out to already be resolved by later phases — those corrections are called out explicitly rather than silently copied forward.

## Method

1. Read every report under `docs/notification-engine/reports/`, the design doc, both audit reports, and the full `updates/update.md` change log (Phases 0–17).
2. Extracted every "Known Limitations"/"Known Issues"/"Next Recommended Phase" section, plus the Phase 4-era technical-audit table (`update.md`'s "Part 2 — Technical Audit", 9-item design-deviation list).
3. Re-verified each claim against the **current** code (not the code as it existed when the claim was written) via targeted `grep`/`Read`.
4. Ran read-only database queries (`prisma migrate status`, plus ad-hoc `findMany`/`count`/`groupBy` queries against `NotificationTemplate`, `NotificationJob`, `NotificationDeliveryAttempt`, `NotificationProvider` — all scratch scripts deleted immediately after use, no data touched).
5. Ran no code-modifying command of any kind.

---

## Full Item List

### 1. `NotificationDeliveryAttempt` rows are never written

- **What**: The Design's §3 "immutable per-attempt audit record" table exists in the schema and has a working repository (`NotificationHistoryRepository.create()`), but nothing in the dispatch pipeline (`JobDispatcher`, `NotificationWorker`, `DeliveryManager`) ever calls it.
- **Where**: `src/lib/services/notification-engine/repositories/notification-history.repository.ts` (unused writer); no caller anywhere in `worker/` or `delivery/`.
- **Why incomplete**: Never implemented in any phase — flagged as a known gap as far back as `NotificationServiceReport.md` (Phase 9) and repeated in every phase since, never addressed.
- **Verified live**: `SELECT count(*) FROM "NotificationDeliveryAttempt"` → **0 rows**, despite the engine having processed real jobs (6 `LOAN_APPROVED` jobs exist: 2 `SENT`, 4 `DEAD_LETTER`). Confirms this is not theoretical — every real delivery attempt this engine has ever made left no attempt-level record.
- **Correctness**: Does not affect delivery correctness — jobs still process, retry, and complete/dead-letter correctly without this table.
- **Security**: None.
- **Production reliability**: Real gap — when something goes wrong (an SMTP error, a template failure), the only signal is the job's own `attemptCount`/`status`, which gets overwritten on every retry. There is no way to see *why* a specific attempt failed after the fact, which is exactly the debugging signal an ops person needs during an incident (this was felt directly during the SMTP investigation earlier in this project's history, where a `console.error` diagnostic had to be added ad hoc because no persisted record existed).
- **Blocks further phases?**: No.
- **Recommended solution**: Add one `historyRepository.create()` call in `JobDispatcher`'s dispatch outcome handling (success and failure paths), reusing the existing repository unmodified. Small, additive, touches `JobDispatcher` only.
- **Own phase or combine?**: Combine with item 2 as a single "Delivery Observability & Resilience" phase — both touch the same dispatch/delivery code path.
- **Classification: B — SHOULD FIX SOON.**

### 2. No SMTP failover / provider auto-recovery — single point of failure

- **What**: `DeliveryManager`/`ProviderResolver`/`ProviderSelector` fully support priority-ordered multi-provider failover, but exactly **one** SMTP provider is ever registered (`registerSmtpProvider(providerRegistry)`, called once in `container.ts`). `ProviderHealthMonitor` marks a provider `OFFLINE` after repeated consecutive failures, and — confirmed by reading `provider-health-monitor.ts` — there is **no timed/half-open recovery**: once `OFFLINE`, a provider stays `OFFLINE` until a manual `setState` call or an in-process success (which can't happen if `ProviderResolver` has already stopped selecting it).
- **Where**: `src/lib/services/notification-engine/container.ts:97`, `delivery/provider-health-monitor.ts`.
- **Why incomplete**: Disclosed as an architecture-only limitation since Phase 6/7 (`DeliveryFrameworkReport.md`/`SmtpProviderReport.md`'s own "Known Limitations"); never revisited since.
- **Correctness**: No effect while SMTP is healthy.
- **Security**: None.
- **Production reliability**: Real risk — if the single SMTP provider goes `OFFLINE` (5+ consecutive failures, per `ProviderHealthMonitor`'s threshold), **all** email delivery stops until the process restarts (which resets the in-memory health monitor) or someone manually intervenes. In practice, a Next.js deploy naturally restarts the worker and clears this state, which likely explains why it hasn't caused a sustained outage yet — but it is a real, load-bearing assumption ("we'll redeploy before this matters"), not a designed safeguard.
- **Blocks further phases?**: No.
- **Recommended solution**: At minimum, add a timed half-open retry (e.g. after N minutes, allow one probe attempt through an `OFFLINE` provider) to `ProviderHealthMonitor` — a self-contained, additive change. A second SMTP provider or channel is a larger, separate decision and not recommended purely for this fix.
- **Own phase or combine?**: Combine with item 1.
- **Classification: B — SHOULD FIX SOON.**

### 3. `NotificationProvider` table (priority/health persistence) is completely unused

- **What**: The DB-backed `NotificationProvider` model (priority, encrypted config, health status) has a full repository, but `updateHealth()` is never called anywhere, and the real SMTP provider is registered directly in code (reading `EmailConfig`, not a `NotificationProvider` row).
- **Where**: `repositories/notification-provider.repository.ts` (no caller for `updateHealth`).
- **Verified live**: `SELECT count(*) FROM "NotificationProvider"` → **0 rows**. Confirms the table has never been used at all, not just under-used.
- **Why incomplete**: A disclosed, deliberate Phase 7 decision (`SmtpProviderReport.md`: reuse `EmailConfig`, don't invent a second config source) — not a bug, but the DB table and its health-persistence machinery are now pure unused surface area.
- **Correctness/Security**: None.
- **Production reliability**: Low — provider health resets on restart regardless (see item 2); persisting it wouldn't meaningfully change today's behavior with only one provider.
- **Blocks further phases?**: No.
- **Recommended solution**: Leave as-is unless a second provider is ever added, at which point this becomes relevant. Not worth building now.
- **Classification: C — OPTIONAL / FUTURE.**

### 4. `IN_APP_ADMIN`/`IN_APP_EMPLOYEE` channels are non-functional if ever used

- **What**: The Design (§2/§6) describes these two channels as writing *directly* into `AdminNotification`/`EmployeeNotification` — no "delivery" or provider involved. The actual implementation registers a generic `StubChannelAdapter` for **every** channel including these two (`registerStubChannelAdapters`), and nothing overrides them the way `EMAIL` is overridden with `DeliveryManagerChannelAdapter`. A job raised on either channel would perpetually retry and dead-letter.
- **Where**: `worker/channel-adapters/register-stub-adapters.ts`; `worker/create-worker-runtime.ts` (only overrides `EMAIL`).
- **Why incomplete**: A real architectural mismatch, first named precisely in `update.md`'s Phase-4-era technical audit; never revisited since — because no business event has ever tried to use these channels (every event raised so far — `LOAN_APPROVED`, `LEAVE_APPROVED`/`REJECTED`, `OVERTIME_REQUEST_APPROVED`/`DECLINED` — uses `EMAIL` only).
- **Correctness**: **Currently latent, not active.** No live code path exercises this gap today.
- **Security**: None.
- **Production reliability**: A landmine for a future developer who assumes, from the schema enum listing `IN_APP_ADMIN`/`IN_APP_EMPLOYEE` as valid `NotificationChannel` values, that using them "just works" the way `EMAIL` does. It would silently dead-letter instead.
- **Blocks further phases?**: No — but blocks *this specific channel* being usable in any future phase without first fixing it.
- **Recommended solution**: Either (a) build the direct-write adapter per the original design when a real business need for in-app-only notifications arises, or (b) document clearly (a code comment on the enum / in the design doc) that these two channels are schema-valid but not yet functional, so a future phase doesn't assume otherwise.
- **Own phase or combine?**: Its own small phase, only if/when actually needed — no urgency to build speculatively.
- **Classification: C — OPTIONAL / FUTURE** (would become **A** immediately if any future phase tries to raise an event on one of these channels without fixing this first).

### 5. Crash-recovery reaper — ~~listed as unresolved in an old audit~~ **CONFIRMED ALREADY RESOLVED**

- **What**: `update.md`'s Phase-4-era technical audit flagged "`WorkerRuntime.tick()` never calls `recoverExpiredLocks()`" as a real gap.
- **Verified current state**: `WorkerLifecycleManager` (built in Phase 11, `ProductionWorkerReport.md`) runs `queueEngine.recoverExpiredLocks(leaseDurationMs)` once on startup **and** on a `setInterval` every `reaperIntervalMs` (60 seconds, configured in `production-worker.ts`) — confirmed by reading `worker/worker-lifecycle-manager.ts` directly. The mechanism is different from what the Design originally specified (a per-tick sweep vs. an independent timer), but it is functionally equivalent and genuinely running in production.
- **Correction**: This item should **not** be carried forward as an open gap — the old audit table (written before Phase 11 existed) is now stale on this point.
- **Classification: E — ALREADY COMPLETE, NO ACTION NEEDED.**

### 6. `NotificationSettings` DB config — ~~listed as unresolved in an old audit~~ **CONFIRMED ALREADY RESOLVED**

- **What**: The same old audit flagged `NotificationSettings` (worker poll interval, retry policy, retention, per-channel enable flags) as "never read anywhere."
- **Verified current state**: `notification-settings.ts`'s `getOrCreateNotificationSettings()` is called from `production-worker.ts` and its values genuinely drive `WorkerConfig.pollIntervalMs`, `QueueEngine`'s retry knobs (`baseDelaySeconds`/`maxDelaySeconds`/`maxAttempts`/`jitterRatio`), and whether `EMAIL` gets a real `DeliveryManagerChannelAdapter` at all (`emailChannelEnabled`).
- **Correction**: Not an open gap — resolved in Phase 11.
- **Not fully closed, but minor**: `completedRetentionDays`/`deadLetterRetentionDays` are read into the settings object but **nothing purges old rows using them** — see item 8 below, a genuinely distinct, smaller remaining gap.
- **Classification: E — ALREADY COMPLETE for the core config-wiring gap.** (Retention enforcement specifically remains open — see item 8.)

### 7. `DeliveryPolicy` partial enforcement

- **What**: `maxRetries` is read and shapes retry decisions; `timeoutMs`/`rateLimit`/`maxSizeBytes`/`maxRecipients` are validated as shapes but never enforced (no timeout race, no rate limiter, no payload/recipient-count check).
- **Where**: `delivery/delivery-policy.ts`.
- **Why incomplete**: Explicitly "architecture only" by Phase 6's own instruction; never extended since.
- **Correctness/Security**: None at current scale (an internal HR tool, not a high-volume/multi-tenant sender).
- **Production reliability**: Low risk today; would matter if send volume or SMTP response latency ever became a real operational concern.
- **Blocks further phases?**: No.
- **Classification: C — OPTIONAL / FUTURE.**

### 8. No retention/cleanup job for old `NotificationJob`/`NotificationEvent` rows

- **What**: `NotificationSettings.completedRetentionDays`/`deadLetterRetentionDays` are configured (defaults 90/180 days) but nothing ever reads them to purge old rows — confirmed via `grep`, zero matches for any purge/cleanup logic anywhere in the engine.
- **Why incomplete**: Never built in any phase; not explicitly deferred in any report either (a genuine gap between the documented config surface and actual behavior, not previously named this precisely).
- **Correctness/Security**: None.
- **Production reliability**: Low today (a handful of jobs total exist in the live database), but rows will accumulate indefinitely without this.
- **Blocks further phases?**: No.
- **Recommended solution**: A small scheduled cleanup (cron route or `instrumentation.ts`-adjacent job — note: this phase's own rules forbid touching `instrumentation.ts`, so scope this carefully in whichever future phase picks it up) deleting `COMPLETED`/`DEAD_LETTER` jobs older than the configured retention window.
- **Classification: C — OPTIONAL / FUTURE.**

### 9. Four historical `DEAD_LETTER` `LOAN_APPROVED` jobs — operational, not code

- **What**: Live query confirms exactly 4 `LOAN_APPROVED` jobs sitting in `DEAD_LETTER` (`attemptCount: 5` each), all created between 13:28–14:12 on the same day, all *before* the two `SENT` jobs at 14:27 and 14:44 that day. This timing lines up exactly with the SMTP authentication/TLS-mismatch/missing-template investigation earlier in this project's history — these 4 are leftover casualties from that outage window, not an ongoing problem (no `LEAVE_*`/`OVERTIME_*` job raised since Phase 15 has failed).
- **Why incomplete**: Nothing automatically retries or surfaces old dead letters for cleanup (see item 8) — they will sit there forever unless someone acts.
- **Correctness**: These 4 real loan-approval emails were never delivered to their recipients.
- **Security**: None.
- **Production reliability**: A live, current data-integrity gap (not a code defect) — 4 employees never got their loan-approval email.
- **Blocks further phases?**: No.
- **Recommended solution**: This is an **action, not a phase** — use the existing Admin Notification Center (`/admin/notification-center`, built in Phase 12) to inspect these 4 jobs and either click **Requeue** (if the content is still accurate/acceptable to send late) or dismiss them with an out-of-band manual notice to the affected employees, admin's judgment call either way.
- **Classification: B — SHOULD FIX SOON (as a manual action, not code).**

### 10. `LOAN_APPLICATION_PENDING`/`WALLET_REQUEST_PENDING` stubs in `handleNotificationAction`

- **What**: `notification.actions.ts`'s legacy `handleNotificationAction` has two branches that always return a fake `{ success: true }` without calling any real business logic. As of Phase 17 they are properly access-gated (`SUPERADMIN | HR | manager`) but still do nothing real.
- **Where**: `src/actions/notification.actions.ts`'s `handleNotificationAction`.
- **Critical context discovered during this audit**: `handleNotificationAction`'s **only** caller anywhere in the codebase is `src/components/admin/NotificationBell.tsx`, which is itself **imported by zero pages or layouts** — confirmed via a repo-wide import search. This entire code path is currently dead/orphaned UI. Meanwhile, real, independently-authorized, fully-functional loan and wallet approval flows already exist and are actively used elsewhere: `/admin/loans` (`loan.actions.ts`) and `/admin/wallet` (`wallet.actions.ts`).
- **Why incomplete**: Never implemented in any phase; explicitly flagged as a known stub in `BusinessEventsIntegrationReport.md` (Phase 15) and `NotificationActionAuthorizationReport.md` (Phase 17).
- **Correctness**: The stub behavior itself is misleading if ever triggered (claims success without acting) — but see below, currently unreachable via any live UI.
- **Security**: Closed as of Phase 17 (properly access-gated now).
- **Production reliability**: None currently (dead code path).
- **Blocks further phases?**: No.
- **Direct answer to "should these be implemented now"**: **No — they should remain intentionally-unused stubs.** Implementing real logic here would mean either reviving an orphaned, currently-unused UI component to duplicate approval workflows that already exist, work correctly, and are independently authorized elsewhere (`/admin/loans`, `/admin/wallet`) — pure duplication with no product benefit — or building real logic behind a component nobody can currently reach, which is speculative work with no current user. If the product ever wants a unified "approve everything from one inbox" experience, that is a **deliberate product decision requiring its own scope discussion** (which existing flow becomes canonical, whether `AdminNotification` or the newer `NotificationJob`-based Notification Center is the right home for it), not something to build reactively into a dead stub.
- **Secondary recommendation**: Decide, separately, whether to delete `NotificationBell.tsx` (dead code) or actually wire it into a layout — a small, independent cleanup decision, not urgent.
- **Classification: D — INTENTIONALLY OUT OF SCOPE** (remain stubs; do not implement).

### 11. `PROFILE_UPDATE_REQUEST` / `LEAVE_APPLICATION_PENDING` delegation

- **What**: Both branches of `handleNotificationAction` correctly delegate to fully-authorized, working business actions (`profile.actions.ts`, `leave.actions.ts` as of Phase 16).
- **Classification: E — ALREADY COMPLETE, NO ACTION NEEDED.**

### 12. Phase 14 HR routing/access gap

- **What**: `role: "HR"` is authorized at the Server Action layer in an extremely broad set of places across this codebase — `loan.actions.ts`, `wallet.actions.ts`, `medical.actions.ts`, `overtime-request.actions.ts`, `timeline.actions.ts`, `notification-admin.actions.ts`, `notification-preferences-admin.actions.ts`, and (as of Phase 16/17) `leave.actions.ts`/`notification.actions.ts` — yet **zero page routes exist that an HR user can reach**. `(admin)/layout.tsx` redirects anyone who isn't `SUPERADMIN` to `/unauthorized`; there is no `(hr)` route group; `AppSidebar.tsx` only branches on `role === "SUPERADMIN"` vs. everything else.
- **Where**: `src/app/(admin)/layout.tsx:26`; confirmed no HR-specific route group exists anywhere under `src/app/`.
- **Why incomplete**: First surfaced in `AdminPreferenceManagementReport.md` (Phase 14), repeated as an unrelated/unaffected known issue in every phase since — never actually addressed, because every phase since correctly treated it as its own, separately-scoped decision.
- **Correctness**: None — nothing is broken.
- **Security**: None — if anything this is *overly* restrictive (HR is authorized to do less than the code allows, not more).
- **Production reliability/completeness**: This is the one item on this list that genuinely affects whether the application is "production-complete" in a product sense: **the `HR` role is currently non-functional in this application.** An HR user can sign in and reaches only the plain employee experience — every approval/admin capability the codebase has clearly built for HR is unreachable through the UI.
- **Blocks further phases?**: No — but every future phase that adds an HR-authorized action will keep reproducing the same "authorized but unreachable" shape unless this is resolved once, centrally.
- **Recommended solution**: A dedicated routing/access-model decision — either a new `(hr)` route group mirroring `(admin)`'s pages with HR-appropriate scoping, or loosening `(admin)/layout.tsx` to also allow `HR` (simplest, but re-examine whether every `/admin/**` page is actually meant for HR, e.g. `role-management`, `system-control` probably shouldn't be). This is explicitly **not** a Notification Engine change — it's an application-wide role/routing decision that the Notification Engine's phases happened to keep surfacing. Recommend scoping it as its own phase, outside the `docs/notification-engine/` documentation tree (or cross-referenced from it), since it touches every admin page, not just notification-related ones.
- **Own phase or combine?**: Its own phase — too broad (touches the entire `(admin)` route group) to combine with anything notification-specific.
- **Classification: B — SHOULD FIX SOON** (not urgent/blocking, but the HR role being fully non-functional is a real, repeatedly-surfaced product gap worth resolving deliberately rather than continuing to defer).

### 13. Medical claim notification events (`approveMedicalClaim`/`rejectMedicalClaim`)

- **What**: Identified in Phase 15 (`BusinessEventsIntegrationReport.md`) as a safe, clean candidate — deliberately not selected to keep that phase to 4 events.
- **Where**: `src/actions/medical.actions.ts`.
- **Why incomplete**: Deliberately deferred, not a bug.
- **Blocks further phases?**: No.
- **Recommended solution**: Same pattern as Phase 15's leave/overtime events — `raiseEvent` after commit, best-effort, new templates.
- **Classification: C — OPTIONAL / FUTURE**, well-scoped and low-risk whenever wanted.

### 14. Timeline modification notification events (`approveTimelineModificationRequest`/`rejectTimelineModificationRequest`)

- Same status, same file family (`timeline-modification-request.actions.ts`), same recommendation as item 13.
- **Classification: C — OPTIONAL / FUTURE.**

### 15. Wallet request status notification events (`updateWalletRequestStatus`)

- Identified in Phase 15's candidate survey, not selected, not yet integrated. Structurally similar to loan/leave/overtime — a single `updateWalletRequestStatus` function handles both approve and decline via a `status` parameter rather than two separate functions, so wiring this in would need a small amount of extra care (two `eventType`s, one function) compared to the four already-integrated events.
- **Classification: C — OPTIONAL / FUTURE.**

### 16. Payroll notification events (`processPayroll`)

- Mentioned as a theoretical future candidate in earlier reports; structurally more complex (a batch operation affecting many employees at once, not a single approve/reject on one record) — would need its own recipient/payload design, not a drop-in repeat of the Phase 15 pattern.
- **Classification: C — OPTIONAL / FUTURE**, lower priority than items 13–15 due to added design complexity.

### 17. 5 cosmetic Turbopack Edge-runtime build warnings

- **What**: Unchanged since Phase 8 — Node-only code (`node:crypto`, `process.pid`) reachable from `instrumentation.ts`'s Edge-runtime bundle, surfaced as 5 build-time warnings. Build succeeds; runtime behavior is correct in both places.
- **Verified current state**: Same 5 files, same warnings, confirmed in the most recent `pnpm run build` output the user shared after Phase 16.
- **Why incomplete**: The one available fix (`export const runtime = "nodejs"` in `proxy.ts`) was explicitly evaluated and **declined by the user** in an earlier phase (Phase 12/13 era) as out of scope.
- **Correctness/Security/Reliability**: None — purely cosmetic.
- **Classification: D — INTENTIONALLY OUT OF SCOPE** (per prior explicit user decision; revisit only if the user reopens it).

### 18. `api/cron/daily-notifications/route.ts` has no shared-secret/signature check

- **What**: Observed while tracing `checkAndCreateIncrementReminders`'s only caller during the Phase 17 audit — this Route Handler has no authentication of any kind; any request to it (internal or external) triggers the increment-reminder scan.
- **Where**: `src/app/api/cron/daily-notifications/route.ts` (not `notification.actions.ts` — a different file).
- **Why incomplete**: Never addressed in any phase; genuinely outside every phase's stated audit target so far (all scoped to `notification.actions.ts`/business actions, not Route Handlers).
- **Correctness**: Low impact if triggered repeatedly — the underlying check is idempotent per employee per day (a `findFirst` guard).
- **Security**: Minor — unauthenticated triggering of a low-sensitivity batch job, not a data-exposure or privilege issue.
- **Production reliability**: Negligible at this app's scale.
- **Blocks further phases?**: No.
- **Classification: C — OPTIONAL / FUTURE** (a real but low-severity finding; worth a one-line fix — a shared-secret header check, matching whatever pattern the other `/api/cron/*` routes use, if any — whenever cron-route hardening is next touched).

### 19. Legacy `AdminNotification`/`handleNotificationAction` vs. the new `NotificationJob`-based Notification Center — two coexisting systems

- **What**: Not a bug, but worth naming clearly for future maintainers: this codebase now has **two independent things both called "notifications"** — the pre-existing `AdminNotification` model + `notification.actions.ts` (legacy, used by `/admin/notifications` and the orphaned `NotificationBell`), and the new Notification Engine's `NotificationEvent`/`NotificationJob` + `notification-admin.actions.ts`/`notification-preferences*.actions.ts` (used by `/admin/notification-center`). They do not share data, do not share authorization helpers (`canManageAdminNotificationInbox`/`canProcessAdminNotificationAction` vs. `isAdministrator`), and a future developer could easily conflate them.
- **Recommended action**: No code change needed — but worth a short note in `NotificationEngineDesign.md` or a README pointer distinguishing the two, so a future phase doesn't accidentally try to unify or confuse them without a deliberate decision to do so.
- **Classification: C — OPTIONAL / FUTURE** (documentation clarity, not a functional gap).

### 20. Database schema / migrations

- **Verified**: `prisma migrate status` → **"Database schema is up to date!"**, 54 migrations found, none pending. All 5 `NotificationTemplate` rows this project's events depend on (`LOAN_APPROVED`, `LEAVE_APPROVED`, `LEAVE_REJECTED`, `OVERTIME_REQUEST_APPROVED`, `OVERTIME_REQUEST_DECLINED`) exist and are active.
- **Classification: E — ALREADY COMPLETE, NO ACTION NEEDED.**

### 21. Security posture overall (Phases 16/17 fixes)

- **Verified**: `approveLeaveApplication`/`rejectLeaveApplication` (Phase 16), `handleNotificationAction` and the 6 `AdminNotification` CRUD functions (Phase 17) all now independently authorize server-side, never trust client-supplied identity, and were verified against every real live caller with no workflow regression. No new authorization gap was found in the Notification Engine's own code during this audit beyond what's listed above (items 12 and 18, both outside the engine's own core).
- **Classification: E — ALREADY COMPLETE for everything audited in Phases 16/17.**

---

## 1. MUST FIX NOW

**Nothing.** No item found in this audit rises to "must fix before any new feature work" — the engine is correct and safe as of Phase 17. The one item with live, real-world impact right now (item 9, the 4 historical dead-lettered `LOAN_APPROVED` jobs) is a **data/operational action**, not a code defect, and does not block any future development.

## 2. SHOULD FIX NEXT

In rough priority order:

1. **Item 9** — manually requeue or dismiss the 4 historical dead-lettered `LOAN_APPROVED` jobs via the existing Admin Notification Center (no code change — an action for you to take, or ask me to do it via the existing Requeue button).
2. **Items 1 + 2** — a combined "Delivery Observability & Resilience" phase: write `NotificationDeliveryAttempt` rows on every dispatch outcome, and add a timed half-open recovery to `ProviderHealthMonitor` so a single SMTP outage can't silently and permanently stop all email until a redeploy.
3. **Item 12** — the HR routing/access-model decision. Not urgent, but it's the most consequential gap on this list in product terms (the `HR` role is currently non-functional), and it's been deferred across four phases now without a decision either way.

## 3. FUTURE / OPTIONAL

Items 3, 4, 7, 8, 13, 14, 15, 16, 18, 19 — all genuine, well-understood, low-urgency items. None blocks anything; pick them up whenever there's a specific reason to (a second provider, real volume growth, wanting medical/timeline/wallet events, etc.).

## 4. INTENTIONALLY OUT OF SCOPE

- **Item 10** — `LOAN_APPLICATION_PENDING`/`WALLET_REQUEST_PENDING` stubs: explicitly recommended to **remain stubs**, not be implemented (see full reasoning above).
- **Item 17** — the 5 cosmetic Edge-runtime build warnings: per your own prior explicit decision.

## 5. Recommended Phase Order From This Point Onward

1. *(Optional, not a phase — a quick manual action)* Resolve the 4 historical dead-lettered jobs via the Admin Notification Center.
2. **Phase 18 — Delivery Observability & Resilience**: `NotificationDeliveryAttempt` writes + SMTP provider half-open recovery (items 1 + 2). Self-contained, touches only `JobDispatcher`/`ProviderHealthMonitor`, no schema change needed (table already exists).
3. **Phase 19 — HR Routing & Access Model** *(explicitly not a "Notification Engine" phase — app-wide, but worth sequencing here since it keeps surfacing from this project)*: decide and implement how HR reaches the admin capabilities already authorized for them at the action layer.
4. **Phase 20 — Additional Business Events**: medical claims + timeline modification requests (items 13/14), the two cleanest remaining candidates from Phase 15's own survey, using the exact same pattern.
5. Everything else in "Future / Optional" — pick up opportunistically, no forced order.

---

## Direct Answer: Should `LOAN_APPLICATION_PENDING`/`WALLET_REQUEST_PENDING` Be Implemented Now?

**No.** Keep them as intentionally-unused stubs. The only caller of the function containing them (`handleNotificationAction`, via `NotificationBell.tsx`) is dead, unreferenced UI code — implementing real logic here would mean either reviving that dead component to duplicate the fully-working, independently-authorized loan/wallet approval flows that already exist at `/admin/loans` and `/admin/wallet`, or building real logic with no current caller at all. If a unified "approve everything from one admin inbox" experience is ever wanted, that's a deliberate product decision deserving its own scoped phase — not something to grow reactively out of a legacy stub.
