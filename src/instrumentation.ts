import { checkAndGenerateToday } from "@/actions/timeline.actions";
import { syncAllEmployeesTimeData } from "@/actions/zkteco-sync.actions";
import { runLeaveAutomationPipeline } from "@/actions/leave-automation.actions";
import { getRuntimeSystemControlConfig } from "@/lib/system-control";
import { processNewZktAttendanceRows, reconcileUnprocessedDailyTimeRecords } from "@/lib/services/zkt-attendance-poller.service";

const CRON_GLOBAL_FLAG = "__dailyTimelineCronStarted";
const ZKTECO_CRON_GLOBAL_FLAG = "__zkTecoSyncCronStarted";
const LEAVE_AUTOMATION_CRON_GLOBAL_FLAG = "__leaveAutomationCronStarted";
const NOTIFICATION_WORKER_GLOBAL_FLAG = "__notificationWorkerStarted";
const ZKT_ATTENDANCE_POLL_GLOBAL_FLAG = "__zktAttendancePollStarted";

function getLocalTimeParts(timeZone?: string) {
  if (!timeZone) {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      hour: now.getHours(),
      minute: now.getMinutes(),
    };
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  const lookup = (type: string) => Number(parts.find(p => p.type === type)?.value || 0);

  return {
    year: lookup("year"),
    month: lookup("month"),
    day: lookup("day"),
    hour: lookup("hour"),
    minute: lookup("minute"),
  };
}

function getValidTime(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
}

function shouldRunForToday(
  now: { year: number; month: number; day: number; hour: number; minute: number },
  targetHour: number,
  targetMinute: number,
  lastRunDate: string
) {
  const nowMinutes = now.hour * 60 + now.minute;
  const targetMinutes = targetHour * 60 + targetMinute;
  const todayKey = `${now.year}-${String(now.month).padStart(2, "0")}-${String(now.day).padStart(2, "0")}`;

  if (lastRunDate === todayKey) {
    return { shouldRun: false, todayKey };
  }

  if (nowMinutes < targetMinutes) {
    return { shouldRun: false, todayKey };
  }

  return { shouldRun: true, todayKey };
}

async function isZKTecoBaseUrlReachable(baseUrl: string): Promise<boolean> {
  const trimmedBaseUrl = baseUrl.trim();
  if (!trimmedBaseUrl) {
    return false;
  }

  const normalizedBaseUrl = trimmedBaseUrl.endsWith("/")
    ? trimmedBaseUrl.slice(0, -1)
    : trimmedBaseUrl;
  const healthCheckUrl = `${normalizedBaseUrl}/api-token-auth/`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(healthCheckUrl, {
      method: "OPTIONS",
      signal: controller.signal,
      cache: "no-store",
    });

    // Any non-5xx response confirms the endpoint is reachable.
    return response.status < 500;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn(`ZKTeco availability check timed out after 8s: ${healthCheckUrl}`);
      return false;
    }

    console.warn(`ZKTeco availability check failed for ${healthCheckUrl}:`, error);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function startDailyTimelineCron() {
  const globalAny = global as unknown as Record<string, boolean>;
  if (globalAny[CRON_GLOBAL_FLAG]) {
    return;
  }

  globalAny[CRON_GLOBAL_FLAG] = true;

  let lastRunDate = "";

  const runIfDue = async () => {
    let runtime: Awaited<ReturnType<typeof getRuntimeSystemControlConfig>>;
    try {
      runtime = await getRuntimeSystemControlConfig();
    } catch (error) {
      // A DB blip here must never escape this tick: setInterval never awaits/catches its
      // callback's returned promise, so an uncaught rejection would be an unhandled
      // rejection at the process level — which crashes the whole server (Node's default
      // since v15), taking the web server down with it, not just this cron. Skip this tick
      // and retry on the next one instead.
      console.error("Daily timeline cron: failed to read system control settings, skipping this tick:", error);
      return;
    }
    if (!runtime.timelineCronEnabled) {
      return;
    }

    const timezone = runtime.appTimezone;
    const targetHour = getValidTime(String(runtime.timelineCronHour), 0, 0, 23);
    const targetMinute = getValidTime(String(runtime.timelineCronMinute), 1, 0, 59);
    const localNow = getLocalTimeParts(timezone);
    const { shouldRun, todayKey } = shouldRunForToday(localNow, targetHour, targetMinute, lastRunDate);
    if (!shouldRun) {
      return;
    }

    lastRunDate = todayKey;
    try {
      await checkAndGenerateToday();
    } catch (error) {
      console.error("Daily timeline cron failed:", error);
    }
  };

  runIfDue();
  setInterval(runIfDue, 60_000);
}

function startZKTecoSyncCron() {
  const globalAny = global as unknown as Record<string, boolean>;
  if (globalAny[ZKTECO_CRON_GLOBAL_FLAG]) {
    return;
  }

  globalAny[ZKTECO_CRON_GLOBAL_FLAG] = true;

  // DAILY mode: ensures the job only fires once per calendar day.
  let lastRunDate = "";
  // INTERVAL mode: epoch ms when the previous sync finished (gap is measured from finish).
  let lastRunFinishedAt = 0;
  // Single-flight lock shared by both modes so two runs never overlap. A new tick that
  // fires while a sync is still running is skipped; the next eligible tick picks it up.
  let isSyncRunning = false;
  // Logs the "skipped, DB-table method is active" notice once per state, not every tick.
  let hasLoggedDbTableModeSkip = false;

  // Runs the actual sync once, guarded by the no-overlap lock and the base-URL health check.
  // Returns true if the sync was attempted (so callers can mark progress), false if skipped.
  const runSyncOnce = async (zkTecoBaseUrl: string): Promise<boolean> => {
    if (isSyncRunning) {
      return false;
    }

    const isBaseUrlUp = await isZKTecoBaseUrlReachable(zkTecoBaseUrl);
    if (!isBaseUrlUp) {
      console.warn(`Skipping ZKTeco sync cron: base URL is down or unreachable (${zkTecoBaseUrl})`);
      return false;
    }

    isSyncRunning = true;
    try {
      console.log("Starting ZKTeco sync cron job...");
      const result = await syncAllEmployeesTimeData(); // Sync all pending missing dates for every employee
      console.log("ZKTeco sync cron completed:", result.message);
      if (result.errors.length > 0) {
        console.warn("ZKTeco sync cron errors:", result.errors);
      }
    } catch (error) {
      console.error("ZKTeco sync cron failed:", error);
    } finally {
      isSyncRunning = false;
      lastRunFinishedAt = Date.now();
    }

    return true;
  };

  const runIfDue = async () => {
    // Never start a second pass while one is in flight (sync may outlast the 60s tick).
    if (isSyncRunning) {
      return;
    }

    let runtime: Awaited<ReturnType<typeof getRuntimeSystemControlConfig>>;
    try {
      runtime = await getRuntimeSystemControlConfig();
    } catch (error) {
      // See startDailyTimelineCron's identical guard for why this must never be unguarded.
      console.error("ZKTeco sync cron: failed to read system control settings, skipping this tick:", error);
      return;
    }
    if (!runtime.zktecoCronEnabled) {
      return;
    }

    // The two attendance-source settings are independent toggles today (zktecoCronEnabled
    // here vs. attendanceCalculationMethod for the ZKT_ATTENDANCE_TABLE poller below), but
    // they are meant to be mutually exclusive in practice: once an org has switched to the
    // DB-table method, the live API is no longer the source of truth for anything, and this
    // cron's own reachability probe (isZKTecoBaseUrlReachable) was still firing against it
    // regardless — producing the EHOSTUNREACH warnings for a device that's deliberately no
    // longer relied on. This is the only place that probe is called from, so skipping it here
    // when the DB-table method is active removes the unnecessary network dependency entirely,
    // without touching the legacy sync path itself for orgs that still use it as their
    // attendance source.
    if (runtime.attendanceCalculationMethod === "ZKT_ATTENDANCE_TABLE") {
      if (!hasLoggedDbTableModeSkip) {
        console.log(
          "ZKTeco sync cron: attendanceCalculationMethod is ZKT_ATTENDANCE_TABLE — database attendance data is authoritative, skipping the live API reachability check and sync."
        );
        hasLoggedDbTableModeSkip = true;
      }
      return;
    }
    hasLoggedDbTableModeSkip = false;

    const zkTecoBaseUrl = runtime.zktecoBaseUrl;
    const mode = runtime.zktecoCronMode === "INTERVAL" ? "INTERVAL" : "DAILY";

    if (mode === "INTERVAL") {
      // Gap measured from the end of the previous run: wait N minutes after it finished.
      const intervalMinutes = getValidTime(String(runtime.zktecoIntervalMinutes), 15, 1, 1440);
      const intervalMs = intervalMinutes * 60_000;
      const elapsed = Date.now() - lastRunFinishedAt;
      // lastRunFinishedAt === 0 means we have never run yet → run immediately on startup.
      if (lastRunFinishedAt !== 0 && elapsed < intervalMs) {
        return;
      }

      await runSyncOnce(zkTecoBaseUrl);
      return;
    }

    // DAILY mode: fire once per day at/after the configured hour:minute.
    const timezone = runtime.appTimezone;
    const targetHour = getValidTime(String(runtime.zktecoCronHour), 11, 0, 23);
    const targetMinute = getValidTime(String(runtime.zktecoCronMinute), 0, 0, 59);
    const localNow = getLocalTimeParts(timezone);
    const { shouldRun, todayKey } = shouldRunForToday(localNow, targetHour, targetMinute, lastRunDate);
    if (!shouldRun) {
      return;
    }

    // Mark the day before awaiting so a long sync can't trigger a duplicate same-day run.
    lastRunDate = todayKey;
    await runSyncOnce(zkTecoBaseUrl);
  };

  runIfDue();
  setInterval(runIfDue, 60_000);
}

function startLeaveAutomationCron() {
  const globalAny = global as unknown as Record<string, boolean>;
  if (globalAny[LEAVE_AUTOMATION_CRON_GLOBAL_FLAG]) {
    return;
  }

  globalAny[LEAVE_AUTOMATION_CRON_GLOBAL_FLAG] = true;

  let lastRunDate = "";

    const runIfDue = async () => {
    let runtime: Awaited<ReturnType<typeof getRuntimeSystemControlConfig>>;
    try {
      runtime = await getRuntimeSystemControlConfig();
    } catch (error) {
      // See startDailyTimelineCron's identical guard for why this must never be unguarded.
      console.error("Leave automation cron: failed to read system control settings, skipping this tick:", error);
      return;
    }
    if (!runtime.leaveAutomationCronEnabled) {
      return;
    }

    const timezone = runtime.appTimezone;
    const targetHour = getValidTime(String(runtime.leaveAutomationCronHour), 23, 0, 23);
    const targetMinute = getValidTime(String(runtime.leaveAutomationCronMinute), 0, 0, 59);
    const localNow = getLocalTimeParts(timezone);
    const { shouldRun, todayKey } = shouldRunForToday(localNow, targetHour, targetMinute, lastRunDate);
    if (!shouldRun) {
      return;
    }

    lastRunDate = todayKey;
    try {
        console.log("Starting leave automation cron job...");
        const result = await runLeaveAutomationPipeline({ mode: "UNPROCESSED", skipIfWithinWindow: true, skipToday: true, now: new Date() });
      if (!result.success) {
          console.warn("Leave automation cron skipped:", result.sync.message || "Sync failed before automation");
        return;
      }
        console.log("Leave automation cron completed:", result);
    } catch (error) {
      console.error("Leave automation cron failed:", error);
    }
  };

  runIfDue();
  setInterval(runIfDue, 60_000);
}

// Notification Engine (Phase 11): same in-process-loop + idempotency-guard
// convention as the three crons above — the established, only mechanism
// this project uses to start a long-running background loop from
// application boot (see ProductionWorkerReport.md's "Startup Strategy" for
// why this, not a separate process/service, was chosen). Unlike the crons,
// this doesn't poll "is it due yet" on a shared 60s tick — WorkerRuntime
// owns its own poll loop once started (see worker-runtime.ts); this
// function's only job is the one-time, guarded `.start()` call.
//
// `production-worker.ts` is imported dynamically, not statically at the top
// of this file, deliberately: `instrumentation.ts`'s `register()` is bundled
// by Next.js for BOTH the Node.js and Edge runtimes, and this function is
// only ever called from inside the `NEXT_RUNTIME === "nodejs"` guard below —
// but a static top-level import would still make Turbopack bundle (and, for
// `container.ts`'s module-level `randomUUID()` call, potentially evaluate)
// the whole node:crypto-touching chain for the Edge runtime too, which
// caused build warnings and could throw if that Edge bundle were ever
// actually loaded. A dynamic import is only ever reached from code that has
// already confirmed it's running under Node.js.
function startNotificationWorker() {
  const globalAny = global as unknown as Record<string, boolean>;
  if (globalAny[NOTIFICATION_WORKER_GLOBAL_FLAG]) {
    return;
  }
  globalAny[NOTIFICATION_WORKER_GLOBAL_FLAG] = true;

  import("@/lib/services/notification-engine/production-worker")
    .then(({ startProductionNotificationWorker }) => startProductionNotificationWorker())
    .catch((error) => {
      console.error("Failed to start Notification Engine worker:", error);
    });
}

/**
 * Continuous ingestion from `public.zkt_attendance` (the "Local DB Table"
 * attendance calculation method — see zkt-attendance-poller.service.ts).
 * Active only when `attendanceCalculationMethod === "ZKT_ATTENDANCE_TABLE"`
 * and `zktAttendancePollEnabled`; otherwise every tick is a no-op, so the
 * existing "ZKTECO_API" method (default) is completely unaffected. Ticks
 * every 5s (fast enough that the admin-configurable
 * `zktAttendancePollIntervalSeconds` — which can be as low as a few
 * seconds — is honored promptly) but only actually runs once that many
 * seconds have elapsed since the previous run finished, same gap-measured-
 * from-finish pattern as the ZKTeco INTERVAL cron above.
 *
 * Each due run does two things, on the same admin-configured interval:
 *  1. `processNewZktAttendanceRows` — cursor-based, only rows newer than
 *     what's already been seen.
 *  2. `reconcileUnprocessedDailyTimeRecords` — a broader sweep of every
 *     still-unprocessed day (missing data, or flagged `hasOpenBreak`), so a
 *     day whose punches arrived out of order, or whose anomaly later
 *     resolves, gets picked up without needing a server restart.
 */
function startZktAttendancePollCron() {
  const globalAny = global as unknown as Record<string, boolean>;
  if (globalAny[ZKT_ATTENDANCE_POLL_GLOBAL_FLAG]) {
    return;
  }
  globalAny[ZKT_ATTENDANCE_POLL_GLOBAL_FLAG] = true;

  let lastRunFinishedAt = 0;
  let isPolling = false;

  const runIfDue = async () => {
    if (isPolling) {
      return;
    }

    let runtime: Awaited<ReturnType<typeof getRuntimeSystemControlConfig>>;
    try {
      runtime = await getRuntimeSystemControlConfig();
    } catch (error) {
      // See startDailyTimelineCron's identical guard for why this must never be unguarded.
      // This one ticks every 5s, so an unguarded DB blip here is the most likely of the four
      // to actually fire during a real outage.
      console.error("zkt_attendance poll: failed to read system control settings, skipping this tick:", error);
      return;
    }
    if (runtime.attendanceCalculationMethod !== "ZKT_ATTENDANCE_TABLE" || !runtime.zktAttendancePollEnabled) {
      return;
    }

    const intervalSeconds = getValidTime(String(runtime.zktAttendancePollIntervalSeconds), 30, 1, 3600);
    const elapsed = Date.now() - lastRunFinishedAt;
    if (lastRunFinishedAt !== 0 && elapsed < intervalSeconds * 1000) {
      return;
    }

    isPolling = true;
    try {
      const result = await processNewZktAttendanceRows();
      if (result.processedDays > 0) {
        console.log("zkt_attendance poll:", result);
      }

      const reconcileResult = await reconcileUnprocessedDailyTimeRecords();
      if (reconcileResult.updated > 0) {
        console.log("zkt_attendance periodic reconciliation:", reconcileResult);
      }
    } catch (error) {
      console.error("zkt_attendance poll failed:", error);
    } finally {
      isPolling = false;
      lastRunFinishedAt = Date.now();
    }
  };

  runIfDue();
  setInterval(runIfDue, 5_000);
}

/**
 * One-time-at-boot reconciliation for the "Local DB Table" method — see
 * `reconcileUnprocessedDailyTimeRecords`'s own doc comment. Only runs when
 * that method is currently selected; a no-op (and no error) otherwise. Runs
 * regardless of `zktAttendancePollEnabled` (unlike the periodic version
 * folded into `startZktAttendancePollCron`'s tick), so switching to this
 * method gets an immediate catch-up sweep even before polling is turned on.
 */
async function runZktAttendanceStartupReconciliation() {
  try {
    const runtime = await getRuntimeSystemControlConfig();
    if (runtime.attendanceCalculationMethod !== "ZKT_ATTENDANCE_TABLE") {
      return;
    }

    console.log("Running zkt_attendance startup reconciliation...");
    const result = await reconcileUnprocessedDailyTimeRecords();
    console.log("zkt_attendance startup reconciliation completed:", result);
  } catch (error) {
    console.error("zkt_attendance startup reconciliation failed:", error);
  }
}

/**
 * Last-resort safety net. This process serves HTTP traffic AND runs five in-process
 * background loops (the crons above, the notification worker) for the lifetime of the
 * container — there is no separate worker process. Every loop above is now audited to
 * catch its own errors per tick, but Node's default behavior for anything that still slips
 * through as an unhandled promise rejection is to terminate the entire process (since
 * Node 15) — which would kill the web server too, over a background job's transient
 * failure (e.g. a DB blip). Log instead of crashing, so one bad tick degrades that one
 * feature, not the whole site. `uncaughtException` is also logged rather than left to
 * Node's default (which is likewise to crash): Node's own docs warn that resuming after
 * one risks continuing with corrupted state, but for a bug we don't yet know the shape of,
 * an unexpected restart-under-load (this exact incident, repeated) is the worse default for
 * a site with real users — this handler exists to surface the error loudly in logs, not to
 * paper over it; any crash it logs should still be treated as a bug to fix.
 */
function installProcessSafetyNet() {
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled promise rejection (process kept alive):", reason);
  });
  process.on("uncaughtException", (error) => {
    console.error("Uncaught exception (process kept alive):", error);
  });
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    installProcessSafetyNet();
    startDailyTimelineCron();
    startZKTecoSyncCron();
    startLeaveAutomationCron();
    startNotificationWorker();
    startZktAttendancePollCron();
    void runZktAttendanceStartupReconciliation();
  }
}
