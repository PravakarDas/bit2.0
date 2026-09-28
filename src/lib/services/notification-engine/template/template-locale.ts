const LOCALE_SEPARATOR = "@";

/**
 * Item 8 — Localization: architecture only, exactly as this phase
 * specifies ("Support locale selection. Do NOT implement translation
 * services."). `NotificationTemplate.key` (Phase 1, frozen — no schema
 * change this phase) is the only place locale-specific content can live
 * today; this class defines ONE convention for encoding a locale into that
 * existing string column (`"LOAN_APPROVED@bn-BD"`) and a fallback chain for
 * looking it up, without adding a `locale` column, a translation library, or
 * any actual translation logic. Registering a translated template is still
 * a manual admin action (via `TemplateEngine.register({..., locale})`) —
 * nothing here generates or fetches a translation.
 */
export class TemplateLocaleKey {
  static build(baseKey: string, locale?: string): string {
    if (!locale) {
      return baseKey;
    }
    return `${baseKey}${LOCALE_SEPARATOR}${locale}`;
  }

  static parse(compositeKey: string): { baseKey: string; locale: string | undefined } {
    const separatorIndex = compositeKey.indexOf(LOCALE_SEPARATOR);
    if (separatorIndex === -1) {
      return { baseKey: compositeKey, locale: undefined };
    }
    return {
      baseKey: compositeKey.slice(0, separatorIndex),
      locale: compositeKey.slice(separatorIndex + 1),
    };
  }

  /**
   * Lookup order for a requested locale: exact locale, then base language
   * (e.g. `"bn-BD"` -> `"bn"`), then the locale-less base key. Given no
   * locale at all, the chain is just the base key. `TemplateRegistry.getActive`
   * tries each of these in order and returns the first that exists.
   */
  static fallbackChain(baseKey: string, locale?: string): string[] {
    if (!locale) {
      return [baseKey];
    }

    const chain = [TemplateLocaleKey.build(baseKey, locale)];

    const dashIndex = locale.indexOf("-");
    if (dashIndex > 0) {
      const baseLanguage = locale.slice(0, dashIndex);
      chain.push(TemplateLocaleKey.build(baseKey, baseLanguage));
    }

    chain.push(baseKey);
    return chain;
  }
}
