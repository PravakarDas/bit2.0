/**
 * Derives a display title from `NotificationEvent.eventType` without ever
 * rendering a template — e.g. `"LOAN_APPROVED"` -> `"Loan Approved"`. Used
 * for list rows specifically so listing a page of notifications never has
 * to call `TemplateEngine.render()` per row (see
 * NotificationCenterReport.md's "Performance" section).
 */
export function formatEventTypeAsTitle(eventType: string): string {
  return eventType
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
