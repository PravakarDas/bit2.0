/**
 * Re-exports the 5 Prisma-generated enums that back the Notification Engine
 * tables (see prisma/schema.prisma, NotificationEngineDesign.md §31 and
 * DatabaseImplementationReport.md). These are NOT redefined here — Prisma
 * Client already generates a fully-typed enum for each; importing a fresh
 * copy from this module (instead of `@prisma/client` directly) just gives
 * the rest of this infrastructure layer one stable import path that doesn't
 * leak `@prisma/client` into every file, without duplicating the type.
 */
export {
  NotificationChannel,
  NotificationJobStatus,
  AttemptOutcome,
  NotificationProviderHealthStatus,
  DocumentStatus,
} from "@prisma/client";
