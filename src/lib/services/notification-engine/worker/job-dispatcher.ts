import type { NotificationJobDTO } from "../dto";
import type { ChannelAdapterFactory, ChannelDeliveryOutcome } from "../factories";
import { ProviderError } from "../errors";
import { NoopLogger, type IQueueLogger } from "../queue/logger.interface";
import type { ExecutionContext } from "./execution-context";

export type DispatchOutcome =
  | { kind: "SUCCESS"; result: ChannelDeliveryOutcome }
  | { kind: "PROVIDER_NOT_IMPLEMENTED"; error: ProviderError }
  | { kind: "CANCELLED" }
  | { kind: "FAILURE"; error: unknown };

/**
 * Execution Pipeline steps "Resolve Provider Adapter" + "Execute Adapter"
 * (items 10 "Job Dispatcher" and 11 "Provider Resolution" — one class,
 * since resolution is a single line via Phase 2's already-frozen
 * `ChannelAdapterFactory.getAdapter`, not enough of its own concern to
 * warrant a separate class).
 *
 * No template rendering happens here (explicitly forbidden this phase) —
 * `RenderedNotificationContent` is passed as an empty object, matching
 * Phase 2's interface (every field optional) exactly; a future phase that
 * adds real rendering only needs to change what's passed here, not this
 * class's shape.
 *
 * No SMTP, no real delivery: every registered adapter is a
 * `StubChannelAdapter` (see ./channel-adapters/) that always throws
 * `ProviderNotImplementedError` (a `ProviderError` subclass) — this is
 * treated as a *transient*, infrastructure-level outcome (not a
 * per-recipient permanent failure), so `NotificationWorker` routes it to
 * retry, not dead-letter. The catch below matches on the base
 * `ProviderError` class, not just the specific subclass — resolving a
 * completely unregistered channel (`ChannelAdapterFactory.getAdapter`
 * throwing a plain `ProviderError`, which only happens if a caller builds
 * a factory without `registerStubChannelAdapters`; the real
 * `createWorkerRuntime` wiring always registers all 8 channels) is the
 * same class of "provider infrastructure isn't ready" problem and gets the
 * same transient treatment. See WorkerRuntimeReport.md's "Execution
 * Pipeline" section.
 */
export class JobDispatcher {
  constructor(
    private readonly channelAdapterFactory: ChannelAdapterFactory,
    private readonly logger: IQueueLogger = new NoopLogger()
  ) {}

  async dispatch(job: NotificationJobDTO, context: ExecutionContext): Promise<DispatchOutcome> {
    this.logger.debug("worker.dispatch_started", { jobId: job.id, channel: job.channel, workerId: context.workerId });

    let outcome: DispatchOutcome;
    try {
      const adapter = this.channelAdapterFactory.getAdapter(job.channel);
      const result = await this.raceAgainstCancellation(adapter.send(job, {}), context);
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
