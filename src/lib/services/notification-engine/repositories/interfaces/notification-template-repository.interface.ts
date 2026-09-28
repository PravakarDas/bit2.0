import type { CreateNotificationTemplateInput, NotificationTemplateDTO, UpdateNotificationTemplateInput } from "../../dto";
import type { NotificationChannel } from "../../types/enums";

/**
 * Data access for `NotificationTemplate`. No rendering — turning a template
 * plus event payload into a subject/body string is business logic reserved
 * for a later phase (NotificationEngineDesign.md §7, §22).
 */
export interface INotificationTemplateRepository {
  create(input: CreateNotificationTemplateInput): Promise<NotificationTemplateDTO>;
  findById(id: string): Promise<NotificationTemplateDTO | null>;
  findActiveByKeyAndChannel(key: string, channel: NotificationChannel): Promise<NotificationTemplateDTO | null>;
  findMany(key?: string, channel?: NotificationChannel): Promise<NotificationTemplateDTO[]>;
  update(id: string, input: UpdateNotificationTemplateInput): Promise<NotificationTemplateDTO>;
}
