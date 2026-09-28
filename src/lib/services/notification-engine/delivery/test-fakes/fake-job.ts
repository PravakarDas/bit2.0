import type { NotificationJobDTO } from "../../dto";

/** Shared job fixture for this module's tests — same shape already used by worker/job-dispatcher.test.ts etc. */
export function fakeJob(overrides: Partial<NotificationJobDTO> = {}): NotificationJobDTO {
  const now = new Date();
  return {
    id: "job_1",
    eventId: "evt_1",
    channel: "EMAIL",
    recipientUserId: null,
    recipientAddress: "jane@example.com",
    idempotencyKey: "key_1",
    status: "PROCESSING",
    attemptCount: 0,
    maxAttempts: 5,
    nextAttemptAt: now,
    lockedAt: now,
    lockedBy: "worker-1",
    documentId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
