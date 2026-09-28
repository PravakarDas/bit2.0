import type { WorkerLifecycleState } from "./worker-lifecycle-state";
import type { WorkerHealthStatus } from "./worker-health-status";
import type { WorkerHeartbeatSnapshot } from "./worker-heartbeat";

/**
 * Derives the 5-category `WorkerHealthStatus` from the 9-state
 * `WorkerLifecycleState`, plus heartbeat staleness. Pure — takes state in,
 * returns a status out, no I/O, no mutation. See WorkerRuntimeReport.md
 * "Health Monitoring" for the full mapping rationale.
 */
const LIFECYCLE_TO_HEALTH: Record<WorkerLifecycleState, WorkerHealthStatus> = {
  STOPPED: "STOPPED",
  STARTING: "RUNNING",
  IDLE: "IDLE",
  CLAIM_JOB: "RUNNING",
  PROCESSING: "RUNNING",
  COMPLETE: "RUNNING",
  RECOVERING: "RECOVERING",
  PAUSED: "PAUSED",
  STOPPING: "STOPPED",
};

export class WorkerHealthMonitor {
  /**
   * A stale heartbeat while the lifecycle claims to be actively RUNNING is
   * itself evidence of a problem (the loop is stuck, or the process is
   * wedged) — surfaced as RECOVERING rather than trusting the
   * (possibly-stale) lifecycle state at face value. IDLE/PAUSED/STOPPED
   * aren't overridden this way: a long-idle worker with a stale heartbeat
   * because nothing is happening is not unhealthy.
   */
  static resolve(lifecycleState: WorkerLifecycleState, heartbeat: WorkerHeartbeatSnapshot): WorkerHealthStatus {
    const baseStatus = LIFECYCLE_TO_HEALTH[lifecycleState];
    if (baseStatus === "RUNNING" && heartbeat.isStale) {
      return "RECOVERING";
    }
    return baseStatus;
  }
}
