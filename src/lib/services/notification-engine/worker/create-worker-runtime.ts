import type { IQueueEngine } from "../queue";
import { NoopLogger, type IQueueLogger } from "../queue/logger.interface";
import { ChannelAdapterFactory } from "../factories";
import { NotificationChannel } from "../types/enums";
import { registerStubChannelAdapters } from "./channel-adapters";
import { JobDispatcher } from "./job-dispatcher";
import { NotificationWorker } from "./notification-worker";
import { WorkerMetricsCollector } from "./worker-metrics";
import { WorkerRuntime } from "./worker-runtime";
import { resolveWorkerConfig, type WorkerConfig } from "./worker-config";
import { DeliveryManagerChannelAdapter, type DeliveryManager } from "../delivery";
import type { INotificationRepository } from "../repositories/interfaces";
import type { ITemplateEngine } from "../template/template-engine.interface";
import type { IDocumentAttachmentResolver } from "./document-attachment-resolver";

/**
 * Phase 8 integration dependencies — all optional, all default to "not
 * wired" so a caller that supplies none of them gets exactly the pre-Phase-8
 * runtime (every channel a `StubChannelAdapter`, no template rendering).
 */
export interface DispatchIntegration {
  /**
   * When supplied, EMAIL's `StubChannelAdapter` is replaced with a
   * `DeliveryManagerChannelAdapter` wrapping this `DeliveryManager` —
   * "Replace the EMAIL StubChannelAdapter with DeliveryManagerChannelAdapter
   * only. Keep every other channel using StubChannelAdapter." Every other
   * channel is untouched, still a `StubChannelAdapter`.
   */
  deliveryManager?: DeliveryManager;
  /** Resolves a job's `NotificationEvent` (eventType + payload) for template rendering — see job-dispatcher.ts's `renderContent()`. */
  eventRepository?: INotificationRepository;
  /** Renders `RenderedNotificationContent` before dispatch — see job-dispatcher.ts's `renderContent()`. */
  templateEngine?: ITemplateEngine;
  /** Phase 18b: resolves a job's `documentId` into a `NotificationAttachment` before dispatch — see job-dispatcher.ts's `renderContent()`. */
  documentAttachmentResolver?: IDocumentAttachmentResolver;
}

/**
 * Wires one fully-functional `WorkerRuntime`, the same manual-constructor-
 * injection style Phase 2/3 used (`createNotificationEngineContainer`) — no
 * DI framework, matching this project's convention.
 *
 * Constructing a runtime here does NOT start it — `.start()` is a separate,
 * explicit call. Nothing in this phase calls `.start()` from application
 * boot (`instrumentation.ts` is untouched) — see WorkerRuntimeReport.md
 * "Intentionally Postponed" and EngineIntegrationReport.md (Phase 8).
 */
export function createWorkerRuntime(
  queueEngine: IQueueEngine,
  configInput: Partial<WorkerConfig> & { workerId: string },
  logger: IQueueLogger = new NoopLogger(),
  dispatchIntegration: DispatchIntegration = {}
): { runtime: WorkerRuntime; worker: NotificationWorker; channelAdapterFactory: ChannelAdapterFactory } {
  const config = resolveWorkerConfig(configInput);

  const channelAdapterFactory = new ChannelAdapterFactory();
  registerStubChannelAdapters(channelAdapterFactory);

  // Phase 8: EMAIL is the only channel with a real DeliveryProvider behind
  // it (SmtpDeliveryProvider, via DeliveryManager) — replace just that one
  // channel's adapter, using ChannelAdapterFactory.register()'s existing
  // extension point (Phase 2). Every other channel keeps the
  // StubChannelAdapter `registerStubChannelAdapters` just registered above.
  if (dispatchIntegration.deliveryManager) {
    channelAdapterFactory.register(new DeliveryManagerChannelAdapter(NotificationChannel.EMAIL, dispatchIntegration.deliveryManager));
  }

  const jobDispatcher = new JobDispatcher(
    channelAdapterFactory,
    logger,
    dispatchIntegration.eventRepository,
    dispatchIntegration.templateEngine,
    dispatchIntegration.documentAttachmentResolver
  );
  const metricsCollector = new WorkerMetricsCollector();
  const worker = new NotificationWorker(queueEngine, jobDispatcher, metricsCollector, config, logger);
  const runtime = new WorkerRuntime(worker, metricsCollector, config, logger);

  return { runtime, worker, channelAdapterFactory };
}
