import type { NotificationChannel } from "../types/enums";
import type { RenderContext, TemplateSource } from "./types";

export interface RenderParams {
  key: string;
  channel: NotificationChannel;
  context: RenderContext;
  locale?: string;
}

/**
 * Either a persisted template (`key`+`channel`, looked up and rendered like
 * `render()` — but NEVER cached, so editing a draft and previewing again
 * always reflects the latest saved content) or raw, unsaved draft `source`
 * (never touches the repository or cache at all) — an admin comparing
 * "what does this look like" before calling `register()`.
 */
export type PreviewParams =
  | { key: string; channel: NotificationChannel; context: RenderContext; locale?: string; source?: undefined }
  | { source: TemplateSource; context: RenderContext; key?: undefined; channel?: undefined; locale?: undefined };
