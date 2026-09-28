/**
 * What a provider can do — examples from this phase's own prompt: HTML
 * Email, Attachments, Inline Images, Bulk Send, Scheduling, Tracking.
 * "Future channels should expose different capabilities": a WhatsApp or SMS
 * provider legitimately has `htmlEmail: false` forever, while a bulk-only
 * announcement provider might have `bulkSend: true, scheduling: false`.
 * `ProviderResolver` filters out providers whose capabilities don't satisfy
 * what a given delivery requires — see `supports()`.
 */
export interface ProviderCapabilityFlags {
  readonly htmlEmail: boolean;
  readonly attachments: boolean;
  readonly inlineImages: boolean;
  readonly bulkSend: boolean;
  readonly scheduling: boolean;
  readonly tracking: boolean;
}

export type RequiredProviderCapabilities = Partial<ProviderCapabilityFlags>;

export class ProviderCapabilities implements ProviderCapabilityFlags {
  private constructor(
    readonly htmlEmail: boolean,
    readonly attachments: boolean,
    readonly inlineImages: boolean,
    readonly bulkSend: boolean,
    readonly scheduling: boolean,
    readonly tracking: boolean
  ) {}

  static of(flags: Partial<ProviderCapabilityFlags>): ProviderCapabilities {
    return new ProviderCapabilities(
      flags.htmlEmail ?? false,
      flags.attachments ?? false,
      flags.inlineImages ?? false,
      flags.bulkSend ?? false,
      flags.scheduling ?? false,
      flags.tracking ?? false
    );
  }

  /** No capabilities at all — the safe default for a provider descriptor that hasn't specified any. */
  static none(): ProviderCapabilities {
    return ProviderCapabilities.of({});
  }

  /** Every capability enabled — mainly useful for tests. */
  static full(): ProviderCapabilities {
    return ProviderCapabilities.of({
      htmlEmail: true,
      attachments: true,
      inlineImages: true,
      bulkSend: true,
      scheduling: true,
      tracking: true,
    });
  }

  /** True only if this provider has every flag the caller marked `true` in `required` (flags left unset in `required` are not checked). */
  supports(required: RequiredProviderCapabilities): boolean {
    return (Object.keys(required) as (keyof ProviderCapabilityFlags)[]).every(
      (key) => required[key] !== true || this[key] === true
    );
  }
}
