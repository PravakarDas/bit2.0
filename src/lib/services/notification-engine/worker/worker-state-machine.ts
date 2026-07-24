import type { WorkerLifecycleState } from "./worker-lifecycle-state";

/**
 * The authoritative transition table for `WorkerLifecycleState`, in the
 * exact same spirit as Phase 3's `QueueStateMachine` (pure, stateless,
 * table-driven — no side effects, no I/O).
 *
 *   STOPPED    -> STARTING                                    (start())
 *   STARTING   -> IDLE, STOPPING                               (startup completes; or stop() called mid-startup)
 *   IDLE       -> CLAIM_JOB, PAUSED, STOPPING                   (next tick claims; or pause()/stop())
 *   CLAIM_JOB  -> PROCESSING, IDLE, RECOVERING, STOPPING          (claimed a job; nothing eligible; claim errored; or forced shutdown — see below)
 *   PROCESSING -> COMPLETE, RECOVERING, STOPPING                  (dispatch finished; unexpected error; or forced shutdown)
 *   COMPLETE   -> IDLE                                             (always — one full cycle done)
 *   RECOVERING -> IDLE, STOPPING                                    (recovered; or giving up and shutting down)
 *   PAUSED     -> IDLE, STOPPING                                     (resume(); or stop() while paused)
 *   STOPPING   -> STOPPED                                             (shutdown finished)
 *
 * `CLAIM_JOB -> STOPPING` and `PROCESSING -> STOPPING` exist specifically
 * for Graceful Shutdown's grace-period-exceeded path (item 8): `stop()`
 * always *prefers* to let an in-flight claim/dispatch reach its own natural
 * COMPLETE/RECOVERING first, but if `shutdownGracePeriodMs` elapses first,
 * the runtime forces a transition straight to STOPPING (after cancelling
 * the execution context and releasing the job) rather than waiting
 * indefinitely — see worker-runtime.ts's `stop()`.
 */
const ALLOWED_TRANSITIONS: Record<WorkerLifecycleState, readonly WorkerLifecycleState[]> = {
  STOPPED: ["STARTING"],
  STARTING: ["IDLE", "STOPPING"],
  IDLE: ["CLAIM_JOB", "PAUSED", "STOPPING"],
  CLAIM_JOB: ["PROCESSING", "IDLE", "RECOVERING", "STOPPING"],
  PROCESSING: ["COMPLETE", "RECOVERING", "STOPPING"],
  COMPLETE: ["IDLE"],
  RECOVERING: ["IDLE", "STOPPING"],
  PAUSED: ["IDLE", "STOPPING"],
  STOPPING: ["STOPPED"],
};

/**
 * Unlike `QueueStateMachine`, there is no `isTerminal` here: every worker
 * state, including STOPPED, has at least one outgoing edge (STOPPED ->
 * STARTING, via `restart()`/`start()`) — a worker runtime, unlike a single
 * job, is designed to be started again after stopping, so "terminal" isn't
 * a meaningful concept for it.
 */
export class WorkerStateMachine {
  static canTransition(from: WorkerLifecycleState, to: WorkerLifecycleState): boolean {
    return ALLOWED_TRANSITIONS[from].includes(to);
  }

  static allowedTransitionsFrom(from: WorkerLifecycleState): readonly WorkerLifecycleState[] {
    return ALLOWED_TRANSITIONS[from];
  }
}
