import { checkAndGenerateToday } from "@/actions/timeline.actions";
import { syncAllEmployeesTimeData } from "@/actions/zkteco-sync.actions";
import { runLeaveAutomationPipeline } from "@/actions/leave-automation.actions";
import { getRuntimeSystemControlConfig } from "@/lib/system-control";

const CRON_GLOBAL_FLAG = "__dailyTimelineCronStarted";
const ZKTECO_CRON_GLOBAL_FLAG = "__zkTecoSyncCronStarted";
const LEAVE_AUTOMATION_CRON_GLOBAL_FLAG = "__leaveAutomationCronStarted";

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
    const runtime = await getRuntimeSystemControlConfig();
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

  let lastRunDate = "";

  const runIfDue = async () => {
    const runtime = await getRuntimeSystemControlConfig();
    if (!runtime.zktecoCronEnabled) {
      return;
    }

    const timezone = runtime.appTimezone;
    const zkTecoBaseUrl = runtime.zktecoBaseUrl;
    const targetHour = getValidTime(String(runtime.zktecoCronHour), 11, 0, 23);
    const targetMinute = getValidTime(String(runtime.zktecoCronMinute), 0, 0, 59);
    const localNow = getLocalTimeParts(timezone);
    const { shouldRun, todayKey } = shouldRunForToday(localNow, targetHour, targetMinute, lastRunDate);
    if (!shouldRun) {
      return;
    }

    try {
      const isBaseUrlUp = await isZKTecoBaseUrlReachable(zkTecoBaseUrl);
      if (!isBaseUrlUp) {
        console.warn(`Skipping ZKTeco sync cron: base URL is down or unreachable (${zkTecoBaseUrl})`);
        return;
      }

      lastRunDate = todayKey;
      console.log("Starting ZKTeco sync cron job...");
      const result = await syncAllEmployeesTimeData(); // Sync all pending missing dates for every employee
      console.log("ZKTeco sync cron completed:", result.message);
      if (result.errors.length > 0) {
        console.warn("ZKTeco sync cron errors:", result.errors);
      }
    } catch (error) {
      console.error("ZKTeco sync cron failed:", error);
    }
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
    const runtime = await getRuntimeSystemControlConfig();
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

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    startDailyTimelineCron();
    startZKTecoSyncCron();
    startLeaveAutomationCron();
  }
}
