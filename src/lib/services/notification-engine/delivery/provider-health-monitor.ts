import { SystemClock, type IClock } from "../utils";
import { NOTIFICATION_ENGINE_DEFAULTS } from "../constants";
import { type ProviderHealthState, isProviderHealthUsable } from "./types/provider-health-state";

export interface ProviderHealthSnapshot {
  readonly state: ProviderHealthState;
  readonly consecutiveFailures: number;
  readonly lastFailureAt: Date | null;
  readonly lastSuccessAt: Date | null;
}

interface MutableHealthRecord {
  state: ProviderHealthState;
  consecutiveFailures: number;
  lastFailureAt: Date | null;
  lastSuccessAt: Date | null;
}

/**
 * Passive health tracking only — "No external monitoring": nothing here
 * polls a provider on a timer or makes an HTTP request. State is derived
 * purely from `recordSuccess`/`recordFailure` calls `DeliveryManager` makes
 * after every real delivery attempt (an active probe is `ProviderLifecycle
 * .healthCheck()`, a separate, provider-owned concern).
 *
 * Transition rule: consecutive failures below the configured threshold
 * (`NOTIFICATION_ENGINE_DEFAULTS.provider.consecutiveFailureThreshold`, same
 * constant `NotificationProviderRepository`'s own doc comment already
 * referenced) move a provider to DEGRADED; reaching the threshold moves it
 * to OFFLINE. A single success resets the counter and restores HEALTHY.
 * `MAINTENANCE` is never reached by this automatic logic — it is only ever
 * set manually via `setState`, and once set, `recordSuccess`/`recordFailure`
 * leave it alone until an operator explicitly clears it (sticky override).
 */
export class ProviderHealthMonitor {
  private readonly records = new Map<string, MutableHealthRecord>();

  constructor(
    private readonly consecutiveFailureThreshold: number = NOTIFICATION_ENGINE_DEFAULTS.provider.consecutiveFailureThreshold,
    private readonly clock: IClock = new SystemClock()
  ) {}

  private recordFor(providerId: string): MutableHealthRecord {
    let record = this.records.get(providerId);
    if (!record) {
      record = { state: "UNKNOWN", consecutiveFailures: 0, lastFailureAt: null, lastSuccessAt: null };
      this.records.set(providerId, record);
    }
    return record;
  }

  recordSuccess(providerId: string): void {
    const record = this.recordFor(providerId);
    record.lastSuccessAt = this.clock.now();
    record.consecutiveFailures = 0;
    if (record.state !== "MAINTENANCE") {
      record.state = "HEALTHY";
    }
  }

  recordFailure(providerId: string): void {
    const record = this.recordFor(providerId);
    record.lastFailureAt = this.clock.now();
    record.consecutiveFailures += 1;
    if (record.state === "MAINTENANCE") return;
    record.state = record.consecutiveFailures >= this.consecutiveFailureThreshold ? "OFFLINE" : "DEGRADED";
  }

  /** Manual override — e.g. putting a provider into MAINTENANCE, or forcibly clearing one back to UNKNOWN after a config fix. */
  setState(providerId: string, state: ProviderHealthState): void {
    this.recordFor(providerId).state = state;
  }

  getState(providerId: string): ProviderHealthState {
    return this.records.get(providerId)?.state ?? "UNKNOWN";
  }

  isUsable(providerId: string): boolean {
    return isProviderHealthUsable(this.getState(providerId));
  }

  getSnapshot(providerId: string): ProviderHealthSnapshot {
    const record = this.records.get(providerId);
    return record
      ? { ...record }
      : { state: "UNKNOWN", consecutiveFailures: 0, lastFailureAt: null, lastSuccessAt: null };
  }
}
