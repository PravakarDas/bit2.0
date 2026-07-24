/**
 * The 5 externally-reported health categories this phase requests ("Track
 * Running, Paused, Recovering, Idle, Stopped"). Deliberately coarser than
 * `WorkerLifecycleState` (9 states) — a health check is a simplified,
 * derived view for external consumers (a future dashboard, an eventual
 * `/health` route), not the internal state machine itself. See
 * worker-health-monitor.ts for the exact many-to-one mapping.
 */
export const WORKER_HEALTH_STATUSES = ["RUNNING", "PAUSED", "RECOVERING", "IDLE", "STOPPED"] as const;

export type WorkerHealthStatus = (typeof WORKER_HEALTH_STATUSES)[number];
