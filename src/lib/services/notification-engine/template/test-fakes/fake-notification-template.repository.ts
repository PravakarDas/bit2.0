import type { INotificationTemplateRepository } from "../../repositories";
import type { CreateNotificationTemplateInput, NotificationTemplateDTO, UpdateNotificationTemplateInput } from "../../dto";
import type { NotificationChannel } from "../../types/enums";

/**
 * In-memory fake of `INotificationTemplateRepository`, used ONLY by this
 * phase's tests — never the real, Prisma-backed repository (see
 * QueueEngineReport.md/WorkerRuntimeReport.md's "Testing" sections for why:
 * this project's only `DATABASE_URL` is a shared, live Neon instance a unit
 * test must never write to).
 */
export class FakeNotificationTemplateRepository implements INotificationTemplateRepository {
  readonly rows = new Map<string, NotificationTemplateDTO>();
  private idCounter = 0;

  async create(input: CreateNotificationTemplateInput): Promise<NotificationTemplateDTO> {
    const now = new Date();
    const row: NotificationTemplateDTO = {
      id: `tmpl_${++this.idCounter}`,
      key: input.key,
      channel: input.channel,
      subjectTemplate: input.subjectTemplate ?? null,
      bodyTemplateHtml: input.bodyTemplateHtml ?? null,
      bodyTemplateText: input.bodyTemplateText ?? null,
      version: input.version ?? 1,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(row.id, row);
    return row;
  }

  async findById(id: string): Promise<NotificationTemplateDTO | null> {
    return this.rows.get(id) ?? null;
  }

  async findActiveByKeyAndChannel(key: string, channel: NotificationChannel): Promise<NotificationTemplateDTO | null> {
    const matches = [...this.rows.values()].filter((r) => r.key === key && r.channel === channel && r.isActive);
    matches.sort((a, b) => b.version - a.version);
    return matches[0] ?? null;
  }

  async findMany(key?: string, channel?: NotificationChannel): Promise<NotificationTemplateDTO[]> {
    return [...this.rows.values()].filter((r) => (key === undefined || r.key === key) && (channel === undefined || r.channel === channel));
  }

  async update(id: string, input: UpdateNotificationTemplateInput): Promise<NotificationTemplateDTO> {
    const existing = this.rows.get(id);
    if (!existing) {
      throw new Error(`FakeNotificationTemplateRepository: no row with id ${id}`);
    }
    const updated = { ...existing, ...input, updatedAt: new Date() };
    this.rows.set(id, updated);
    return updated;
  }
}
