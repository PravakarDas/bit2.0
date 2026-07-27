import type { NotificationJobDTO } from "../dto";
import type { ChannelAdapterFactory, ChannelDeliveryOutcome, RenderedNotificationContent } from "../factories";
import { ProviderError } from "../errors";
import { NoopLogger, type IQueueLogger } from "../queue/logger.interface";
import type { ExecutionContext } from "./execution-context";
// Imported directly from their own files, NOT the `../repositories`/`../template`
// barrels — both barrels also value-export Prisma-touching classes
// (`NotificationRepository`, etc.), which transitively pull in `@/lib/prisma`
// and break plain `node --test` — the exact pitfall already documented in
// every prior phase's report. `type`-only imports of a single interface from
// either barrel would actually be safe (erased at compile time), but this
// matches the established convention of never depending on either barrel
// from a file under `worker/` regardless.
import type { INotificationRepository } from "../repositories/interfaces";
import type { ITemplateEngine } from "../template/template-engine.interface";

export type DispatchOutcome =
  | { kind: "SUCCESS"; result: ChannelDeliveryOutcome }
  | { kind: "PROVIDER_NOT_IMPLEMENTED"; error: ProviderError }
  | { kind: "CANCELLED" }
  | { kind: "FAILURE"; error: unknown };

/**
 * Execution Pipeline steps "Resolve Provider Adapter" + "Render Template" +
 * "Execute Adapter" (items 10 "Job Dispatcher" and 11 "Provider Resolution"
 * — one class, since resolution is a single line via Phase 2's already-frozen
 * `ChannelAdapterFactory.getAdapter`, not enough of its own concern to
 * warrant a separate class).
 *
 * Phase 8 integration: `eventRepository`/`templateEngine` are optional and
 * default to nothing — a `JobDispatcher` built without them (every
 * pre-Phase-8 test, and any future caller with no rendering need) behaves
 * exactly as before this phase: `{}` content, no repository/template
 * lookups. When both are supplied (the real `createWorkerRuntime` wiring
 * always supplies them — see container.ts), `renderContent()` looks up the
 * job's `NotificationEvent` (`eventType` as the template key, `payload` as
 * the render context) and renders it *before* the adapter is ever called —
 * "Templates must be rendered before dispatch. SMTP must never render
 * templates. DeliveryManager must never render templates." A template that
 * fails to render (e.g. `TemplateNotFoundError`) is caught by the same
 * `catch` below as any other dispatch error, so it retries exactly like a
 * transient provider failure — no new `DispatchOutcome` kind, no change to
 * `NotificationWorker`'s retry routing.
 *
 * No SMTP, no real delivery *of any other channel*: every non-EMAIL
 * adapter registered by `createWorkerRuntime` is still a `StubChannelAdapter`
 * (see ./channel-adapters/) that always throws `ProviderNotImplementedError`
 * (a `ProviderError` subclass) — treated as a *transient*, infrastructure-
 * level outcome (not a per-recipient permanent failure), so
 * `NotificationWorker` routes it to retry, not dead-letter. The catch below
 * matches on the base `ProviderError` class, not just the specific
 * subclass — resolving a completely unregistered channel
 * (`ChannelAdapterFactory.getAdapter` throwing a plain `ProviderError`,
 * which only happens if a caller builds a factory without
 * `registerStubChannelAdapters`) is the same class of "provider
 * infrastructure isn't ready" problem and gets the same transient
 * treatment. See WorkerRuntimeReport.md's "Execution Pipeline" section and
 * EngineIntegrationReport.md for this phase's wiring.
 */
export class JobDispatcher {
  constructor(
    private readonly channelAdapterFactory: ChannelAdapterFactory,
    private readonly logger: IQueueLogger = new NoopLogger(),
    private readonly eventRepository?: INotificationRepository,
    private readonly templateEngine?: ITemplateEngine
  ) {}

  async dispatch(job: NotificationJobDTO, context: ExecutionContext): Promise<DispatchOutcome> {
    this.logger.debug("worker.dispatch_started", { jobId: job.id, channel: job.channel, workerId: context.workerId });

    let outcome: DispatchOutcome;
    try {
      const adapter = this.channelAdapterFactory.getAdapter(job.channel);
      const content = await this.renderContent(job);
      const result = await this.raceAgainstCancellation(adapter.send(job, content), context);
      outcome = { kind: "SUCCESS", result };
    } catch (error) {
      if (error instanceof ProviderError) {
        outcome = { kind: "PROVIDER_NOT_IMPLEMENTED", error };
      } else if (context.isCancelled) {
        outcome = { kind: "CANCELLED" };
      } else {
        outcome = { kind: "FAILURE", error };
      }
    }

    this.logger.debug("worker.dispatch_finished", { jobId: job.id, outcome: outcome.kind });
    return outcome;
  }

  /**
   * Renders the job's template — the ONLY place in this dispatch pipeline
   * that does. Returns `{}` (Phase 2's original, always-valid empty
   * content) whenever rendering isn't wired up, so this method is a pure,
   * backward-compatible addition, not a behavior change, for any caller
   * that doesn't supply both dependencies.
   */
  private async renderContent(job: NotificationJobDTO): Promise<RenderedNotificationContent> {
    if (!this.templateEngine || !this.eventRepository) {
      return {};
    }

    const event = await this.eventRepository.findById(job.eventId);
    if (!event) {
      return {};
    }

    const payload = event.payload;
    const renderContext: Record<string, unknown> =
      payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};

    return this.templateEngine.render({ key: event.eventType, channel: job.channel, context: renderContext });
  }

  /**
   * Races the adapter's promise against `context.signal` — deliberately
   * done here, not inside the adapter, so Phase 2's frozen
   * `NotificationChannelAdapter.send(job, content)` signature never needs
   * to change to support cancellation.
   */
  private raceAgainstCancellation<T>(promise: Promise<T>, context: ExecutionContext): Promise<T> {
    if (context.signal.aborted) {
      return Promise.reject(new Error(`Execution cancelled before dispatch: ${String(context.signal.reason ?? "no reason given")}`));
    }
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        reject(new Error(`Execution cancelled: ${String(context.signal.reason ?? "no reason given")}`));
      };
      context.signal.addEventListener("abort", onAbort, { once: true });
      promise
        .then((value) => {
          context.signal.removeEventListener("abort", onAbort);
          resolve(value);
        })
        .catch((error: unknown) => {
          context.signal.removeEventListener("abort", onAbort);
          reject(error);
        });
    });
  }
}
