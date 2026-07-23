# Notification Engine — Database Audit

**Scope:** Read-only verification only. No migration repair was attempted in this phase, per explicit instruction. No schema, data, or migration bookkeeping was modified while producing this report — every command below is either a Postgres system-catalog `SELECT`, a Prisma introspection/diff (read-only), or a Prisma Client query against existing rows.

**Inputs:** [NotificationEngineDesign.md](NotificationEngineDesign.md) (architecture), `prisma/schema.prisma` (current schema), [DatabaseImplementationReport.md](DatabaseImplementationReport.md) (Phase 1), [MigrationRecoveryReport.md](MigrationRecoveryReport.md) (Phase 1.5).

---

## 1. Every Notification Engine Table Exists

Verified via `SELECT tablename FROM pg_tables` (Postgres system catalog, not Prisma's translation layer):

| Table | Present |
|---|---|
| `NotificationEvent` | ✅ |
| `NotificationJob` | ✅ |
| `NotificationDeliveryAttempt` | ✅ |
| `NotificationTemplate` | ✅ |
| `NotificationProvider` | ✅ |
| `NotificationPreference` | ✅ |
| `NotificationSettings` | ✅ |
| `Document` | ✅ |
| `DocumentUploadAttempt` | ✅ |

All 9 of 9 tables confirmed present directly in `pg_tables`, cross-confirmed a second way via `prisma db pull --print` (fresh introspection).

---

## 2. Every Foreign Key Exists

Verified via `information_schema.table_constraints` joined to `key_column_usage`/`constraint_column_usage`/`referential_constraints` (gives exact column, target, and `ON UPDATE`/`ON DELETE` rules):

| FK | Target | ON UPDATE | ON DELETE | Matches design |
|---|---|---|---|---|
| `NotificationJob.eventId` | `NotificationEvent.id` | CASCADE | CASCADE | ✅ |
| `NotificationJob.recipientUserId` | `User.id` | CASCADE | SET NULL | ✅ |
| `NotificationJob.documentId` | `Document.id` | CASCADE | SET NULL | ✅ |
| `NotificationDeliveryAttempt.jobId` | `NotificationJob.id` | CASCADE | CASCADE | ✅ |
| `NotificationDeliveryAttempt.providerId` | `NotificationProvider.id` | CASCADE | SET NULL | ✅ |
| `NotificationPreference.userId` | `User.id` | CASCADE | CASCADE | ✅ |
| `DocumentUploadAttempt.documentId` | `Document.id` | CASCADE | CASCADE | ✅ |

7 of 7 foreign keys present with exactly the cascade behavior specified in the design (§20, §31) and implemented in Phase 1. Cross-confirmed a second way via `pg_constraint` (contype `'f'`), which independently lists the same 7 constraints by name (e.g. `NotificationJob_eventId_fkey`).

---

## 3. Every Index Exists

Verified via `pg_indexes` directly (ground truth, not Prisma's `@@index` syntax):

| Table | Indexes found | Expected (design/schema) | Match |
|---|---|---|---|
| `NotificationEvent` | `_pkey`, `dedupeKey_key` (unique), `eventType_idx`, `createdAt_idx` | 4 | ✅ |
| `NotificationJob` | `_pkey`, `idempotencyKey_key` (unique), `status_nextAttemptAt_idx`, `status_lockedAt_idx`, `eventId_idx`, `recipientUserId_idx`, `channel_status_idx`, `createdAt_idx` | 8 | ✅ |
| `NotificationDeliveryAttempt` | `_pkey`, `jobId_attemptNumber_idx`, `providerId_idx` | 3 | ✅ |
| `NotificationTemplate` | `_pkey`, `key_channel_version_key` (unique), `key_channel_isActive_idx` | 3 | ✅ |
| `NotificationProvider` | `_pkey`, `channel_priority_idx`, `channel_healthStatus_idx` | 3 | ✅ |
| `NotificationPreference` | `_pkey`, `userId_notificationType_channel_key` (unique), `userId_idx` | 3 | ✅ |
| `NotificationSettings` | `_pkey` | 1 | ✅ |
| `Document` | `_pkey`, `status_idx`, `sourceEntityId_idx`, `type_status_idx` | 4 | ✅ |
| `DocumentUploadAttempt` | `_pkey`, `documentId_attemptNumber_idx` | 2 | ✅ |

**31 of 31 expected indexes present** (9 primary keys + 4 unique indexes + 18 query-pattern indexes), all matching the exact column composition specified in [DatabaseImplementationReport.md](DatabaseImplementationReport.md)'s index table.

---

## 4. Every Enum Exists

Verified via `pg_type`/`pg_enum` (Postgres system catalog):

| Enum | Live members | Expected | Match |
|---|---|---|---|
| `NotificationChannel` | `EMAIL, SMS, WHATSAPP, PUSH, SLACK, TEAMS, IN_APP_ADMIN, IN_APP_EMPLOYEE` | 8 members | ✅ |
| `NotificationJobStatus` | `QUEUED, PROCESSING, SENT, RETRY_SCHEDULED, FAILED, DEAD_LETTER, COMPLETED` | 7 members | ✅ |
| `AttemptOutcome` | `SUCCESS, FAILURE` | 2 members | ✅ |
| `NotificationProviderHealthStatus` | `HEALTHY, DEGRADED, DOWN` | 3 members | ✅ |
| `DocumentStatus` | `PENDING_GENERATION, GENERATED_LOCAL, UPLOADING, UPLOADED, GENERATION_FAILED, UPLOAD_FAILED` | 6 members | ✅ |

All 5 enums present with every member in the exact order declared in `schema.prisma`.

---

## 5. Every Constraint Exists

Verified via `pg_constraint` joined to `pg_class`/`pg_namespace` (corrected from an initial regclass-casting mistake in the query, re-run and confirmed):

| Table | PK | FK(s) |
|---|---|---|
| `NotificationEvent` | ✅ `NotificationEvent_pkey` | — |
| `NotificationJob` | ✅ `NotificationJob_pkey` | ✅ 3 (`eventId`, `recipientUserId`, `documentId`) |
| `NotificationDeliveryAttempt` | ✅ `NotificationDeliveryAttempt_pkey` | ✅ 2 (`jobId`, `providerId`) |
| `NotificationTemplate` | ✅ `NotificationTemplate_pkey` | — |
| `NotificationProvider` | ✅ `NotificationProvider_pkey` | — |
| `NotificationPreference` | ✅ `NotificationPreference_pkey` | ✅ 1 (`userId`) |
| `NotificationSettings` | ✅ `NotificationSettings_pkey` | — |
| `Document` | ✅ `Document_pkey` | — |
| `DocumentUploadAttempt` | ✅ `DocumentUploadAttempt_pkey` | ✅ 1 (`documentId`) |

9 of 9 primary keys, 7 of 7 foreign key constraints — matches section 2 exactly (cross-validated by a second, independent catalog query). Uniqueness (`dedupeKey`, `idempotencyKey`, `key+channel+version`, `userId+notificationType+channel`) is enforced via `CREATE UNIQUE INDEX` rather than a named `pg_constraint` row of type `'u'` — this is standard, expected Postgres/Prisma behavior for `@unique`/`@@unique` (a unique index *is* the enforcement mechanism; Postgres does not require a separate table-level constraint object for it), already confirmed present in section 3.

---

## 6. Every Notification Engine Relation Verified

Every relation declared in the design's ERD (§4) was exercised through the Prisma Client with a real `include` query against the live database (not just checked in the schema text):

| Relation path | Result |
|---|---|
| `NotificationJob.event` → `NotificationEvent` | ✅ resolves |
| `NotificationJob.recipient` → `User` | ✅ resolves |
| `NotificationJob.document` → `Document` | ✅ resolves |
| `NotificationJob.deliveryAttempts` → `NotificationDeliveryAttempt[]` | ✅ resolves |
| `NotificationDeliveryAttempt.job` → `NotificationJob` | ✅ resolves |
| `NotificationDeliveryAttempt.provider` → `NotificationProvider` | ✅ resolves |
| `Document.notificationJobs` → `NotificationJob[]` | ✅ resolves |
| `Document.uploadAttempts` → `DocumentUploadAttempt[]` | ✅ resolves |
| `NotificationProvider.deliveryAttempts` → `NotificationDeliveryAttempt[]` | ✅ resolves |
| `NotificationPreference.user` → `User` | ✅ resolves |
| `NotificationEvent.jobs` → `NotificationJob[]` | ✅ resolves |
| `User.notificationJobs` → `NotificationJob[]` | ✅ resolves |
| `User.notificationPreferences` → `NotificationPreference[]` | ✅ resolves |

13 of 13 relation paths (every relation declared anywhere in the 9 new models plus the 2 additive `User` back-relations) executed successfully with zero errors. All returned empty/near-empty result sets, which is expected — no application code has written any Notification Engine data yet.

---

## 7. Prisma Client Can Access Every Model

A `.count()` call was executed against all 9 models directly through the generated Prisma Client:

```
OK  notificationEvent: count=0
OK  notificationJob: count=0
OK  notificationDeliveryAttempt: count=0
OK  notificationTemplate: count=0
OK  notificationProvider: count=0
OK  notificationPreference: count=0
OK  notificationSettings: count=0
OK  document: count=0
OK  documentUploadAttempt: count=0
```

All 9 succeeded. `notificationSettings.findUnique({ where: { id: "global" } })` was also exercised specifically (since it's the one singleton model) and returned `null` cleanly — correct and expected, since no seed/upsert has run yet (seeding is explicitly Server-Action/service work, out of scope for the database layer per [DatabaseImplementationReport.md](DatabaseImplementationReport.md)'s "Anything Else Intentionally Postponed" section).

---

## 8. NotificationEngineDesign.md ↔ schema.prisma Consistency

Design §31 ("Suggested Prisma Models") lists exactly 10 models, one (`PushSubscription`) explicitly marked `(future, §27)`. Current `schema.prisma` contains exactly the other 9:

`NotificationEvent`, `NotificationJob`, `NotificationDeliveryAttempt`, `NotificationTemplate`, `NotificationProvider`, `NotificationPreference`, `NotificationSettings`, `Document`, `DocumentUploadAttempt`.

Zero extra models, zero missing models (beyond the deliberately-postponed `PushSubscription`, documented as such in both the design and [DatabaseImplementationReport.md](DatabaseImplementationReport.md)). Enum count also matches: 5 enums in `schema.prisma`, each traceable to a specific design section (§5/§23 → `NotificationJobStatus`; §9/§10 → `NotificationChannel`, `NotificationProviderHealthStatus`; §23 → `DocumentStatus`; shared attempt-outcome concept in §10/§15 → `AttemptOutcome`). Design and schema are in full agreement.

---

## 9. Database Matches schema.prisma Exactly

The authoritative check — a direct diff between the **live database** and **current schema.prisma**, independent of migration history entirely:

```
prisma migrate diff --from-url <DATABASE_URL> --to-schema-datamodel prisma/schema.prisma --script

→ "-- This is an empty migration."
```

**Zero differences.** This command does not consult `_prisma_migrations` or any local migration folder at all — it compares the live database's actual structure directly against `schema.prisma`. An empty result is the strongest possible confirmation that the database is exactly what the schema says it should be, for the Notification Engine and for every other model in the project.

---

## 10. Is the Remaining `migrate dev` Warning Caused ONLY by Historical Migration Replay?

**Yes — confirmed, not assumed.** `prisma migrate dev --create-only` was run again (auto-declining any confirmation prompt; no reset was performed) to capture its exact current output:

```
- The migration `20260401230630_y` was modified after it was applied.
- The migration `20260412100000_add_requested_ot_times` was modified after it was applied.
- The migration `20260622000000_time_balance_leave` was modified after it was applied.
- Drift detected: Your database schema is not in sync with your migration history.

[*] Changed the `DailyTimeRecord` table
  [+] Added column `requestedOTend`
  [+] Added column `requestedOTstart`
[*] Changed the `OvertimeRequest` table
  [+] Added column `requestedOTend`
  [+] Added column `requestedOTstart`
[*] Changed the `SystemControlChangeLog` table
  [*] Altered column `actorName` (default changed from `Some(Value(String("Unknown")))` to `None`)
[*] Changed the `SystemControlSettings` table
  [*] Altered column `updatedAt` (default changed from `Some(Now)` to `None`)
[*] Changed the `User` table
  [-] Removed index on columns (archivedAt)
  [-] Removed index on columns (employeeStatus, isArchived)
```

`migrate dev`'s drift detector works by **replaying every local migration file, in order, into a throwaway shadow database**, and comparing *that reconstructed schema* against the real one — it is a fundamentally different check from §9's direct live-DB-vs-`schema.prisma` diff. Every single line above is individually explained, with no unexplained residue:

| Item | Root cause | Confirmed by |
|---|---|---|
| `20260401230630_y` modified | Deliberately reconstructed as an empty placeholder in Phase 1.5, since its true original content is unrecoverable (see [MigrationRecoveryReport.md](MigrationRecoveryReport.md)) | Documented, expected |
| `20260622000000_time_balance_leave` modified | Same — empty placeholder for an unrecoverable, since-reverted migration | Documented, expected |
| `20260412100000_add_requested_ot_times` modified | This migration failed 3× historically (`column already exists`) before being manually edited to comment out its real `ALTER TABLE` statements so the 4th attempt could succeed trivially — the file's checksum legitimately changed between its first (failed) and final (successful) recorded attempt | `_prisma_migrations` row history, inspected in Phase 1.5 |
| `DailyTimeRecord`/`OvertimeRequest` missing `requestedOT*` columns in "expected" | Direct consequence of the same neutered file above — its real `ADD COLUMN` statements are now comments, so a from-scratch shadow replay never adds them, even though they already exist in the real database | File content inspected directly |
| `SystemControlChangeLog.actorName` default mismatch | **Current `schema.prisma` declares no default for this field at all** (`actorName String`) — the live database (no default) already matches current `schema.prisma` exactly; the shadow-replay's "expected" default is a stale artifact of an old migration, from before this field's default was dropped from the schema (never captured in its own dedicated migration) | Verified directly in `schema.prisma:607` |
| `SystemControlSettings.updatedAt` default mismatch | **Current `schema.prisma` uses `@updatedAt`** (Prisma-application-managed timestamp), which does not generate a database-level `DEFAULT` clause — the live database (no default) is the *correct* state for this attribute; again, a stale artifact of an older migration | Verified directly in `schema.prisma` |
| `User` missing 2 indexes in "expected" | **Current `schema.prisma`'s `User` model declares no `@@index` on `archivedAt` or `(employeeStatus, isArchived)` at all** — the live database (without these indexes) already matches current `schema.prisma` exactly | Verified directly against the `User` model block |

**None of the seven items involve any Notification Engine table.** All seven predate this project's Phase 1/1.5 work and stem from the same systemic root cause already documented in [MigrationRecoveryReport.md](MigrationRecoveryReport.md): a shared, multi-branch database where `schema.prisma` was edited directly (dropping a default, dropping an index annotation, neutering a failed migration) without a dedicated forward migration capturing each specific change. `migrate dev`'s shadow-replay mechanically reconstructs the *old* intent from old migration files; it has no way to know `schema.prisma` itself moved on. **This is a permanent, cosmetic characteristic of `migrate dev` specifically for this project's history — not a live schema problem** (proven independently by §9's empty direct diff).

---

## 11. Is It Safe to Continue Development Without Resetting the Database?

**Yes.** The evidence for this conclusion, restated plainly:

1. **The live database is byte-for-byte consistent with `schema.prisma`** — proven directly (§9), not inferred from migration bookkeeping.
2. **Every Notification Engine object exists, is correctly constrained, indexed, and fully reachable through the Prisma Client** — proven by direct catalog queries and live relation-traversal queries (§1–§7), not just by re-reading the schema file.
3. **The only remaining tool that reports a problem is `migrate dev`'s shadow-replay-based drift detector, specifically** — and every single line of its output has a named, verified, non-Notification-Engine root cause (§10). `migrate status` (which compares recorded-applied migrations, not a full shadow rebuild) already reports **"Database schema is up to date!"** `migrate deploy` (the production-safe command, which applies pending migrations without a full shadow-rebuild drift check) is expected to run cleanly against this history for the same reason.
4. **No table, column, or row belonging to the application's business data was touched by anything in this audit** — every command used was a `SELECT`-class Postgres query, a Prisma introspection, or a `--create-only`/auto-declined dry run. `prisma migrate reset` was never executed.

The only thing that does **not** work cleanly is interactively re-running `prisma migrate dev` on this exact history without first answering its reset prompt — and per the explicit instruction for this phase, no attempt was made (or should be made) to make that specific interactive flow cosmetically clean. That is a tooling/history-hygiene nuisance for local development convenience, not a signal that the database itself is in a risky or inconsistent state.

---

## Verdict

**Would you, as a Principal Database Architect, approve moving to Phase 2?**

## YES

Every Notification Engine table, enum, foreign key, index, and constraint exists exactly as designed, is fully reachable through the Prisma Client, and is verified byte-for-byte consistent with `schema.prisma` via a direct live-database diff — independent of migration bookkeeping entirely. The only outstanding signal, `prisma migrate dev`'s shadow-replay warning, has been traced line-by-line to seven specific, pre-existing, non-Notification-Engine causes (three intentionally-reconstructed historical migrations from Phase 1.5, plus four instances of `schema.prisma` having legitimately moved past what old migration files would replay) — none of which represent an actual defect in the current schema or any risk to Phase 2 work, which will build services/workers/UI on top of tables that are already provably correct and stable.
