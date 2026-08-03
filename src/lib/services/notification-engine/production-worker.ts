import { notificationEngineContainer } from "./container";
import { QueueEngine, ConsoleQueueLogger } from "./queue";
import { createWorkerRuntime, WorkerLifecycleManager, type WorkerLifecycleSnapshot } from "./worker";
import { getOrCreateNotificationSettings } from "./notification-settings";
import { NOTIFICATION_ENGINE_DEFAULTS } from "./constants";

/**
 * Phase 11 — the one production entry point that actually starts the
 * Notification Engine's worker. Everything this wires together
 * (`QueueEngine`, `createWorkerRuntime`, `WorkerLifecycleManager`,
 * `NotificationSettings`) is used exactly as its own phase implemented it —
 * this file is pure composition + one process-lifetime singleton, matching
 * `container.ts`'s own "manual wiring, no DI framework" convention.
 *
 * Deliberately builds its OWN `QueueEngine`/`WorkerRuntime` rather than
 * starting `notificationEngineContainer.workerRuntime` (built with
 * hardcoded defaults, no logger, at module-load time — before
 * `NotificationSettings` can be read, since that's an async DB call and the
 * container is a synchronous singleton other modules — e.g. `loan.actions.ts`
 * — already depend on being immediately usable). Both `QueueEngine`
 * instances are stateless wrappers over the same `NotificationJob` table via
 * the same `queueRepository` instance, so having two is exactly as safe as
 * two separate worker *processes* sharing one database — which this engine
 * has always been designed to tolerate (see NotificationEngineDesign.md's
 * crash-recovery/lease sections). `notificationEngineContainer.workerRuntime`
 * itself stays dormant, as it has since Phase 8.
 *
 * The `lifecycleManager` singleton is stored on `globalThis`, same pattern as
 * `src/lib/prisma.ts`. A plain module-level `let` is not a reliable
 * process-wide singleton under Next.js: `instrumentation.ts` (which starts
 * the worker) and `worker-health/route.ts` (which reads its snapshot) are
 * separate compiled entry points, and this file can be evaluated as a
 * distinct module instance in each one — each getting its own top-level
 * variable. `globalThis` is the one object actually shared across those
 * instances within a process, so it's the only place a reference set by
 * `startProductionNotificationWorker()` (called from instrumentation's copy)
 * is guaranteed visible to `getProductionNotificationWorkerSnapshot()`
 * (called from the route's copy).
 */
declare global {
  var __notificationLifecycleManager: WorkerLifecycleManager | null | undefined;
}

function getLifecycleManager(): WorkerLifecycleManager | null {
  return globalThis.__notificationLifecycleManager ?? null;
}

export async function startProductionNotificationWorker(): Promise<void> {
  const lifecycleManager = getLifecycleManager();
  if (lifecycleManager?.isStarted()) {
    return;
  }

  const logger = new ConsoleQueueLogger();

  let settings: Awaited<ReturnType<typeof getOrCreateNotificationSettings>> | null = null;
  try {
    settings = await getOrCreateNotificationSettings();
  } catch (error) {
    logger.error("worker_lifecycle.settings_load_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const leaseDurationMs = NOTIFICATION_ENGINE_DEFAULTS.queue.defaultLeaseDurationMs;

  // A dedicated QueueEngine, sharing the container's real (Prisma-backed)
  // queueRepository, but configured with NotificationSettings' retry knobs
  // (item 11) and a real logger — the container's own queueEngine keeps its
  // silent, default-retry configuration for NotificationService.raiseEvent's
  // enqueue path, which doesn't need either.
  const queueEngine = new QueueEngine(notificationEngineContainer.repositories.queueRepository, logger, {
    baseDelaySeconds: settings?.retryBaseDelaySeconds,
    maxDelaySeconds: settings?.retryMaxDelaySeconds,
    maxAttempts: settings?.retryMaxAttempts,
    jitterRatio: settings?.retryJitterRatio,
  });

  const emailEnabled = settings?.emailChannelEnabled ?? true;

  const { runtime } = createWorkerRuntime(
    queueEngine,
    {
      workerId: `worker-${process.pid}`,
      pollIntervalMs: (settings?.workerPollIntervalSeconds ?? 10) * 1000,
      leaseDurationMs,
    },
    logger,
    emailEnabled
      ? {
          deliveryManager: notificationEngineContainer.deliveryManager,
          eventRepository: notificationEngineContainer.repositories.notificationRepository,
          templateEngine: notificationEngineContainer.templateEngine,
        }
      : {}
  );

  const manager = new WorkerLifecycleManager({
    runtime,
    queueEngine,
    leaseDurationMs,
    reaperIntervalMs: 60_000,
    logger,
  });
  globalThis.__notificationLifecycleManager = manager;

  await manager.start();
}

export async function stopProductionNotificationWorker(): Promise<void> {
  const lifecycleManager = getLifecycleManager();
  if (lifecycleManager) {
    await lifecycleManager.stop();
  }
}

export function getProductionNotificationWorkerSnapshot(): WorkerLifecycleSnapshot | null {
  return getLifecycleManager()?.snapshot() ?? null;
}
