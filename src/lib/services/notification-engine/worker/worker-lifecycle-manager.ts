import type { IQueueEngine } from "../queue";
import { NoopLogger, type IQueueLogger } from "../queue/logger.interface";
import type { WorkerRuntime } from "./worker-runtime";
import type { WorkerHealthStatus } from "./worker-health-status";
import type { WorkerHeartbeatSnapshot } from "./worker-heartbeat";
import type { WorkerMetricsSnapshot } from "./worker-metrics";
import type { WorkerLifecycleState } from "./worker-lifecycle-state";

export interface WorkerLifecycleManagerOptions {
  runtime: WorkerRuntime;
  /** Only `recoverExpiredLocks` is needed — narrowed via `Pick`, not the full `IQueueEngine`, per Interface Segregation. */
  queueEngine: Pick<IQueueEngine, "recoverExpiredLocks">;
  /** The lease window `recoverExpiredLocks` reclaims against — should match the runtime's own `WorkerConfig.leaseDurationMs`. */
  leaseDurationMs: number;
  /** How often the ongoing (post-startup) lease-recovery sweep runs. */
  reaperIntervalMs: number;
  logger?: IQueueLogger;
}

export interface WorkerLifecycleSnapshot {
  isStarted: boolean;
  lifecycleState: WorkerLifecycleState;
  health: WorkerHealthStatus;
  heartbeat: WorkerHeartbeatSnapshot;
  metrics: WorkerMetricsSnapshot;
}

/**
 * Phase 11 — the "operational lifecycle" layer this phase's own GOAL section
 * asks for, sitting *around* `WorkerRuntime` (Phase 4, frozen, used exactly
 * as implemented — this class never reaches into its private state). Does
 * three things `WorkerRuntime` itself deliberately does not (see
 * WorkerRuntimeReport.md's "Intentionally Postponed"):
 *
 * 1. **Process-level duplicate-start prevention** (items 3, 4) — `start()`
 *    is idempotent; a second call is a no-op, logged, not an error. This is
 *    in addition to, not instead of, `WorkerRuntime.start()`'s own
 *    state-guard (which throws if called while not STOPPED) — this class's
 *    guard is what turns "a second caller" into a safe no-op rather than an
 *    uncaught exception reaching application boot.
 * 2. **Crash + ongoing lease recovery** (items 6, 7) — `QueueEngine.recoverExpiredLocks`
 *    (Phase 3) exists but nothing calls it periodically; `start()` calls it
 *    once immediately (reclaims anything orphaned by a previous *ungraceful*
 *    shutdown — a crash, `SIGKILL`, a container restart with no chance to
 *    run `stop()` — before this process starts claiming new work), then on
 *    an interval for the lifetime of the process (catches a job orphaned
 *    mid-run, e.g. by a sibling worker process crashing in a multi-instance
 *    deployment).
 * 3. **A single external health/observability surface** (item 8) —
 *    `snapshot()` combines `WorkerRuntime.health()`/`.heartbeat()`/`.metrics()`
 *    with this class's own `isStarted` flag into one object, for the
 *    `/api/notification-engine/worker-health` route (see production-worker.ts).
 *
 * Deliberately does NOT wrap `pause`/`resume`/`restart` — those are already
 * public on `WorkerRuntime` and this class adds nothing to them; wrapping
 * them here would be needless indirection, not a real capability.
 */
export class WorkerLifecycleManager {
  private started = false;
  private reaperTimer: ReturnType<typeof setInterval> | null = null;
  private readonly logger: IQueueLogger;

  constructor(private readonly options: WorkerLifecycleManagerOptions) {
    this.logger = options.logger ?? new NoopLogger();
  }

  async start(): Promise<void> {
    if (this.started) {
      this.logger.warn("worker_lifecycle.duplicate_start_prevented", {});
      return;
    }
    this.started = true;

    const recoveredOnStartup = await this.options.queueEngine.recoverExpiredLocks(this.options.leaseDurationMs);
    this.logger.info("worker_lifecycle.startup_recovery", { recoveredCount: recoveredOnStartup });

    await this.options.runtime.start();
    this.logger.info("worker_lifecycle.started", {});

    this.reaperTimer = setInterval(() => {
      this.options.queueEngine
        .recoverExpiredLocks(this.options.leaseDurationMs)
        .then((count) => {
          if (count > 0) {
            this.logger.warn("worker_lifecycle.expired_leases_recovered", { count });
          }
        })
        .catch((error: unknown) => {
          this.logger.error("worker_lifecycle.reaper_failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        });
    }, this.options.reaperIntervalMs);
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }
    this.started = false;

    if (this.reaperTimer) {
      clearInterval(this.reaperTimer);
      this.reaperTimer = null;
    }

    await this.options.runtime.stop();
    this.logger.info("worker_lifecycle.stopped", {});
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  isStarted(): boolean {
    return this.started;
  }

  snapshot(): WorkerLifecycleSnapshot {
    return {
      isStarted: this.started,
      lifecycleState: this.options.runtime.status(),
      health: this.options.runtime.health(),
      heartbeat: this.options.runtime.heartbeat(),
      metrics: this.options.runtime.metrics(),
    };
  }
}
