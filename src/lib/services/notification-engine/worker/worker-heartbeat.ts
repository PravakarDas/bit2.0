import { SystemClock, type IClock } from "../utils";

export interface WorkerHeartbeatSnapshot {
  beatCount: number;
  lastBeatAt: Date | null;
  startedAt: Date;
  /** `lastBeatAt` is more than `staleAfterMs` old — a signal something has stopped ticking without crashing outright. */
  isStale: boolean;
}

/**
 * In-memory only — no new Prisma model, no persistence (this phase makes no
 * schema change, per "architecture is frozen"). `WorkerRuntime` calls
 * `beat()` once per tick; `heartbeat()` on the public API reads a snapshot
 * via `getSnapshot()`. A future phase that wants heartbeats visible
 * cross-process (e.g. a dashboard, or multi-worker coordination) would need
 * to add a table for that — explicitly out of scope here, see
 * WorkerRuntimeReport.md's "Intentionally Postponed".
 */
export class WorkerHeartbeat {
  private beatCount = 0;
  private lastBeatAt: Date | null = null;
  private readonly startedAt: Date;

  constructor(
    private readonly staleAfterMs: number,
    private readonly clock: IClock = new SystemClock()
  ) {
    this.startedAt = this.clock.now();
  }

  beat(): void {
    this.beatCount += 1;
    this.lastBeatAt = this.clock.now();
  }

  getSnapshot(): WorkerHeartbeatSnapshot {
    const now = this.clock.now();
    const isStale = this.lastBeatAt === null ? false : now.getTime() - this.lastBeatAt.getTime() > this.staleAfterMs;
    return {
      beatCount: this.beatCount,
      lastBeatAt: this.lastBeatAt,
      startedAt: this.startedAt,
      isStale,
    };
  }
}
