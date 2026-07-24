import type { NotificationTemplate } from "@prisma/client";

export type NotificationTemplateDTO = NotificationTemplate;

export type CreateNotificationTemplateInput = Pick<NotificationTemplate, "key" | "channel"> &
  Partial<
    Pick<NotificationTemplate, "subjectTemplate" | "bodyTemplateHtml" | "bodyTemplateText" | "version" | "isActive">
  >;

/** Structural update only — does not decide whether a new version should be created; see Design §32/§43. */
export type UpdateNotificationTemplateInput = Partial<
  Pick<NotificationTemplate, "subjectTemplate" | "bodyTemplateHtml" | "bodyTemplateText" | "isActive">
>;
