import { mapSmtpError } from "../../../../../smtp-shared";
import { ProviderResults, type ProviderResult } from "../../types/provider-result";
import { DeliveryExceptionMapper } from "../../delivery-exception-mapper";
import { isPermanentSmtpError } from "./smtp-retry-classification";

/**
 * "SMTP Result Mapper" (item 7) — turns a `nodemailer.sendMail()` outcome
 * (success or thrown error) into this framework's `ProviderResult`.
 * `toFailure()` uses `DeliveryExceptionMapper` (Phase 6, frozen) exactly as
 * this phase's own instruction requires ("Map SMTP errors ... using
 * DeliveryExceptionMapper"): a confidently-PERMANENT SMTP error
 * (`isPermanentSmtpError`) is reported directly; everything else is handed
 * to `DeliveryExceptionMapper.toProviderResult`, which conservatively
 * classifies any unrecognized thrown error as a retryable TEMPORARY_FAILURE
 * — no SMTP-specific reimplementation of that default.
 */
export class SmtpResultMapper {
  toSuccess(providerId: string, latencyMs: number): ProviderResult {
    return ProviderResults.success(providerId, latencyMs);
  }

  toFailure(error: unknown, providerId: string, latencyMs: number): ProviderResult {
    if (isPermanentSmtpError(error)) {
      return ProviderResults.permanentFailure(providerId, latencyMs, "SMTP_PERMANENT", mapSmtpError(error));
    }
    return DeliveryExceptionMapper.toProviderResult(error, providerId, latencyMs);
  }
}
