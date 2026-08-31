import type { ResolvedEmailConfig } from "../../../../../smtp-shared";
import type { NotificationJobDTO } from "../../../dto";
import type { RenderedNotificationContent } from "../../../factories";
import { SystemClock, type IClock } from "../../../utils";
import type { DeliveryProvider, ProviderContext, ConfigValidationResult } from "../../provider";
import type { ProviderResult } from "../../types/provider-result";
import { ProviderResults } from "../../types/provider-result";
import type { ProviderHealthState } from "../../types/provider-health-state";
import { SmtpConnectionManager } from "./smtp-connection-manager";
import { SmtpConfigValidator } from "./smtp-config-validator";
import { SmtpResultMapper } from "./smtp-result-mapper";
import { SmtpHealthChecker } from "./smtp-health-checker";

export type ResolveSmtpConfig = () => Promise<ResolvedEmailConfig | null>;

/**
 * "SmtpDeliveryProvider implements DeliveryProvider" (item 1) — the first
 * real provider plugged into the Delivery Framework (Phase 6), unchanged.
 * Composes every other SMTP unit this phase builds; contains no SMTP wire
 * protocol logic of its own (that's `nodemailer`, via
 * `SmtpConnectionManager`/`SmtpTransportFactory`).
 *
 * `resolveConfig` deliberately has NO default that touches Prisma — its
 * default returns `null` (an inert, always-"not configured" provider),
 * exactly so this file (and its unit tests) never transitively imports
 * `@/lib/prisma`, matching this engine's established test-safety convention
 * (see QueueEngineReport.md/WorkerRuntimeReport.md/TemplateEngineReport.md/
 * DeliveryFrameworkReport.md's identical constraint on repository
 * interfaces). Production wiring (`register-smtp-provider.ts`) always
 * passes the real `resolveEmailConfig` from `@/lib/email-config.ts`.
 *
 * "SMTP Metrics Integration" (item 9) needed no code here at all: every
 * `DeliveryProvider.deliver()` call — this one included — is already
 * wrapped by `DeliveryManager.invokeProvider()` (Phase 6), which records
 * requests/success/failure/retry and overwrites `latencyMs` with its own
 * measurement. That this "just works" with zero SMTP-specific glue is the
 * Delivery Framework's design proving itself, which is this phase's stated
 * goal.
 */
export class SmtpDeliveryProvider implements DeliveryProvider {
  constructor(
    private readonly connectionManager: SmtpConnectionManager = new SmtpConnectionManager(),
    private readonly configValidator: SmtpConfigValidator = new SmtpConfigValidator(),
    private readonly resultMapper: SmtpResultMapper = new SmtpResultMapper(),
    private readonly healthChecker: SmtpHealthChecker = new SmtpHealthChecker(),
    private readonly resolveConfig: ResolveSmtpConfig = async () => null,
    private readonly clock: IClock = new SystemClock()
  ) {}

  async deliver(job: NotificationJobDTO, content: RenderedNotificationContent, context: ProviderContext): Promise<ProviderResult> {
    const startedAt = this.clock.now();
    const config = await this.resolveConfig();
    const validation = this.configValidator.validate(config);

    if (!config || !validation.valid) {
      // Infra-not-ready (unconfigured/misconfigured provider), not a recipient
      // problem — same transient classification Phase 4's ProviderNotImplementedError
      // precedent uses, so DeliveryManager fails over to a sibling EMAIL
      // provider instead of giving up on this job entirely.
      return ProviderResults.temporaryFailure(
        context.providerId,
        this.elapsedMs(startedAt),
        "SMTP_NOT_CONFIGURED",
        validation.issues.join("; ")
      );
    }

    try {
      const transporter = this.connectionManager.getTransporter(config);
      await transporter.sendMail({
        from: config.senderEmail,
        to: job.recipientAddress,
        subject: content.subject ?? "",
        html: content.bodyHtml,
        text: content.bodyText,
        // Only present on the sendMail() call when there's actually an
        // attachment to send — an absent key (not an empty array/undefined
        // value) keeps a no-attachment call's shape byte-for-byte identical
        // to every pre-Phase-18b call, per this engine's backward-
        // compatibility rule for RenderedNotificationContent's new field.
        ...(content.attachments && content.attachments.length > 0 ? { attachments: content.attachments } : {}),
      });
      return this.resultMapper.toSuccess(context.providerId, this.elapsedMs(startedAt));
    } catch (error) {
      this.connectionManager.invalidate();
      // Diagnostic only — no NotificationDeliveryAttempt row captures this
      // error anywhere in the pipeline today (a real, separate gap; see
      // NotificationPreferencesReport.md-adjacent SMTP investigation notes),
      // so without this the *only* signal a real production failure leaves
      // behind is the job's bare status/attemptCount. Never logs
      // `config.appPassword` itself — only its presence/length.
      const err = error as { code?: string; command?: string; responseCode?: number; response?: string; message?: string } | null;
      console.error("[SmtpDeliveryProvider] delivery attempt failed", {
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.secure,
        authUser: config.senderEmail,
        hasPassword: !!config.appPassword,
        passwordLength: config.appPassword.length,
        jobId: job.id,
        code: err?.code,
        command: err?.command,
        responseCode: err?.responseCode,
        response: err?.response,
        message: err?.message ?? String(error),
      });
      return this.resultMapper.toFailure(error, context.providerId, this.elapsedMs(startedAt));
    }
  }

  /** No eager connection — nodemailer's transporter only opens a socket on first `sendMail()`/`verify()`. A no-op beyond making this provider a valid `ProviderRegistry.initializeAll()` target. */
  async initialize(): Promise<void> {}

  async shutdown(): Promise<void> {
    await this.connectionManager.close();
  }

  async healthCheck(): Promise<ProviderHealthState> {
    const config = await this.resolveConfig();
    return this.healthChecker.check(this.connectionManager, config);
  }

  async validateConfiguration(): Promise<ConfigValidationResult> {
    const config = await this.resolveConfig();
    return this.configValidator.validate(config);
  }

  private elapsedMs(startedAt: Date): number {
    return this.clock.now().getTime() - startedAt.getTime();
  }
}
