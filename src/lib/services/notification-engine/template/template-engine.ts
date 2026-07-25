import type { RenderedNotificationContent } from "../factories";
import type { NotificationTemplateDTO } from "../dto";
import type { NotificationChannel } from "../types/enums";
// Imported directly from its own file, NOT the `../queue` barrel — that
// barrel also value-exports `QueueRepository`, which imports `@/lib/prisma`.
// Going through the barrel here would transitively pull that in, which is
// harmless for the real app (webpack/Next.js resolves `@/` fine) but breaks
// this project's dependency-free `node --test` runner (plain Node `require`
// has no idea what `@/lib/prisma` means) — the exact pitfall already
// documented in QueueEngineReport.md/WorkerRuntimeReport.md's "Testing"
// sections. Importing this one file directly avoids it entirely.
import { NoopLogger, type IQueueLogger } from "../queue/logger.interface";
import { TemplateRegistry } from "./template-registry";
import { TemplateCompiler } from "./template-compiler";
import { TemplateRenderer } from "./template-renderer";
import { TemplateValidator, type TemplateValidationOptions } from "./template-validator";
import { TemplateCache, buildTemplateCacheKey } from "./template-cache";
import { TemplateMetricsCollector } from "./template-metrics";
import { TemplateLocaleKey } from "./template-locale";
import { TemplateNotFoundError, TemplateValidationFailedError } from "./errors";
import type { ITemplateEngine } from "./template-engine.interface";
import type { RegisterTemplateInput } from "./register-template-input";
import type { RenderParams, PreviewParams } from "./render-params";
import type { CompiledTemplate, TemplateSource, TemplateValidationResult } from "./types";
import { templateSourceFromDTO } from "./types";

/**
 * The Notification Template Engine's public façade (item 1) — the exact 8
 * methods this phase specifies. Composes every other piece built this
 * phase (registry, compiler, renderer, validator, cache, metrics) plus the
 * locale fallback convention, but performs NO delivery of any kind itself
 * (no SMTP, no queue interaction, no `NotificationService` business logic
 * — see TemplateEngineReport.md "Architecture Compliance").
 */
export class TemplateEngine implements ITemplateEngine {
  constructor(
    private readonly registry: TemplateRegistry,
    private readonly compiler: TemplateCompiler = new TemplateCompiler(),
    private readonly renderer: TemplateRenderer = new TemplateRenderer(),
    private readonly validator: TemplateValidator = new TemplateValidator(),
    private readonly cache: TemplateCache = new TemplateCache(),
    private readonly metrics: TemplateMetricsCollector = new TemplateMetricsCollector(),
    private readonly logger: IQueueLogger = new NoopLogger()
  ) {}

  compile(source: TemplateSource, templateKey?: string): CompiledTemplate {
    this.metrics.recordCompile();
    return this.compiler.compile(source, templateKey);
  }

  validate(source: TemplateSource, options?: TemplateValidationOptions): TemplateValidationResult {
    const result = this.validator.validate(source, options);
    if (!result.isValid) {
      this.metrics.recordValidationFailure();
    }
    return result;
  }

  async render(params: RenderParams): Promise<RenderedNotificationContent> {
    const startedAt = Date.now();
    const compiled = await this.getCompiledForKey(params.key, params.channel, params.locale);
    const rendered = this.renderer.render(compiled, params.context);
    this.metrics.recordRender(Date.now() - startedAt);
    this.logger.debug("template.rendered", { key: params.key, channel: params.channel, locale: params.locale });
    return rendered;
  }

  async preview(params: PreviewParams): Promise<RenderedNotificationContent> {
    const compiled = params.source
      ? this.compiler.compile(params.source)
      : await this.getCompiledForKey(params.key, params.channel, params.locale, { skipCache: true });
    const rendered = this.renderer.render(compiled, params.context);
    this.metrics.recordPreview();
    return rendered;
  }

  async register(input: RegisterTemplateInput): Promise<NotificationTemplateDTO> {
    const validation = this.validator.validate(input);
    if (!validation.isValid) {
      this.metrics.recordValidationFailure();
      throw new TemplateValidationFailedError(input.key, validation.issues);
    }

    const created = await this.registry.register(input);
    this.cache.invalidate(created.key, created.channel);
    this.logger.info("template.registered", { key: created.key, channel: created.channel, version: created.version });
    return created;
  }

  async unregister(key: string, channel: NotificationChannel, locale?: string): Promise<void> {
    await this.registry.unregister(key, channel, locale);
    this.cache.invalidate(TemplateLocaleKey.build(key, locale), channel);
    this.logger.info("template.unregistered", { key, channel, locale });
  }

  async list(filter?: { key?: string; channel?: NotificationChannel }): Promise<NotificationTemplateDTO[]> {
    return this.registry.list(filter);
  }

  async exists(key: string, channel: NotificationChannel, locale?: string): Promise<boolean> {
    return this.registry.exists(key, channel, locale);
  }

  private async getCompiledForKey(
    key: string,
    channel: NotificationChannel,
    locale: string | undefined,
    options: { skipCache?: boolean } = {}
  ): Promise<CompiledTemplate> {
    const dto = await this.registry.getActive(key, channel, locale);
    if (!dto) {
      throw new TemplateNotFoundError(key, channel, locale);
    }

    if (options.skipCache) {
      return this.compiler.compile(templateSourceFromDTO(dto), dto.key);
    }

    const cacheKey = buildTemplateCacheKey(dto.key, dto.channel, dto.version);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.metrics.recordCacheHit();
      return cached;
    }

    this.metrics.recordCacheMiss();
    const compiled = this.compiler.compile(templateSourceFromDTO(dto), dto.key);
    this.cache.set(cacheKey, compiled);
    return compiled;
  }
}
