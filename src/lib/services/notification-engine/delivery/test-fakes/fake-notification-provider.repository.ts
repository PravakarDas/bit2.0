import type { INotificationProviderRepository } from "../../repositories";
import type {
  CreateNotificationProviderInput,
  NotificationProviderDTO,
  UpdateNotificationProviderHealthInput,
} from "../../dto";
import type { NotificationChannel } from "../../types/enums";
import { NotificationProviderHealthStatus } from "../../types/enums";

/**
 * In-memory fake of `INotificationProviderRepository` (Phase 2, unmodified —
 * this phase needed zero new repository methods) — used ONLY by this
 * module's tests, never the real Prisma-backed repository. Exercises the
 * "Mock repositories. Mock database. No database." testing requirement for
 * `providerDescriptorFromDTO()`/registry-hydration tests.
 */
export class FakeNotificationProviderRepository implements INotificationProviderRepository {
  readonly rows = new Map<string, NotificationProviderDTO>();
  private idCounter = 0;

  async create(input: CreateNotificationProviderInput): Promise<NotificationProviderDTO> {
    const now = new Date();
    const row: NotificationProviderDTO = {
      id: `prov_${++this.idCounter}`,
      channel: input.channel,
      name: input.name,
      priority: input.priority ?? 1,
      configEncrypted: input.configEncrypted,
      isActive: input.isActive ?? true,
      healthStatus: NotificationProviderHealthStatus.HEALTHY,
      consecutiveFailures: 0,
      lastFailureAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(row.id, row);
    return row;
  }

  async findById(id: string): Promise<NotificationProviderDTO | null> {
    return this.rows.get(id) ?? null;
  }

  async findActiveByChannelOrderedByPriority(channel: NotificationChannel): Promise<NotificationProviderDTO[]> {
    return [...this.rows.values()]
      .filter((row) => row.channel === channel && row.isActive)
      .sort((a, b) => a.priority - b.priority);
  }

  async updateHealth(id: string, input: UpdateNotificationProviderHealthInput): Promise<NotificationProviderDTO> {
    const existing = this.rows.get(id);
    if (!existing) {
      throw new Error(`FakeNotificationProviderRepository: no row with id ${id}`);
    }
    const updated = { ...existing, ...input, updatedAt: new Date() };
    this.rows.set(id, updated);
    return updated;
  }
}
