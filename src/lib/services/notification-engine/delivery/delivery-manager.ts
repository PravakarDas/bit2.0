import { randomUUID } from "node:crypto";
import { SystemClock, type IClock } from "../utils";
import { NoopLogger, type IQueueLogger } from "../queue/logger.interface";
import type { NotificationJobDTO } from "../dto";
import type { RenderedNotificationContent } from "../factories";
import type { ProviderResolver } from "./provider-resolver";
import type { ProviderHealthMonitor } from "./provider-health-monitor";
import type { ProviderMetricsCollector } from "./provider-metrics";
import { DeliveryPolicy } from "./delivery-policy";
import { DeliveryAttemptContext } from "./delivery-attempt-context";
import { DeliveryExceptionMapper } from "./delivery-exception-mapper";
import { FailoverDeliveryStrategy, type DeliveryStrategy } from "./delivery-strategy";
import { ProviderContext } from "./provider";
import type { DeliveryOutcome, DeliverOptions, RegisteredProvider } from "./types";

/**
 * Public facade (item 1) — the one entry point a future dispatch pipeline
 * calls. Composes every other piece in this module: resolves eligible
 * candidates (`ProviderResolver`), runs the failover loop over them
 * (`DeliveryStrategy`, which internally uses `ProviderSelector`), and for
 * every attempt records metrics (`ProviderMetricsCollector`) and updates
 * health (`ProviderHealthMonitor`), mapping any thrown error through
 * `DeliveryExceptionMapper` first.
 *
 * Deliberately does NOT send anything real — every registered provider this
 * phase ships (see test-fakes/) is a stub; no SMTP/SMS/WhatsApp/Push client
 * exists here or anywhere in this module. See DeliveryFrameworkReport.md
 * "Worker Integration" for why `JobDispatcher`/`NotificationWorker` are not
 * rewired to call this class yet.
 */
export class DeliveryManager {
  constructor(
    private readonly resolver: ProviderResolver,
    private readonly healthMonitor: ProviderHealthMonitor,
    private readonly metrics: ProviderMetricsCollector,
    private readonly strategy: DeliveryStrategy = new FailoverDeliveryStrategy(),
    private readonly defaultPolicy: DeliveryPolicy = DeliveryPolicy.default(),
    private readonly clock: IClock = new SystemClock(),
    private readonly logger: IQueueLogger = new NoopLogger()
  ) {}

  async deliver(job: NotificationJobDTO, content: RenderedNotificationContent, options: DeliverOptions = {}): Promise<DeliveryOutcome> {
    const candidates = this.resolver.resolve(job.channel, options.requiredCapabilities);

    if (candidates.length === 0) {
      this.logger.warn("delivery.no_provider_available", { channel: job.channel, jobId: job.id });
      return { kind: "NO_PROVIDER_AVAILABLE", attempts: [] };
    }

    const attemptContext = new DeliveryAttemptContext({
      job,
      content,
      policy: options.policy ?? this.defaultPolicy,
      correlationId: options.correlationId ?? randomUUID(),
      startedAt: this.clock.now(),
    });

    this.logger.debug("delivery.started", {
      jobId: job.id,
      channel: job.channel,
      correlationId: attemptContext.correlationId,
      candidateCount: candidates.length,
    });

    const outcome = await this.strategy.execute(
      candidates,
      attemptContext,
      (candidate, providerContext) => this.invokeProvider(candidate, job, content, providerContext, attemptContext),
      (candidate, attemptNumber) =>
        new ProviderContext({
          providerId: candidate.descriptor.id,
          providerName: candidate.descriptor.name,
          channel: candidate.descriptor.channel,
          capabilities: candidate.descriptor.capabilities,
          attemptNumber,
          correlationId: attemptContext.correlationId,
        })
    );

    this.logger.debug("delivery.completed", { jobId: job.id, channel: job.channel, outcome: outcome.kind });
    return outcome;
  }

  private async invokeProvider(
    candidate: RegisteredProvider,
    job: NotificationJobDTO,
    content: RenderedNotificationContent,
    providerContext: ProviderContext,
    attemptContext: DeliveryAttemptContext
  ) {
    const providerId = candidate.descriptor.id;
    const isRetry = attemptContext.attemptsTried.length > 0;

    this.metrics.recordRequest(providerId);
    if (isRetry) this.metrics.recordRetry(providerId);

    const start = this.clock.now();
    try {
      const result = await candidate.provider.deliver(job, content, providerContext);
      const latencyMs = this.clock.now().getTime() - start.getTime();
      const finalResult = { ...result, latencyMs };

      if (finalResult.status === "SUCCESS") {
        this.metrics.recordSuccess(providerId, latencyMs);
        this.healthMonitor.recordSuccess(providerId);
      } else {
        this.metrics.recordFailure(providerId, latencyMs);
        // A PERMANENT_FAILURE is a business/recipient problem (e.g. invalid
        // address), not evidence the provider's infrastructure is unwell —
        // only a TEMPORARY_FAILURE should count against provider health.
        if (finalResult.status === "TEMPORARY_FAILURE") {
          this.healthMonitor.recordFailure(providerId);
        }
      }
      return finalResult;
    } catch (error) {
      const latencyMs = this.clock.now().getTime() - start.getTime();
      const mapped = DeliveryExceptionMapper.toProviderResult(error, providerId, latencyMs);
      this.metrics.recordFailure(providerId, latencyMs);
      this.healthMonitor.recordFailure(providerId);
      this.logger.error("delivery.provider_threw", { providerId, jobId: job.id, errorCode: mapped.errorCode ?? "" });
      return mapped;
    }
  }
}
