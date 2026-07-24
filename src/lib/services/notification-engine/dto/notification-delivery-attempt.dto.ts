import type { NotificationDeliveryAttempt } from "@prisma/client";

export type NotificationDeliveryAttemptDTO = NotificationDeliveryAttempt;

export type CreateNotificationDeliveryAttemptInput = Pick<
  NotificationDeliveryAttempt,
  "jobId" | "attemptNumber" | "outcome"
> &
  Partial<Pick<NotificationDeliveryAttempt, "providerId" | "errorCode" | "errorMessage">>;
