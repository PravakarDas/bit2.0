import type { ResolvedEmailConfig } from "../../../../../smtp-shared";
import type { ConfigValidationResult } from "../../provider";

/**
 * Structural validation of a resolved SMTP config — same manual-check style
 * as every other validator in this engine (see `validators/*.ts` from
 * Phase 2: no zod, plain `if` checks). Distinct from `resolveEmailConfig()`
 * itself (`@/lib/email-config.ts`, prisma-touching) — this class only ever
 * receives an already-resolved value (or `null`), so it stays fully
 * database-free and unit-testable in isolation.
 */
export class SmtpConfigValidator {
  validate(config: ResolvedEmailConfig | null): ConfigValidationResult {
    const issues: string[] = [];

    if (!config) {
      return { valid: false, issues: ["SMTP is not configured — no EmailConfig row (or required fields are missing)."] };
    }

    if (!config.smtpHost || config.smtpHost.trim().length === 0) {
      issues.push("smtpHost must not be empty.");
    }
    if (!Number.isInteger(config.smtpPort) || config.smtpPort <= 0 || config.smtpPort > 65535) {
      issues.push("smtpPort must be an integer between 1 and 65535.");
    }
    if (!config.senderEmail || !config.senderEmail.includes("@")) {
      issues.push("senderEmail must be a valid-looking email address.");
    }
    if (!config.appPassword || config.appPassword.trim().length === 0) {
      issues.push("appPassword must not be empty (decryption may have failed).");
    }

    return { valid: issues.length === 0, issues };
  }
}
