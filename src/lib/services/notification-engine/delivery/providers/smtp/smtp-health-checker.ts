import type { ResolvedEmailConfig } from "../../../../../smtp-shared";
import type { ProviderHealthState } from "../../types/provider-health-state";
import type { SmtpConnectionManager } from "./smtp-connection-manager";

/**
 * "SMTP Health Check" (item 5) — backs `SmtpDeliveryProvider.healthCheck()`.
 * An unconfigured provider reports `MAINTENANCE` (an operator hasn't set
 * this provider up yet — a deliberate, semi-permanent "not ready for
 * traffic" state, distinct from a configured-but-currently-unreachable
 * server, which reports `OFFLINE`). This is an *active* probe
 * (`SmtpConnectionManager.verify()`, a real SMTP handshake with no message
 * sent) — separate from `ProviderHealthMonitor`'s *passive* tracking
 * (Phase 6), which only reacts to `deliver()` outcomes.
 */
export class SmtpHealthChecker {
  async check(connectionManager: SmtpConnectionManager, config: ResolvedEmailConfig | null): Promise<ProviderHealthState> {
    if (!config) return "MAINTENANCE";
    const reachable = await connectionManager.verify(config);
    return reachable ? "HEALTHY" : "OFFLINE";
  }
}
