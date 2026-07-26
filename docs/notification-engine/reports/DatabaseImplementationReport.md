# Database Implementation Report — Notification Engine (Phase 1: Database Foundation)

**Status:** Database layer only. No worker, service, Server Action, or UI code was written — per the Phase 1 scope, this report covers `prisma/schema.prisma` changes and their application to the database only.

**Source of truth followed:** [NotificationEngineDesign.md](NotificationEngineDesign.md), specifically §31 (Suggested Prisma Models). No architecture decisions from that document were changed; this report records implementation-level choices made while translating its ERD (§4) into concrete Prisma syntax, and one operational deviation forced by pre-existing database state (see [Migration Summary](#migration-summary)).

---

## New Tables

Nine models were added, all under a new "Notification Engine" section appended to the end of `prisma/schema.prisma`:

| Table | Purpose | Design reference |
|---|---|---|
| `NotificationEvent` | Durable, idempotent record of "a notifiable thing happened." | §6 |
| `NotificationJob` | One unit of delivery work: one recipient, one channel, one event. Owns the queue/retry/crash-recovery state. | §5, §16, §19, §23 |
| `NotificationDeliveryAttempt` | Immutable per-attempt log (one row per provider tried per job attempt). | §3, §10 |
| `NotificationTemplate` | Versioned subject/body content per event type per channel (append-style history, like `BaseSalary`). | §7, §22 |
| `NotificationProvider` | One configured delivery account (SMTP account today; other channels later) with failover priority and health tracking. | §9, §10 |
| `NotificationPreference` | Per-user opt-in/opt-out for a notification type + channel combination. | §6, §31 |
| `NotificationSettings` | Singleton runtime configuration (`id: "global"`, same pattern as `SystemControlSettings`/`EmailConfig`). | §16, §25, §36, §40 |
| `Document` | One generated file's lifecycle: local generation → Google Drive upload. | §11–§15 |
| `DocumentUploadAttempt` | Immutable per-attempt log for Drive uploads. | §15 |

**Not implemented — see [Future Tables](#future-tables--intentionally-postponed) for why.**

---

## Modified Tables

**`User` — the only existing table touched, and only at the `schema.prisma` level.**

Two relation array fields were added to the `User` model block:

```
notificationJobs        NotificationJob[]
notificationPreferences NotificationPreference[]
```

**Why this was necessary:** Prisma requires both sides of a one-to-many relation to be declared in the schema — `NotificationJob.recipientUserId`/`NotificationPreference.userId` each declare a `@relation(fields: ..., references: [id])` pointing at `User`, and Prisma's schema validator rejects the file unless `User` declares the corresponding back-relation array. This is a **schema-file-only, type-level addition** — verified against the live database via read-only introspection (`prisma db pull --print`) after the migration was applied: the `User` table gained **zero new columns**. The two lines above compile to Prisma Client types only; the actual foreign keys live entirely on `NotificationJob.recipientUserId` and `NotificationPreference.userId`, in the new tables.

No other existing model (`AdminNotification`, `EmployeeNotification`, `EmailConfig`, `SystemControlSettings`, `SystemAudit`, or any business table) was modified, per the design's explicit "deliberately not modified" list (design §31) and the task's own constraint to avoid touching existing tables without a stated reason.

---

## New Enums

| Enum | Members | Used by |
|---|---|---|
| `NotificationChannel` | `EMAIL`, `SMS`, `WHATSAPP`, `PUSH`, `SLACK`, `TEAMS`, `IN_APP_ADMIN`, `IN_APP_EMPLOYEE` | `NotificationJob.channel`, `NotificationTemplate.channel`, `NotificationProvider.channel`, `NotificationPreference.channel` |
| `NotificationJobStatus` | `QUEUED`, `PROCESSING`, `SENT`, `RETRY_SCHEDULED`, `FAILED`, `DEAD_LETTER`, `COMPLETED` | `NotificationJob.status` — matches the state machine in design §5/§23 exactly |
| `AttemptOutcome` | `SUCCESS`, `FAILURE` | Shared by `NotificationDeliveryAttempt.outcome` **and** `DocumentUploadAttempt.outcome` — both are semantically identical "did this one try work" outcomes, so one enum is reused rather than declaring two near-duplicate types. This is an implementation-level simplification, not an architecture change. |
| `NotificationProviderHealthStatus` | `HEALTHY`, `DEGRADED`, `DOWN` | `NotificationProvider.healthStatus` — matches the provider health state machine in design §23 |
| `DocumentStatus` | `PENDING_GENERATION`, `GENERATED_LOCAL`, `UPLOADING`, `UPLOADED`, `GENERATION_FAILED`, `UPLOAD_FAILED` | `Document.status` — matches the Document state machine in design §23 exactly |

**Naming convention check:** all five follow the existing project convention exactly — PascalCase type name, `SCREAMING_SNAKE_CASE` members (matches `LoanStatus`, `DailyRecordStatus`, `ClaimStatus`, etc. per [CONTRIBUTING.md](CONTRIBUTING.md#prisma-model--enum-naming)). All channel/status/health "fixed vocabulary" fields were made enums (not free strings), matching the majority pattern in this schema (`Role`, `LoanStatus`, `ClaimStatus`, `DailyRecordStatus`, `NotificationStatus`).

**Deliberately kept as plain `String`, not enums** (and why): `NotificationEvent.eventType`, `NotificationTemplate.key`, `NotificationPreference.notificationType`, and `Document.type`. Each represents an open-ended, growing catalog of business-domain values (e.g. `"LOAN_APPROVED"`, `"PAYROLL_RUN"`, `"PAYSLIP"`) that new domains will add to over time without a schema migration — this exactly matches the existing precedent of `EmployeeNotification.type` being a plain `String` (documented in [DATABASE.md](DATABASE.md#notifications--breaking-notices): *"type (plain String, not an enum) ... e.g. AUTO_LEAVE_DEDUCTION"*) rather than the existing `NotificationType` enum used by `AdminNotification`. Turning these into enums would require a migration every time any domain (loan, leave, payroll, overtime, ...) wants to raise a new event type — directly contradicting the extensibility goal stated in design §6.

---

## New Indexes

All indexes were chosen to match the two hot query patterns the design calls out explicitly (worker claim and crash-recovery reaper — design §8, §19), plus the dashboard filter patterns from §37/§39, following this project's existing convention of explicit composite `@@index`/`@@unique` declarations (see `TimelineModificationRequest`, `BreakingNoticeRecipient` in [DATABASE.md](DATABASE.md) for precedent).

| Table | Index | Reason |
|---|---|---|
| `NotificationEvent` | `@@unique([dedupeKey])` | First layer of duplicate prevention (design §17) |
| `NotificationEvent` | `@@index([eventType])` | Resolver/dashboard filter by event type |
| `NotificationEvent` | `@@index([createdAt])` | Retention cron / date-range dashboard filter |
| `NotificationJob` | `@@unique([idempotencyKey])` | Second layer of duplicate prevention (design §17) |
| `NotificationJob` | `@@index([status, nextAttemptAt])` | **Hottest query in the whole engine** — the worker's claim query (`status='QUEUED' AND nextAttemptAt <= now()`), polled every ~10s per design §8 |
| `NotificationJob` | `@@index([status, lockedAt])` | Crash-recovery reaper sweep (`status='PROCESSING' AND lockedAt < threshold`), design §19 |
| `NotificationJob` | `@@index([eventId])` | FK lookup — "all jobs for this event" |
| `NotificationJob` | `@@index([recipientUserId])` | FK lookup — dashboard "jobs for this user", manager-scoped filtering (design §38) |
| `NotificationJob` | `@@index([channel, status])` | Notification Center dashboard filter (design §39) |
| `NotificationJob` | `@@index([createdAt])` | Date-range dashboard filter, retention cron |
| `NotificationDeliveryAttempt` | `@@index([jobId, attemptNumber])` | Ordered attempt-history retrieval per job (design §39 drill-down dialog) |
| `NotificationDeliveryAttempt` | `@@index([providerId])` | FK lookup — provider health/failure analysis |
| `NotificationTemplate` | `@@unique([key, channel, version])` | Prevents duplicate version numbers for the same template |
| `NotificationTemplate` | `@@index([key, channel, isActive])` | Hot "get the active template for this key+channel" lookup during rendering |
| `NotificationProvider` | `@@index([channel, priority])` | Hot "get providers for this channel, ordered by failover priority" lookup (design §9, §10) |
| `NotificationProvider` | `@@index([channel, healthStatus])` | Filtering out `DOWN` providers before the priority sort |
| `NotificationPreference` | `@@unique([userId, notificationType, channel])` | One preference row per user/type/channel combination (matches `UserLeaveEntitlement`'s `@@unique([userId, leaveTypeId, year])` pattern) |
| `NotificationPreference` | `@@index([userId])` | FK lookup during recipient/channel resolution (design §6) |
| `Document` | `@@index([status])` | Document Worker claim queries (design §12, §13, §35) |
| `Document` | `@@index([sourceEntityId])` | Lookup "documents for this domain entity" |
| `Document` | `@@index([type, status])` | Dashboard/reporting filter by document type + status |
| `DocumentUploadAttempt` | `@@index([documentId, attemptNumber])` | Ordered upload-attempt history per document |

No index was added speculatively beyond what a described query pattern in the design justifies — e.g. `NotificationProvider.name` and `Document.driveFileId` have no index, since no read pattern in the design filters/sorts by those fields.

---

## Migration Summary

### What was generated

An **offline schema-to-schema diff** (`prisma migrate diff --from-schema-datamodel <pre-change schema.prisma> --to-schema-datamodel <post-change schema.prisma> --script`) was used to produce the migration SQL. This command never connects to the database — it computes the diff purely between two local `.prisma` files — so the SQL was fully reviewed before anything touched the live database.

The generated SQL (now committed at `prisma/migrations/20260722000000_add_notification_engine_foundation/migration.sql`) contains **only**:
- 5 `CREATE TYPE ... AS ENUM`
- 9 `CREATE TABLE`
- 22 `CREATE INDEX`/`CREATE UNIQUE INDEX`
- 7 `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY`

**Zero `DROP`, zero `ALTER COLUMN`, zero modification to any existing table's structure.** This was confirmed by inspecting the full SQL file before it was applied.

### The drift blocker (important — read before running any further `prisma migrate` command against this database)

Running the normal, sanctioned workflow (`prisma migrate dev --create-only`, per [SETUP.md](SETUP.md)/[DATABASE.md](DATABASE.md)'s documented process) failed because Prisma detected **pre-existing drift between the live Neon database and the local `prisma/migrations/` history — unrelated to this task**:

- Two migrations are recorded as applied to the database but have **no corresponding folder** in `prisma/migrations/`: `20260401230630_y` and `20260622000000_time_balance_leave`. The latter matches the `[[time-balance-leave-design]]` memory note that this feature's database data was previously wiped.
- Migration `20260514000000_add_employee_note_table` is recorded as **failed**.
- Migration `20260412100000_add_requested_ot_times` was **modified after being applied** (its recorded checksum no longer matches the file on disk).
- Several column/index-level differences exist between what the tracked migrations would produce and the live schema (e.g. `SystemControlSettings.zktecoCronMode`/`zktecoIntervalMinutes` present in the DB but not reflected in a migration that predates `20260613000000_add_zkteco_sync_mode`; `User` missing two indexes the migration history implies should exist).

**Prisma's own suggested remediation for this state is `prisma migrate reset`, which drops the entire database.** This command was **not run**. Per this project's own documented policy (`CLAUDE.md`, `TROUBLESHOOTING.md`, and the `[[feedback-prisma-db-push-safety]]` memory of a prior real data-loss incident from exactly this command), it must never be run against this database without explicit authorization, and even then only with extreme caution — and it was not needed here since the actual new-table work has nothing to do with the pre-existing drift.

**Resolution chosen (user-selected, after presenting three options):** the reviewed, pure-additive SQL was applied directly via `prisma db execute --file <migration.sql> --schema prisma/schema.prisma` — a command that executes exactly the given SQL and does **not** touch or depend on the `_prisma_migrations` bookkeeping table or the drift-detection logic at all. This got the new tables live without resolving, masking, or interacting with the pre-existing drift in any way.

**Consequence to be aware of:** because this migration was applied via `db execute` rather than `migrate dev`/`deploy`, it is **not** recorded in the database's `_prisma_migrations` table. The next time anyone runs `prisma migrate dev` or `prisma migrate deploy` against this database, Prisma will still report the original pre-existing drift (unchanged by this work) **and** will not know that `20260722000000_add_notification_engine_foundation` has already been applied — it will likely try to re-run it, which would fail on `CREATE TABLE`/`CREATE TYPE` already existing. **Before running any `prisma migrate` command in the future, run `prisma migrate resolve --applied 20260722000000_add_notification_engine_foundation` first** (a bookkeeping-only, non-destructive command) once the broader pre-existing drift has also been reconciled. This report intentionally leaves that broader reconciliation undone — it was explicitly out of scope for this task and requires a decision only the project owner can make (e.g. whether the two untracked migrations should be recovered from another branch/machine, or whether the live schema should be treated as authoritative going forward).

### Verification performed

After applying the SQL, a **read-only** introspection (`prisma db pull --print`, which prints the live schema to stdout without writing any file) confirmed:
- All 9 new tables exist with the exact columns, defaults, and nullability specified in `schema.prisma`.
- All 5 new enum types exist with the exact members specified.
- All foreign keys resolved correctly (`NotificationJob → NotificationEvent/User/Document`, `NotificationDeliveryAttempt → NotificationJob/NotificationProvider`, `NotificationPreference → User`, `DocumentUploadAttempt → Document`).
- All 22 indexes are present.
- `User` gained the two expected relation arrays and **no new physical columns**.

`prisma generate` was also run afterward so the Prisma Client's generated TypeScript types include the new models — this is type-generation only (reads `schema.prisma`, writes generated code under `node_modules/.pnpm/@prisma+client.../`), not an application-code change.

---

## Performance Considerations

- **Worker claim query is the dominant access pattern** (`NotificationJob` polled every ~10s per design §8) and is covered by a dedicated composite index (`status, nextAttemptAt`) so it never falls back to a sequential scan as the table grows — this was the single most important index decision in this schema.
- **Append-only/log tables have minimal indexing**: `NotificationDeliveryAttempt` and `DocumentUploadAttempt` only index the columns actually queried (`jobId`/`documentId` + `attemptNumber` for ordered history, `providerId` for provider-failure analysis) — no index was added on `attemptedAt` alone since no described query pattern filters by timestamp independent of its parent job/document.
- **Retention is a first-class design concern, not an afterthought** (design §25, §36): `NotificationJob`/`NotificationDeliveryAttempt` are expected to be the highest-volume tables in this domain. The `createdAt` index on `NotificationJob` exists specifically to support the future retention cron's bulk deletes efficiently. No partitioning was introduced — consistent with this project having no existing partitioning/read-replica strategy anywhere else in the schema (per [DECISIONS.md](DECISIONS.md#prisma--postgresql-as-the-only-datastore)); if notification volume ever grows large enough to need it, that would be a deliberate future decision, not something to speculatively build now.
- **`Json?` fields** (`NotificationEvent.payload`) are unindexed, matching the existing precedent for `AdminNotification.metadata`/`LeaveAuditLog.metadata` — no query pattern in the design filters by payload contents; if one emerges later, a GIN index would be the appropriate addition at that time, not now.
- **Money/duration conventions were not needed** in this domain (no currency or `HH:MM` duration fields exist in the notification engine's data), so those two documented risk areas in [DECISIONS.md](DECISIONS.md) don't apply here.
- **Optimistic locking was evaluated and deliberately not added** (a possible reading of task item 11): the design's crash-recovery/claim mechanism (§19, §25) already achieves safe concurrent claiming through a conditional status-guarded update (`UPDATE ... WHERE status = 'QUEUED'`, checking rows-affected) rather than a dedicated `version` column — this is sufficient for the stated single-worker requirement and remains correct if a second worker is ever introduced (per design §25), so a separate optimistic-lock field would be redundant machinery.

---

## Future Tables — Intentionally Postponed

| Table | Why postponed | Design reference |
|---|---|---|
| `PushSubscription` | Explicitly marked `(future, §27)` in the design's own Suggested Prisma Models table — it belongs to the Push Notification channel, which is scoped to a later rollout phase (design §42, Phase 5), not the email-only Phase 1 this schema foundation supports. Its exact shape (`endpoint`/`token`, `platform`) depends on a provider choice (Firebase Cloud Messaging vs. Web Push) that design §44 lists as an open question requiring product sign-off — building the table now would risk guessing a shape that needs to change once that decision is made. |

No other model from design §31 was postponed — all nine non-`PushSubscription` models were implemented in this phase, since the report's own future-tables framing only meaningfully applies to a model the design itself flagged as belonging to a later phase.

---

## Anything Else Intentionally Postponed

- **Backfilling `NotificationProvider` from the existing `EmailConfig` row.** Design §43 recommends this as a "Phase 1 cleanup task," not a schema-foundation task — it's a data migration/seeding concern that belongs with the service-layer work (explicitly out of scope here, per the task's "DO NOT build services" constraint), not the DDL layer.
- **Seeding a default `NotificationSettings` row.** The singleton pattern (`id: "global"`) established by `SystemControlSettings`/`EmailConfig` relies on an application-level `upsert` (`getOrCreateSystemControlSettings`-style helper) to create the row on first read, not a migration-time seed — no such helper exists yet since building it is Server Action/service work, explicitly excluded from this phase.
- **Resolving the pre-existing migration drift** (`20260401230630_y`, `20260622000000_time_balance_leave`, the failed/modified migration records). Explicitly out of scope for this task and requires a decision only the project owner can make — documented in detail under [Migration Summary](#migration-summary) above so it isn't lost.
- **Registering this migration in `_prisma_migrations`.** Deferred until the broader drift is reconciled (see the "Consequence to be aware of" note above) — attempting to register it in isolation, while the surrounding drift is unresolved, risks creating a second, harder-to-diagnose inconsistency.
- Every item explicitly excluded by the task's own "DO NOT" list (queue worker, SMTP engine, services, UI, Server Actions, `NotificationService`, Google Drive integration, PDF generation, template rendering, cron registration, retry logic, email sending) — none of these were touched. `src/instrumentation.ts` was not modified.

---

## Naming & Convention Consistency Checklist

| Check | Result |
|---|---|
| Model names PascalCase singular, matching table names 1:1 (no `@@map`) | ✅ (`NotificationEvent`, `NotificationJob`, etc.) |
| Enum names PascalCase, members `SCREAMING_SNAKE_CASE` | ✅ |
| Field names camelCase | ✅ |
| `id String @id @default(cuid())` for all non-singleton models | ✅ |
| `id String @id @default("global")` for the one singleton (`NotificationSettings`), matching `SystemSettings`/`SystemControlSettings`/`EmailConfig` exactly | ✅ |
| `createdAt DateTime @default(now())` on every model | ✅ |
| `updatedAt DateTime @updatedAt` on mutable models only; omitted on append-only log tables (`NotificationEvent`, `NotificationDeliveryAttempt`, `DocumentUploadAttempt`) — matching the existing `WalletTransaction`/`Payment`/`AuditLog` precedent | ✅ |
| Explicit `onDelete` chosen deliberately per relation (`Cascade` for true parent/child log rows; `SetNull` for optional references where history should outlive the referenced row) rather than left to Prisma/Postgres defaults | ✅ |
| No soft-delete (`deletedAt`) field added — this domain's "deactivate without deleting" needs are served by `isActive`/`isEnabled` booleans, matching the majority pattern (`AllowanceType.isActive`, `BonusType.isActive`) rather than the `EmployeeNote`-only `deletedAt` pattern | ✅ (deliberate) |
| Named `@relation("...")` strings used only where a model has 2+ relations to the same target | ✅ (none needed — every new relation is a single FK to its target) |
| Plain-string, non-FK references used only where an existing precedent justifies it (`AuditLog.userId`, `TimelineModificationActionLog.dailyTimeRecordId`) | ✅ (`NotificationEvent.triggeredByUserId`, `Document.sourceEntityId`) |
| PostgreSQL compatibility | ✅ — schema validated (`prisma validate`), formatted (`prisma format`), and the generated SQL applied successfully against live PostgreSQL 17 (Neon) |
| Prisma compatibility | ✅ — `prisma generate` succeeded against the updated schema with zero errors |

---

## Files Changed / Added

| File | Change |
|---|---|
| `prisma/schema.prisma` | Added 5 enums, 9 models, 2 relation fields on `User` |
| `prisma/migrations/20260722000000_add_notification_engine_foundation/migration.sql` | New — the applied SQL, with a header comment explaining its out-of-band application (see Migration Summary) |
| `DatabaseImplementationReport.md` | This file |

No other file was created or modified. No `src/` code exists for this feature yet.
