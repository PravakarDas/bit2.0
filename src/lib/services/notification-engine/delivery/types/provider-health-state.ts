import { NotificationProviderHealthStatus } from "../../types/enums";

/**
 * The 5 health categories this phase requests (Healthy, Degraded, Offline,
 * Maintenance, Unknown) — deliberately richer than the 3-value
 * `NotificationProviderHealthStatus` Prisma enum (HEALTHY/DEGRADED/DOWN,
 * see prisma/schema.prisma). The DB enum is frozen (Phase 1, no schema
 * changes this phase), so this module defines its own in-memory-only
 * runtime state instead of altering it — the same "don't touch the frozen
 * schema, model the richer concept at the application layer" choice this
 * engine has made before (e.g. Phase 5's `TemplateLocaleKey` encoding).
 *
 * `MAINTENANCE` and `UNKNOWN` have no DB equivalent at all (a provider can
 * be manually taken offline for maintenance, or simply never have been
 * tried yet) — seeToDbHealthStatus()/fromDbHealthStatus() for the lossy
 * mapping used only when a caller needs to persist a value into the
 * existing 3-value column.
 */
export const PROVIDER_HEALTH_STATES = ["HEALTHY", "DEGRADED", "OFFLINE", "MAINTENANCE", "UNKNOWN"] as const;

export type ProviderHealthState = (typeof PROVIDER_HEALTH_STATES)[number];

/** HEALTHY/DEGRADED/UNKNOWN may still be routed to; OFFLINE/MAINTENANCE may not. */
export function isProviderHealthUsable(state: ProviderHealthState): boolean {
  return state === "HEALTHY" || state === "DEGRADED" || state === "UNKNOWN";
}

/**
 * Lossy by necessity: MAINTENANCE and UNKNOWN both fold to DOWN and HEALTHY
 * respectively, since the DB column has no room for them. Only meaningful if
 * a future phase persists runtime health back onto `NotificationProvider`.
 */
export function toDbHealthStatus(state: ProviderHealthState): NotificationProviderHealthStatus {
  switch (state) {
    case "HEALTHY":
    case "UNKNOWN":
      return NotificationProviderHealthStatus.HEALTHY;
    case "DEGRADED":
      return NotificationProviderHealthStatus.DEGRADED;
    case "OFFLINE":
    case "MAINTENANCE":
      return NotificationProviderHealthStatus.DOWN;
  }
}

export function fromDbHealthStatus(status: NotificationProviderHealthStatus): ProviderHealthState {
  switch (status) {
    case NotificationProviderHealthStatus.HEALTHY:
      return "HEALTHY";
    case NotificationProviderHealthStatus.DEGRADED:
      return "DEGRADED";
    case NotificationProviderHealthStatus.DOWN:
      return "OFFLINE";
  }
}
