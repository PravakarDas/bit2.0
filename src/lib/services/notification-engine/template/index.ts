export * from "./types";
export * from "./errors";
export * from "./variable-resolvers";

export { TemplateParser } from "./template-parser";
export { TemplateCompiler } from "./template-compiler";
export { TemplateVariableResolver } from "./template-variable-resolver";
export { TemplateRenderer, type RenderOptions, type MissingVariableStrategy } from "./template-renderer";
export { TemplateValidator, type TemplateValidationOptions } from "./template-validator";
export { TemplateCache, buildTemplateCacheKey } from "./template-cache";
export { TemplateVersion } from "./template-version";
export { TemplateLocaleKey } from "./template-locale";
export { TemplateMetricsCollector, type TemplateMetricsSnapshot } from "./template-metrics";
export { TemplateRegistry } from "./template-registry";
export { TemplateEngine } from "./template-engine";
export type { ITemplateEngine } from "./template-engine.interface";
export type { RegisterTemplateInput } from "./register-template-input";
export type { RenderParams, PreviewParams } from "./render-params";
export { escapeHtml } from "./html-escape";
