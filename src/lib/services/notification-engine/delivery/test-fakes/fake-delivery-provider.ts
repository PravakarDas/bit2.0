import type { NotificationJobDTO } from "../../dto";
import type { RenderedNotificationContent } from "../../factories";
import type { DeliveryProvider, ProviderContext, ConfigValidationResult } from "../provider";
import { type ProviderResult, ProviderResults } from "../types/provider-result";
import type { ProviderHealthState } from "../types/provider-health-state";

export type FakeDeliveryProviderMode = "success" | "temporary-failure" | "permanent-failure" | "throw";

/**
 * Configurable in-memory stand-in for a real provider — used ONLY by this
 * module's own tests ("Mock providers"). Never registers any real network
 * client; `deliver()` never leaves the process.
 */
export class FakeDeliveryProvider implements DeliveryProvider {
  readonly calls: { job: NotificationJobDTO; content: RenderedNotificationContent; context: ProviderContext }[] = [];
  initializeCalled = false;
  shutdownCalled = false;

  constructor(
    private mode: FakeDeliveryProviderMode = "success",
    private readonly latencyMs = 5
  ) {}

  setMode(mode: FakeDeliveryProviderMode): void {
    this.mode = mode;
  }

  async deliver(job: NotificationJobDTO, content: RenderedNotificationContent, context: ProviderContext): Promise<ProviderResult> {
    this.calls.push({ job, content, context });
    switch (this.mode) {
      case "success":
        return ProviderResults.success(context.providerId, this.latencyMs);
      case "temporary-failure":
        return ProviderResults.temporaryFailure(context.providerId, this.latencyMs, "TEMP", "simulated temporary failure");
      case "permanent-failure":
        return ProviderResults.permanentFailure(context.providerId, this.latencyMs, "PERM", "simulated permanent failure");
      case "throw":
        throw new Error("simulated provider crash");
    }
  }

  async initialize(): Promise<void> {
    this.initializeCalled = true;
  }

  async shutdown(): Promise<void> {
    this.shutdownCalled = true;
  }

  async healthCheck(): Promise<ProviderHealthState> {
    return "HEALTHY";
  }

  async validateConfiguration(): Promise<ConfigValidationResult> {
    return { valid: true, issues: [] };
  }
}
