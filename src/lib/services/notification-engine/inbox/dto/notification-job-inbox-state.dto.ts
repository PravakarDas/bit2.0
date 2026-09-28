import type { NotificationJobInboxState } from "@prisma/client";

/** Read-model — identical to the Prisma row, same convention as every other `*DTO` in this module. */
export type NotificationJobInboxStateDTO = NotificationJobInboxState;

/** Which per-recipient UI flag a job-id lookup should filter on — see `INotificationInboxStateRepository.findJobIdsByFlag`. */
export type InboxStateFlag = "READ" | "ARCHIVED" | "DELETED";
