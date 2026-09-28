import type { INotificationTemplateRepository } from "../repositories";
import type { NotificationTemplateDTO } from "../dto";
import type { NotificationChannel } from "../types/enums";
import { NotificationTemplateValidator } from "../validators";
import { TemplateLocaleKey } from "./template-locale";
import { TemplateVersion } from "./template-version";
import { TemplateNotFoundError } from "./errors";
import type { RegisterTemplateInput } from "./register-template-input";

/**
 * Item 10 — template lifecycle (register/unregister/list/exists) against
 * `INotificationTemplateRepository` (Phase 2, reused unmodified — this
 * phase adds zero new repository methods; every operation below is
 * expressible with `create`/`findMany`/`findActiveByKeyAndChannel`/`update`
 * exactly as they already exist). Deliberately does NOT know about
 * `TemplateCache` or content validation — those are `TemplateEngine`'s job
 * to coordinate (Single Responsibility: this class only ever talks to the
 * repository and the version/locale value objects).
 */
export class TemplateRegistry {
  constructor(private readonly repository: INotificationTemplateRepository) {}

  /**
   * Creates a new, active version — reusing the exact "append-style
   * version history" pattern already established for `BaseSalary` (see
   * DATABASE.md) and already implemented by the repository's own
   * `create`/`update`. Any previously-active version(s) for this exact
   * key+channel are deactivated so `findActiveByKeyAndChannel` never has
   * ambiguity about which row is current.
   */
  async register(input: RegisterTemplateInput): Promise<NotificationTemplateDTO> {
    const persistedKey = TemplateLocaleKey.build(input.key, input.locale);

    NotificationTemplateValidator.validate({
      key: persistedKey,
      channel: input.channel,
      subjectTemplate: input.subjectTemplate,
      bodyTemplateHtml: input.bodyTemplateHtml,
      bodyTemplateText: input.bodyTemplateText,
    });

    const existing = await this.repository.findMany(persistedKey, input.channel);
    const nextVersion = TemplateVersion.next(existing.map((template) => template.version));

    await Promise.all(
      existing.filter((template) => template.isActive).map((template) => this.repository.update(template.id, { isActive: false }))
    );

    return this.repository.create({
      key: persistedKey,
      channel: input.channel,
      subjectTemplate: input.subjectTemplate,
      bodyTemplateHtml: input.bodyTemplateHtml,
      bodyTemplateText: input.bodyTemplateText,
      version: nextVersion.value,
      isActive: true,
    });
  }

  /** Soft-deactivates the current active version (matching this project's existing `isActive`-toggle convention — see CoreInfrastructureReport.md; never a hard delete). */
  async unregister(key: string, channel: NotificationChannel, locale?: string): Promise<void> {
    const persistedKey = TemplateLocaleKey.build(key, locale);
    const active = await this.repository.findActiveByKeyAndChannel(persistedKey, channel);
    if (!active) {
      throw new TemplateNotFoundError(key, channel, locale);
    }
    await this.repository.update(active.id, { isActive: false });
  }

  async list(filter?: { key?: string; channel?: NotificationChannel }): Promise<NotificationTemplateDTO[]> {
    return this.repository.findMany(filter?.key, filter?.channel);
  }

  async exists(key: string, channel: NotificationChannel, locale?: string): Promise<boolean> {
    return (await this.getActive(key, channel, locale)) !== null;
  }

  /**
   * The locale fallback lookup (item 8): tries the exact locale, then base
   * language, then the locale-less key — see `TemplateLocaleKey.fallbackChain`.
   * With no locale given, this is exactly one query (the chain is a
   * single-element array), so the common case pays no extra cost.
   */
  async getActive(key: string, channel: NotificationChannel, locale?: string): Promise<NotificationTemplateDTO | null> {
    for (const candidateKey of TemplateLocaleKey.fallbackChain(key, locale)) {
      const found = await this.repository.findActiveByKeyAndChannel(candidateKey, channel);
      if (found) {
        return found;
      }
    }
    return null;
  }
}
