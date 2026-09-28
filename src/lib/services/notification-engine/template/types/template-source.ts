import type { NotificationTemplateDTO } from "../../dto";

/**
 * Raw, uncompiled template content — the three "Supported Rendering" parts
 * this phase specifies (Subject, HTML, Plain Text). Deliberately its own
 * type rather than reusing `NotificationTemplateDTO` directly: a
 * `TemplateSource` can come from a persisted row OR from an admin's unsaved
 * draft passed straight to `validate()`/`compile()`/`preview()` — it has no
 * `id`/`key`/`channel`/`version` of its own.
 */
export interface TemplateSource {
  subjectTemplate?: string | null;
  bodyTemplateHtml?: string | null;
  bodyTemplateText?: string | null;
}

/** Extracts the renderable content out of a persisted template row. */
export function templateSourceFromDTO(dto: NotificationTemplateDTO): TemplateSource {
  return {
    subjectTemplate: dto.subjectTemplate,
    bodyTemplateHtml: dto.bodyTemplateHtml,
    bodyTemplateText: dto.bodyTemplateText,
  };
}
