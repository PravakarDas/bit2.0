/**
 * Read-only helpers for displaying/sorting/filtering the "HH:MM" (optionally
 * "-HH:MM") duration strings stored on DailyTimeRecord. Intentionally
 * separate from the private write-path formatters in timeline.actions.ts,
 * which feed wallet-penalty and leave-balance calculations and must not be
 * touched by an unrelated UI read path.
 */

export function parseDurationToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [hoursStr, minutesStr] = unsigned.split(":");
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const total = hours * 60 + minutes;
  return negative ? -total : total;
}

export function formatDurationPill(value: string | null | undefined): string {
  const totalMinutes = parseDurationToMinutes(value);
  if (totalMinutes === null) return "—";
  const negative = totalMinutes < 0;
  const abs = Math.abs(totalMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  const sign = negative ? "-" : "";
  return `${sign}${hours}h:${String(minutes).padStart(2, "0")}m`;
}
