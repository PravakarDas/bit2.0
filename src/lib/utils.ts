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
