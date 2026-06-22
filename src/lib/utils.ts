import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return `৳${amount.toLocaleString("en-BD")}`;
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "Not provided";

  const value = typeof date === "string" ? new Date(date) : date;

  return format(value, "PPP");
}

/**
 * Format a clock time as 12-hour with AM/PM, e.g. "2:30 PM".
 * For real clock timestamps only — NOT for duration strings (active time, OT/UT, break).
 */
export function formatTime12(date: Date | string | null | undefined): string {
  if (!date) return "--";
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return "--";
  return format(value, "h:mm a");
}

/**
 * Format a date together with a 12-hour clock time, e.g. "Jun 11, 2026, 2:30 PM".
 */
export function formatDateTime12(date: Date | string | null | undefined): string {
  if (!date) return "--";
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return "--";
  return format(value, "MMM d, yyyy, h:mm a");
}

/**
 * Parse a date string or Date object to a proper Date object at midnight local time
 * Handles YYYY-MM-DD format from HTML date inputs
 */
export function parseFilterDate(date?: string | Date): Date | undefined {
  if (!date) return undefined;

  let dateObj: Date;
  
  if (typeof date === "string") {
    // For YYYY-MM-DD format from HTML date input, create local midnight date
    const parts = date.split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
      const day = parseInt(parts[2], 10);
      dateObj = new Date(year, month, day);
    } else {
      dateObj = new Date(date);
    }
  } else {
    dateObj = new Date(date);
  }

  if (Number.isNaN(dateObj.getTime())) {
    return undefined;
  }

  return dateObj;
}

/**
 * Get the end of day (23:59:59.999) for a given date
 * Used for inclusive date range filtering
 */
export function getEndOfDay(date: Date): Date {
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay;
}

/**
 * Build a date range filter for Prisma queries
 * Ensures inclusive filtering for the entire day(s) specified
 */
export function buildDateRangeFilter(
  startDate?: string | Date,
  endDate?: string | Date
): { gte?: Date; lte?: Date } | undefined {
  const filter: { gte?: Date; lte?: Date } = {};

  const start = parseFilterDate(startDate);
  if (start) {
    filter.gte = start;
  }

  const end = parseFilterDate(endDate);
  if (end) {
    filter.lte = getEndOfDay(end);
  }

  return Object.keys(filter).length > 0 ? filter : undefined;
}
