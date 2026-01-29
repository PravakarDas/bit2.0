import { checkAndGenerateToday } from "@/actions/timeline.actions";

const CRON_GLOBAL_FLAG = "__dailyTimelineCronStarted";

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

function startDailyTimelineCron() {
  const globalAny = global as unknown as Record<string, boolean>;
  if (globalAny[CRON_GLOBAL_FLAG]) {
    return;
  }

  globalAny[CRON_GLOBAL_FLAG] = true;

  const timezone = process.env.APP_TIMEZONE;
  let lastRunDate = "";

  const runIfDue = async () => {
    const { year, month, day, hour, minute } = getLocalTimeParts(timezone);
    if (hour !== 0 || minute !== 1) {
      return;
    }

    const todayKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (lastRunDate === todayKey) {
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

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    startDailyTimelineCron();
  }
}
