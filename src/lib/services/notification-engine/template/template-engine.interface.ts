import type { RenderedNotificationContent } from "../factories";
import type { NotificationTemplateDTO } from "../dto";
import type { NotificationChannel } from "../types/enums";
import type { CompiledTemplate, TemplateSource, TemplateValidationResult } from "./types";
import type { RegisterTemplateInput } from "./register-template-input";
import type { RenderParams, PreviewParams } from "./render-params";
import type { TemplateValidationOptions } from "./template-validator";

/**
 * The exact 8-method public API this phase specifies. Extracted as its own
 * interface (same reason Phase 4 extracted `IQueueEngine` from `QueueEngine`
 * — see WorkerRuntimeReport.md/update.md — a concrete class's private
 * fields make it structurally un-mockable without one; tests need to mock
 * this, not the real `TemplateEngine`).
 */
export interface ITemplateEngine {
  render(params: RenderParams): Promise<RenderedNotificationContent>;
  preview(params: PreviewParams): Promise<RenderedNotificationContent>;
  validate(source: TemplateSource, options?: TemplateValidationOptions): TemplateValidationResult;
  compile(source: TemplateSource, templateKey?: string): CompiledTemplate;
  register(input: RegisterTemplateInput): Promise<NotificationTemplateDTO>;
  unregister(key: string, channel: NotificationChannel, locale?: string): Promise<void>;
  list(filter?: { key?: string; channel?: NotificationChannel }): Promise<NotificationTemplateDTO[]>;
  exists(key: string, channel: NotificationChannel, locale?: string): Promise<boolean>;
}
