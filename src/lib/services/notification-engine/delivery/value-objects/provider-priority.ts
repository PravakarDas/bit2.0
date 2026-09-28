import { ValidationError } from "../../errors";
import { NOTIFICATION_ENGINE_DEFAULTS } from "../../constants";

/**
 * Wraps `NotificationProvider.priority` (see prisma/schema.prisma: "Lower =
 * tried first"). A value object rather than a bare `number` so
 * `ProviderSelector`'s ordering rule has exactly one place that defines what
 * "lower" and "valid" mean, matching this module's existing value-object
 * style (see value-objects/idempotency-key.ts).
 */
export class ProviderPriority {
  private constructor(private readonly raw: number) {}

  static of(value: number): ProviderPriority {
    if (!Number.isInteger(value) || value < 0) {
      throw new ValidationError("priority must be a non-negative integer", [
        { field: "priority", message: "must be a non-negative integer" },
      ]);
    }
    return new ProviderPriority(value);
  }

  static default(): ProviderPriority {
    return new ProviderPriority(NOTIFICATION_ENGINE_DEFAULTS.provider.defaultPriority);
  }

  get value(): number {
    return this.raw;
  }

  /** Ascending — lower priority value sorts first ("tried first"). */
  static compare(a: ProviderPriority, b: ProviderPriority): number {
    return a.raw - b.raw;
  }

  toString(): string {
    return String(this.raw);
  }
}
