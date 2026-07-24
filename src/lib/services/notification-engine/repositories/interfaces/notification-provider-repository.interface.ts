import type {
  CreateNotificationProviderInput,
  NotificationProviderDTO,
  UpdateNotificationProviderHealthInput,
} from "../../dto";
import type { NotificationChannel } from "../../types/enums";

/**
 * Data access for `NotificationProvider`. `findActiveByChannelOrderedByPriority`
 * is a plain sorted read (`WHERE channel=? AND isActive ORDER BY priority`) —
 * it does not implement the circuit-breaker/cooldown *decision* of whether a
 * degraded provider should be skipped this tick; that logic is reserved for
 * the future SMTP failover implementation (NotificationEngineDesign.md §10).
 */
export interface INotificationProviderRepository {
  create(input: CreateNotificationProviderInput): Promise<NotificationProviderDTO>;
  findById(id: string): Promise<NotificationProviderDTO | null>;
  findActiveByChannelOrderedByPriority(channel: NotificationChannel): Promise<NotificationProviderDTO[]>;
  updateHealth(id: string, input: UpdateNotificationProviderHealthInput): Promise<NotificationProviderDTO>;
}
