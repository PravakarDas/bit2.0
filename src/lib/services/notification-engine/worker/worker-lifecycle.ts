import { QueueError } from "../errors";
import { WorkerStateMachine } from "./worker-state-machine";
import type { WorkerLifecycleState } from "./worker-lifecycle-state";

export interface WorkerLifecycleTransitionRecord {
  from: WorkerLifecycleState;
  to: WorkerLifecycleState;
  at: Date;
}

/**
 * Stateful tracker for one `WorkerRuntime`'s current lifecycle state — the
 * mutable counterpart to the pure, stateless `WorkerStateMachine`. Every
 * mutation goes through `transition()`, which validates against
 * `WorkerStateMachine` before applying anything, so the runtime can never
 * observe (or cause) an invalid state change. Keeps a short transition
 * history (bounded) for diagnostics.
 */
export class WorkerLifecycle {
  private currentState: WorkerLifecycleState = "STOPPED";
  private lastTransitionAt: Date = new Date();
  private readonly history: WorkerLifecycleTransitionRecord[] = [];
  private static readonly MAX_HISTORY = 50;

  get state(): WorkerLifecycleState {
    return this.currentState;
  }

  get since(): Date {
    return this.lastTransitionAt;
  }

  /** Throws `QueueError` (reused — this is still a "queue-adjacent" runtime concern, not a new error class this phase needs) if the transition isn't allowed. */
  transition(to: WorkerLifecycleState, now: Date = new Date()): void {
    if (!WorkerStateMachine.canTransition(this.currentState, to)) {
      throw new QueueError(
        `Invalid worker lifecycle transition: ${this.currentState} -> ${to}. Allowed: ${WorkerStateMachine.allowedTransitionsFrom(this.currentState).join(", ") || "(none)"}.`
      );
    }
    this.history.push({ from: this.currentState, to, at: now });
    if (this.history.length > WorkerLifecycle.MAX_HISTORY) {
      this.history.shift();
    }
    this.currentState = to;
    this.lastTransitionAt = now;
  }

  /** Non-throwing check — for call sites that want to branch on eligibility rather than catch. */
  canTransition(to: WorkerLifecycleState): boolean {
    return WorkerStateMachine.canTransition(this.currentState, to);
  }

  getHistory(): readonly WorkerLifecycleTransitionRecord[] {
    return this.history;
  }
}
