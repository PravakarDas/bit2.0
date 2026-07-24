import { NotificationError, NotificationErrorCode } from "./notification-error";

/**
 * Reserved for the future SMTP/channel-provider layer (failover, health
 * probing, credential decryption failures — see NotificationEngineDesign.md
 * §9/§10). Defined now so the error hierarchy is complete; nothing in this
 * phase throws it yet, since no provider integration exists yet.
 */
export class ProviderError extends NotificationError {
  readonly code: NotificationErrorCode = "PROVIDER_ERROR";

  constructor(
    message: string,
    readonly providerId?: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
  }
}
