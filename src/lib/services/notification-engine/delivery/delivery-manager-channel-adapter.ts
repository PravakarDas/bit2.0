import type { NotificationChannel } from "../types/enums";
import type { NotificationJobDTO } from "../dto";
import type { ChannelDeliveryOutcome, NotificationChannelAdapter, RenderedNotificationContent } from "../factories";
import type { DeliveryManager } from "./delivery-manager";

/**
 * Bridges Phase 6's `DeliveryManager` to Phase 2's frozen
 * `NotificationChannelAdapter` interface — the concrete mechanism behind
 * this phase's "NotificationWorker may call DeliveryManager instead of
 * StubChannelAdapter ... for EMAIL" instruction. `JobDispatcher` (Phase 4,
 * unmodified) already calls `channelAdapterFactory.getAdapter(job.channel)
 * .send(job, content)` for ANY channel — this class makes that call route
 * through `DeliveryManager` for whichever channel it's registered against,
 * with ZERO change to `JobDispatcher`/`NotificationWorker`/`WorkerRuntime`
 * themselves: the only thing that changes is which `NotificationChannelAdapter`
 * a `ChannelAdapterFactory` happens to have registered for that channel,
 * using `ChannelAdapterFactory.register()`'s existing extension point
 * (Phase 2, unused until Phase 4's `registerStubChannelAdapters`).
 *
 * Deliberately generic — not SMTP-specific — so a future SMS/WhatsApp/Push
 * phase can register the exact same bridge for its own channel without any
 * change here. See `delivery-manager-channel-adapter.test.ts` for the proof
 * that this correctly drives `JobDispatcher.dispatch()` end-to-end; nothing
 * in the actual running `container.ts`/`createWorkerRuntime()` wiring uses
 * this class today — see SmtpProviderReport.md's "Worker Integration".
 */
export class DeliveryManagerChannelAdapter implements NotificationChannelAdapter {
  constructor(
    readonly channel: NotificationChannel,
    private readonly deliveryManager: DeliveryManager
  ) {}

  async send(job: NotificationJobDTO, content: RenderedNotificationContent): Promise<ChannelDeliveryOutcome> {
    const outcome = await this.deliveryManager.deliver(job, content);

    switch (outcome.kind) {
      case "SUCCESS":
        return { outcome: "SUCCESS" };
      case "PERMANENT_FAILURE":
        return { outcome: "FAILURE", errorCode: outcome.result.errorCode, errorMessage: outcome.result.errorMessage };
      case "TEMPORARY_FAILURE": {
        const last = outcome.attempts[outcome.attempts.length - 1];
        return {
          outcome: "FAILURE",
          errorCode: last?.errorCode ?? "ALL_PROVIDERS_FAILED",
          errorMessage: last?.errorMessage ?? "Every eligible provider failed temporarily.",
        };
      }
      case "NO_PROVIDER_AVAILABLE":
        return {
          outcome: "FAILURE",
          errorCode: "NO_PROVIDER_AVAILABLE",
          errorMessage: `No eligible delivery provider is registered for channel "${this.channel}".`,
        };
    }
  }
}
