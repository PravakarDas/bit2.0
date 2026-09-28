import { ValidationError } from "../errors";
import { NOTIFICATION_ENGINE_DEFAULTS } from "../constants";

/**
 * Item 11 — version metadata only, reusing `NotificationTemplate.version`
 * (a plain `Int`, Phase 1) exactly as it already exists — no new column, no
 * separate history table (per this phase's explicit "do not implement
 * history storage"). This is a small value object around a number, not a
 * history/diffing system: it answers "what's the next version number
 * given these existing ones" and "is A newer than B," nothing more.
 */
export class TemplateVersion {
  private constructor(private readonly raw: number) {}

  static from(value: number): TemplateVersion {
    if (!Number.isInteger(value) || value < 1) {
      throw new ValidationError("Template version must be a positive integer", [
        { field: "version", message: "must be a positive integer" },
      ]);
    }
    return new TemplateVersion(value);
  }

  /** The version a new `register()` call should use, given every existing version number for that key+channel(+locale). */
  static next(existingVersions: readonly number[]): TemplateVersion {
    if (existingVersions.length === 0) {
      return new TemplateVersion(NOTIFICATION_ENGINE_DEFAULTS.template.initialVersion);
    }
    return new TemplateVersion(Math.max(...existingVersions) + 1);
  }

  get value(): number {
    return this.raw;
  }

  isNewerThan(other: TemplateVersion): boolean {
    return this.raw > other.raw;
  }

  toString(): string {
    return `v${this.raw}`;
  }
}
