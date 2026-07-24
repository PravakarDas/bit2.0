import type { IQueueEngine } from "../queue";
import { NoopLogger, type IQueueLogger } from "../queue/logger.interface";
import { ChannelAdapterFactory } from "../factories";
import { registerStubChannelAdapters } from "./channel-adapters";
import { JobDispatcher } from "./job-dispatcher";
import { NotificationWorker } from "./notification-worker";
import { WorkerMetricsCollector } from "./worker-metrics";
import { WorkerRuntime } from "./worker-runtime";
import { resolveWorkerConfig, type WorkerConfig } from "./worker-config";

/**
 * Wires one fully-functional (but SMTP-free — see StubChannelAdapter)
 * `WorkerRuntime`, the same manual-constructor-injection style Phase 2/3
 * used (`createNotificationEngineContainer`) — no DI framework, matching
 * this project's convention.
 *
 * Constructing a runtime here does NOT start it — `.start()` is a separate,
 * explicit call. Nothing in this phase calls `.start()` from application
 * boot (`instrumentation.ts` is untouched) — see WorkerRuntimeReport.md
 * "Intentionally Postponed".
 */
export function createWorkerRuntime(
  queueEngine: IQueueEngine,
  configInput: Partial<WorkerConfig> & { workerId: string },
  logger: IQueueLogger = new NoopLogger()
): { runtime: WorkerRuntime; worker: NotificationWorker; channelAdapterFactory: ChannelAdapterFactory } {
  const config = resolveWorkerConfig(configInput);

  const channelAdapterFactory = new ChannelAdapterFactory();
  registerStubChannelAdapters(channelAdapterFactory);

  const jobDispatcher = new JobDispatcher(channelAdapterFactory, logger);
  const metricsCollector = new WorkerMetricsCollector();
  const worker = new NotificationWorker(queueEngine, jobDispatcher, metricsCollector, config, logger);
  const runtime = new WorkerRuntime(worker, metricsCollector, config, logger);

  return { runtime, worker, channelAdapterFactory };
}
