---
name: attendance-automation
description: Explains bit2.0's attendance pipeline — ZKTeco biometric sync, daily timeline generation, and the leave-automation pipeline that runs as in-process cron jobs from src/instrumentation.ts, configurable via SystemControlSettings. Use when touching timeline, ZKTeco sync, late-checkin penalties, or auto-leave-deduction logic.
---

# bit2.0 — Attendance & Automation Pipeline

## Three cron jobs, one mechanism

All scheduled work runs as **in-process interval loops started from
[src/instrumentation.ts](src/instrumentation.ts)** (Next.js's `register()` hook, guarded by
`NEXT_RUNTIME === "nodejs"`), not `node-cron` (it's a dependency but unused in favor of this
simpler self-scheduling pattern) and not an external scheduler. Each job:

- Reads its enabled flag + target hour/minute from `SystemControlSettings`
  ([src/lib/system-control.ts](src/lib/system-control.ts), singleton row `id: "global"`,
  editable at `/admin/system-control` or `/manager/system-control`), not from env vars
  directly — env vars (`CRON_TIMELINE_HOUR`, etc. in `.env.example`) are only the seed
  defaults used the first time the row is created.
- Runs a `setInterval(runIfDue, 60_000)` tick that compares "now" (converted to
  `appTimezone`, default `Asia/Dhaka`) against the configured target time, and a
  `lastRunDate`/`lastRunFinishedAt` guard so it fires once per day (or once per interval).
- Is safe across dev hot-reload via a `global.__xCronStarted` flag so the loop isn't
  double-registered.

The three jobs, in dependency order:

1. **Daily timeline generation** (`startDailyTimelineCron`) — calls
   `checkAndGenerateToday()` in
   [src/actions/timeline.actions.ts](src/actions/timeline.actions.ts), which creates today's
   `DailyTimeRecord` for every active employee (required check-in/out/break pulled from
   their `Branch`) and backfills any missed days. Default: ~00:01–01:24 local time.
2. **ZKTeco sync** (`startZKTecoSyncCron`) — calls `syncAllEmployeesTimeData()` in
   [src/actions/zkteco-sync.actions.ts](src/actions/zkteco-sync.actions.ts), which pulls
   punch transactions from the ZKTeco Bio Time API
   ([src/lib/services/zkteco.service.ts](src/lib/services/zkteco.service.ts)) and fills in
   `actualCheckIn`/`actualCheckOut`/`actualBreakTime` + computed active/overtime time on
   each employee's `DailyTimeRecord`. Two modes: `DAILY` (once/day at a configured time) or
   `INTERVAL` (every N minutes, gap measured from previous run's *finish* time). Has a
   single-flight lock (`isSyncRunning`) so overlapping ticks never run concurrently, and a
   reachability check (`OPTIONS` request) that skips the run entirely if the ZKTeco base URL
   is down — this is expected/normal when the on-prem biometric server is offline.
3. **Leave automation** (`startLeaveAutomationCron`) — calls
   `runLeaveAutomationPipeline()` in
   [src/actions/leave-automation.actions.ts](src/actions/leave-automation.actions.ts) with
   `{ mode: "UNPROCESSED", skipIfWithinWindow: true, skipToday: true }`. Runs **after** the
   other two so it sees the day's synced attendance data before deciding leave/absence.
   Default ~23:00 local time.

There are also HTTP fallbacks — `src/app/api/cron/generate-timeline/route.ts` and
`src/app/api/cron/daily-notifications/route.ts` — for triggering the same logic from an
external scheduler (useful if the app process restarts frequently or runs in a
serverless-like deployment where in-process timers can't be relied on); they call the same
underlying action functions, so **fix logic in the actions, not in the route handlers**.

## Leave automation decision logic

For each active employee's unprocessed date
(`processEmployeeDailyRecord` in `leave-automation.actions.ts`), the pipeline branches:

- **Weekly off day** (per `Branch.weeklyOffDays`) → `handleWeeklyOffDay`, marks
  `WEEKLY_OFF`, no leave/penalty logic applies.
- **Public holiday** (global or branch-scoped `PublicHoliday`) → treated like a non-workday.
- **Actual check-in present** (synced from ZKTeco) → `handleWorkDay`: computes
  overtime/undertime, and if check-in was late beyond the branch's grace, applies a
  **late check-in penalty** deducted from wallet (see `reconcileLatePenaltyWallet` /
  `[[payroll-finance]]`) — only if `Branch.isLatePenaltyEnabled`.
- **No check-in, employee has leave balance** → `handleAutoLeaveDeduction`: auto-applies an
  approved leave type, decrements `UserLeaveEntitlement.usedDays`, writes an
  `EmployeeNotification` and a `LeaveAuditLog` row explaining the auto-deduction.
- **No check-in, no leave balance** → `handleAbsentWithoutLeave`: marks `ABSENT`, may apply
  an absence penalty.

`isProcessed` on `DailyTimeRecord` marks a date as settled by this pipeline; editing a
timeline record after the fact (via `/admin/timeline` or a `TimelineModificationRequest`)
must reverse and reapply these side effects — see the `reconcile*`/`reverse*`/`apply*`
helper functions at the top of `timeline.actions.ts` before writing new manual-edit logic,
rather than re-deriving the reversal math from scratch.

## When modifying this pipeline

- All three jobs are **idempotent per day** by design (`lastRunDate` guards) — don't add a
  path that can double-apply a leave deduction or penalty on retry.
- Timezone-sensitive: always go through `getLocalTimeParts(appTimezone)` /
  `getBangladeshDateParts` helpers rather than raw `Date` arithmetic, since the deployed
  server may run in UTC while the business operates in `Asia/Dhaka`.
- ZKTeco credentials/URL live in `SystemControlSettings`, editable via the system-control UI
  — never hardcode them; see `[[deployment-infra]]` for the env-var fallback path.
- A manual "sync now" / "generate now" action exists in the admin UI for out-of-band runs
  (`manualSyncEmployee`, admin generate-timeline API route) — prefer wiring new manual-
  trigger UI to these existing functions over adding a parallel code path.
