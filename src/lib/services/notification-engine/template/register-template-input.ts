import type { NotificationChannel } from "../types/enums";

export interface RegisterTemplateInput {
  key: string;
  channel: NotificationChannel;
  /** Architecture-only locale selection (item 8) — folded into the persisted `key` via `TemplateLocaleKey`, no schema change. */
  locale?: string;
  subjectTemplate?: string;
  bodyTemplateHtml?: string;
  bodyTemplateText?: string;
}
