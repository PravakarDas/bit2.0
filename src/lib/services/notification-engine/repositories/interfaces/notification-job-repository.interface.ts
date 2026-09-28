import type {
  CreateNotificationJobInput,
  NotificationJobDTO,
  NotificationJobQueryCriteria,
  UpdateNotificationJobInput,
} from "../../dto";

/**
 * Data access for `NotificationJob`. Deliberately does NOT expose a
 * "claim next batch" / "lease" method — that atomic-claim + crash-recovery
 * semantics belongs to the queue worker (NotificationEngineDesign.md §5,
 * §8, §16, §19), a later phase. `findMany` here is a plain filtered read,
 * not a locking read.
 */
export interface INotificationJobRepository {
  create(input: CreateNotificationJobInput): Promise<NotificationJobDTO>;
  findById(id: string): Promise<NotificationJobDTO | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<NotificationJobDTO | null>;
  findMany(criteria?: NotificationJobQueryCriteria): Promise<NotificationJobDTO[]>;
  update(id: string, input: UpdateNotificationJobInput): Promise<NotificationJobDTO>;
}
