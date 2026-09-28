/**
 * The Worker Runtime's own lifecycle — new territory this phase introduces
 * (no prior phase defined a worker lifecycle; Phase 3 built only the queue
 * side). Matches this phase's given sequence
 * (STOPPED -> STARTING -> IDLE -> CLAIM_JOB -> PROCESSING -> COMPLETE ->
 * IDLE -> STOPPING -> STOPPED) exactly as the *repeating happy-path cycle*
 * (IDLE <-> CLAIM_JOB <-> PROCESSING <-> COMPLETE loops many times per
 * runtime lifetime; STARTING/STOPPING/STOPPED bookend one run), plus two
 * states the given sequence doesn't show but the required public API
 * (`pause()`/`resume()`) and health tracking ("Paused", "Recovering") make
 * necessary: `PAUSED` and `RECOVERING`. See worker-state-machine.ts for the
 * full transition table and WorkerRuntimeReport.md's "Worker Lifecycle"
 * section for the reasoning.
 */
export const WORKER_LIFECYCLE_STATES = [
  "STOPPED",
  "STARTING",
  "IDLE",
  "CLAIM_JOB",
  "PROCESSING",
  "COMPLETE",
  "RECOVERING",
  "PAUSED",
  "STOPPING",
] as const;

export type WorkerLifecycleState = (typeof WORKER_LIFECYCLE_STATES)[number];
