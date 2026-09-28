import { NOTIFICATION_ENGINE_DEFAULTS } from "../constants";

export interface WorkerConfig {
  /** Opaque worker identity, used as `NotificationJob.lockedBy`. Caller-supplied (or defaulted below) — this phase does not invent a distributed-identity scheme. */
  workerId: string;
  /** How often the runtime ticks (claims-or-waits) when IDLE. */
  pollIntervalMs: number;
  /** Lease window `recoverExpiredLocks` uses; also determines lease-renewal cadence (see below). */
  leaseDurationMs: number;
  /** How often a PROCESSING job's lease is renewed — must be well under `leaseDurationMs` or the lease could expire before the next renewal fires. */
  leaseRenewalIntervalMs: number;
  /** Heartbeat is considered stale after this long without a `beat()` — see WorkerHealthMonitor. */
  heartbeatStaleAfterMs: number;
  /** Consecutive CLAIM_JOB/PROCESSING errors before the runtime gives up and stops itself, rather than looping on RECOVERING forever. */
  maxConsecutiveErrors: number;
  /** How long `stop()` waits for an in-flight job to finish before forcing a shutdown anyway. */
  shutdownGracePeriodMs: number;
}

const DEFAULT_LEASE_DURATION_MS = NOTIFICATION_ENGINE_DEFAULTS.queue.defaultLeaseDurationMs;

export const DEFAULT_WORKER_CONFIG: Omit<WorkerConfig, "workerId"> = Object.freeze({
  pollIntervalMs: NOTIFICATION_ENGINE_DEFAULTS.worker.pollIntervalSeconds * 1000,
  leaseDurationMs: DEFAULT_LEASE_DURATION_MS,
  leaseRenewalIntervalMs: Math.floor(DEFAULT_LEASE_DURATION_MS / 2),
  heartbeatStaleAfterMs: NOTIFICATION_ENGINE_DEFAULTS.worker.pollIntervalSeconds * 1000 * 5,
  maxConsecutiveErrors: 5,
  shutdownGracePeriodMs: 30_000,
});

export function resolveWorkerConfig(partial: Partial<WorkerConfig> & { workerId: string }): WorkerConfig {
  return { ...DEFAULT_WORKER_CONFIG, ...partial };
}
