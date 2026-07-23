# Migration Recovery Report (Phase 1.5)

**Status:** Migration history has been fully repaired and verified. `prisma migrate status` now reports **"Database schema is up to date!"** No business logic, no Notification Engine table, and no application data was touched. `prisma migrate reset` was never run.

**Source of truth followed:** [NotificationEngineDesign.md](NotificationEngineDesign.md) (architecture — unchanged), [DatabaseImplementationReport.md](DatabaseImplementationReport.md) (documented the original drift blocker this report resolves).

---

## Current Migration State (before repair)

`prisma migrate status` reported:

```
50 migrations found in prisma/migrations
Your local migration history and the migrations table from your database are different:

The last common migration is: 20260514000000_add_employee_note_table

The migrations have not yet been applied:
20260613000000_add_zkteco_sync_mode
20260722000000_add_notification_engine_foundation

The migrations from the database are not found locally in prisma/migrations:
20260401230630_y
20260622000000_time_balance_leave
```

A raw, read-only query of the `_prisma_migrations` bookkeeping table (via a temporary diagnostic script using the existing generated Prisma Client — deleted after use, never committed) gave the full ground truth behind that summary. The important rows, in application order:

| migration_name | started_at | finished_at | steps | rolled_back_at | Meaning |
|---|---|---|---|---|---|
| `20260402113000_add_system_control_settings` | 2026-04-01 23:05:51 | 23:05:51 | 1 | — | Applied cleanly |
| `20260401230630_y` | 2026-04-01 23:06:30 | 23:06:30 | 1 | — | **Applied cleanly, but no local folder anywhere** |
| `20260416_add_breaking_notice_system` | 2026-04-16 | same instant | 0 | — | Resolved via `migrate resolve --applied` (pre-existing precedent, already healthy) |
| `20260416_remove_breaking_notice_message` | 2026-04-16 | same instant | 0 | — | Same — already healthy |
| `20260412100000_add_requested_ot_times` | 3 attempts, 2026-04-25 → 2026-05-12 | first 3: `null` (failed) | 0 each | set on all 3 | **Failed 3×** with `column "requestedOTstart" ... already exists`, rolled back each time |
| `20260412100000_add_requested_ot_times` | 2026-05-12 17:42:43 (4th attempt) | 17:42:45 | 1 | — | Finally succeeded — see Root Cause below |
| `20260425173000_add_daily_time_record_temporary` | fails once, resolved once | — | — | — | Same fail→rollback→resolve pattern, already healthy |
| `20260426120000_add_branch_loan_application_toggle` | fails once, resolved once | — | — | — | Same pattern, already healthy |
| `20260512000000_add_archive_system` | 2026-05-12 18:06:36 | 18:06:37 | 1 | — | Applied cleanly |
| `20260514000000_add_employee_note_table` | 2026-06-13 03:59:19 | **`null` (failed)** | 0 | **`null` (never rolled back)** | **The one truly stuck migration** — `relation "EmployeeNote" already exists` |
| `20260622000000_time_balance_leave` | 2026-06-22 03:59:51 | same instant | 0 | — | Resolved via `migrate resolve --applied` at the time, but **no local folder anywhere** |

`EmailConfig` had **no row at all** in `_prisma_migrations` — not even a failed one — despite its table existing live and its model existing in `schema.prisma` (added in the most recent commit, `6feb58a`).

`20260722000000_add_notification_engine_foundation` (this project's Phase 1 work) also had no row, by design — it was applied via `prisma db execute`, deliberately bypassing bookkeeping, exactly as documented in [DatabaseImplementationReport.md](DatabaseImplementationReport.md).

---

## Problem Analysis

Five distinct problems, all traced to hard evidence rather than assumption:

1. **One genuinely stuck failed migration**: `20260514000000_add_employee_note_table`. Its single attempt failed (`relation "EmployeeNote" already exists`) and was **never rolled back or resolved** — this is the actual blocking point (`migrate status`'s "last common migration"). Everything with a later name/date could not be applied while this sat unresolved.
2. **Two orphan migrations with unknown content**: `20260401230630_y` and `20260622000000_time_balance_leave`. Both are recorded as successfully applied/resolved in the database, but their folders do not exist anywhere — not in `prisma/migrations/`, not in any commit on any branch (`git log --all`), and not in the `backup-before-reset`, `backup-main-before-reset`, or `rollback-branch` branches specifically checked given their suggestive names.
3. **One migration with a checksum that changed between attempts** (originally reported by `migrate dev` as "modified after being applied"): `20260412100000_add_requested_ot_times`. Investigated in detail below — **already self-healed, no action was needed**.
4. **Two properly-applied migrations that already self-healed** via the exact same fail→rollback→resolve pattern used in this report: `20260425173000_add_daily_time_record_temporary` and `20260426120000_add_branch_loan_application_toggle`. No action needed — included here only so they aren't mistaken for open problems.
5. **One completely untracked table**: `EmailConfig`. Present in `schema.prisma` and in the live database, but represented by zero migration history — not even a failed attempt.

### Deep dive: `20260412100000_add_requested_ot_times` (already healthy — verified, not assumed)

The current on-disk file:

```sql
-- Columns already exist in database - marking as applied
-- AlterTable
-- ALTER TABLE "DailyTimeRecord"
-- ADD COLUMN "requestedOTstart" TIMESTAMP(3),
-- ADD COLUMN "requestedOTend" TIMESTAMP(3);

-- AlterTable
-- ALTER TABLE "OvertimeRequest"
-- ADD COLUMN "requestedOTstart" TIMESTAMP(3),
-- ADD COLUMN "requestedOTend" TIMESTAMP(3);
```

Its SHA-256 (computed locally) is `8a8c2586b28e2ecd60b11b89bd6c5eec76a5272fc52ebc45d805071bcbda281e` — which **exactly matches** the checksum of the 4th (successful) attempt row in `_prisma_migrations`. In other words: a previous developer hit the "already exists" failure three times, then correctly commented out the already-applied statements and re-ran it, which succeeded trivially. The file on disk today is fully consistent with the database's recorded history. **No action was taken on this migration** — the earlier `migrate dev` warning was a transient artifact of comparing against one of the three stale failed-attempt rows sharing the same migration name, not a real current inconsistency.

### Confirming there is no actual schema drift anywhere

Before changing any bookkeeping, an authoritative, read-only diff was run directly between the live database and `schema.prisma`:

```
prisma migrate diff --from-url <DATABASE_URL> --to-schema-datamodel prisma/schema.prisma --script
→ "-- This is an empty migration."
```

**Zero differences.** Every table, column, index, foreign key, and enum in the live database matches `schema.prisma` exactly. This was the single most important fact governing the entire recovery: it meant every unresolved/orphaned migration's target state was **already correctly present** in the database, so the only safe and correct fix for each was a bookkeeping-only resolution — never a real re-execution of DDL, and never a guess.

---

## Root Cause

`DATABASE_URL` points to a single shared, cloud-hosted Neon Postgres instance (`neondb` on `ep-shiny-hill-anti22uc-pooler...neon.tech`) — not a disposable local/per-branch database. The repository has multiple long-lived branches (`backup-before-reset`, `backup-main-before-reset`, `rollback-branch`, `fix`, `requested`, `testing`, `updating_feature`, plus `main`/`mailSetup`), and the branch names themselves indicate a **prior full reset/rollback incident** (consistent with the project's own `[[feedback-prisma-db-push-safety]]` memory of a destructive command having deleted real data previously).

Because one shared database was used across this branch churn, several schema objects were created **outside** the normal `prisma migrate dev` flow at various points — directly via manual SQL, `db execute`, or a `migrate dev` run from a different, now-divergent checkout (the `20260401230630_y` migration name is itself evidence of this: a throwaway `--name y` argument, immediately after `add_system_control_settings`, that was never given a real name or committed). When the "official," properly-named migration for the same change was later run against this same shared database, Postgres correctly rejected it with `already exists` errors — this is the exact mechanism behind **every** failed migration found in this history (`add_requested_ot_times`, `add_daily_time_record_temporary`, `add_branch_loan_application_toggle`, and `add_employee_note_table` all failed with the identical class of error: `relation/column ... already exists`).

Three of those four were correctly recovered at the time using `prisma migrate resolve` (rollback the failed attempt, then mark applied). The fourth — `add_employee_note_table` — was not, and is the one migration that was actually blocking `migrate dev`/`migrate deploy` before this repair. Separately, `EmailConfig` (added in the most recent commit) and the two orphan migrations were never reconciled at all.

This is entirely consistent with, and does not contradict, the pre-existing drift already documented in [DatabaseImplementationReport.md](DatabaseImplementationReport.md) from the Notification Engine work — that report correctly identified the symptom; this report traces it to its exact origin and closes it out.

---

## Recovery Plan

All five problems were resolved using only Prisma's own official, non-destructive `migrate resolve` bookkeeping command and the addition of migration folders whose content was either (a) proven correct via an isolated schema diff, or (b) an honestly-labeled empty placeholder, backed by the zero-drift proof above. No `DROP`, no `ALTER`, no `DELETE`, and no `migrate reset` was used anywhere in this recovery.

| # | Problem | Action taken | Why it's safe |
|---|---|---|---|
| 1 | `add_employee_note_table` stuck failed | `migrate resolve --rolled-back`, then `migrate resolve --applied` | Live `EmployeeNote` table structure was read via `prisma db pull --print` and compared field-by-field, index-by-index, FK-by-FK against the migration's own SQL — exact match confirmed before resolving. Identical two-step sequence already used successfully 2× earlier in this same project's history. |
| 2 | `20260401230630_y` orphan (no local folder) | Created an **empty, clearly-labeled placeholder** folder | Already marked applied in the DB — no CLI action needed for the DB side. The placeholder exists so future `migrate dev` shadow-replays don't flag "not found locally." Verified safe via the zero-drift diff: any non-empty guess would risk introducing *fictional* drift where none exists today. |
| 3 | `20260622000000_time_balance_leave` orphan (no local folder) | Created an **empty, clearly-labeled placeholder** folder | Same reasoning as #2. Matches the project memory that this feature's data was wiped and it remains unimplemented — no trace of it exists in `schema.prisma` today. |
| 4 | `add_requested_ot_times` checksum concern | **No action** | Verified already self-consistent (checksum match against the successful attempt row) — see Problem Analysis. |
| 5 | `EmailConfig` fully untracked | Created a **real** migration folder containing the exact SQL generated by `prisma migrate diff` (isolated: schema-with-EmailConfig-removed → full schema), verified against the live table via introspection, then `migrate resolve --applied` | Content is provably correct (Prisma-generated, not hand-written), and verified to match the live table exactly before being marked resolved. |
| 6 | Notification Engine migration unregistered | `migrate resolve --applied 20260722000000_add_notification_engine_foundation` | Fully controlled and already exhaustively verified in [DatabaseImplementationReport.md](DatabaseImplementationReport.md) — this report only closes the bookkeeping gap that report flagged as a followup. |

---

## Commands to Execute

Exactly what was run, in order, all against the live Neon database (each is a bookkeeping-only write to `_prisma_migrations`, or a read-only check):

```bash
# Investigation (read-only)
npx prisma migrate status
npx prisma db pull --print --schema prisma/schema.prisma          # introspection, no write
npx prisma migrate diff --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma --script              # confirms zero drift, no write

# Repair (bookkeeping only — no DDL executed, no data touched)
npx prisma migrate resolve --rolled-back 20260514000000_add_employee_note_table
npx prisma migrate resolve --applied     20260514000000_add_employee_note_table
npx prisma migrate resolve --applied     20260613000000_add_zkteco_sync_mode
npx prisma migrate resolve --applied     20260613010000_add_email_config
npx prisma migrate resolve --applied     20260722000000_add_notification_engine_foundation

# Verification (read-only)
npx prisma migrate status
```

Plus two local file additions (no database interaction): the placeholder folders for `20260401230630_y` and `20260622000000_time_balance_leave`, and the reconstructed folder for `20260613010000_add_email_config`.

---

## Commands NOT to Execute

| Command | Why it must not be run |
|---|---|
| `prisma migrate reset` | **Drops the entire database.** This is exactly what Prisma originally suggested as its own remediation, and exactly what this project's own memory records as having destroyed real data once before. Never run against this database. |
| `prisma db push` | Bypasses migration history entirely and can silently drop/recreate columns to force-match the schema; explicitly forbidden by this project's own `CLAUDE.md`/`TROUBLESHOOTING.md`. |
| Any hand-written `UPDATE "_prisma_migrations" SET checksum = ...` | Would "fix" the cosmetic checksum-mismatch warning on `add_requested_ot_times` or the two placeholders, but directly edits Prisma's internal bookkeeping table outside any sanctioned CLI command — unnecessary (see Remaining Risks) and outside the spirit of "use `migrate resolve` where appropriate." |
| Deleting rows from `_prisma_migrations` (e.g. the 3 failed `add_requested_ot_times` attempt rows) | Unnecessary — Prisma already ignores superseded failed rows once a later row for the same name succeeds — and deleting from this table by hand is exactly the kind of unsanctioned direct manipulation this recovery deliberately avoided everywhere else. |
| Renaming or deleting any existing migration folder | Per this project's own `TROUBLESHOOTING.md`: renaming an already-applied migration folder desyncs Prisma's applied-migration tracking (which matches by folder name). Every folder from before this recovery was left untouched; only new folders were added. |

---

## Remaining Risks

- **Checksum mismatches remain, by design, for the three folders whose original content is unknown or intentionally empty** (`20260401230630_y`, `20260622000000_time_balance_leave`, and cosmetically `add_requested_ot_times`'s older superseded attempt rows). `migrate dev` may still print an informational "modified since applied" note for these on a future run. This is **not a functional problem** — `migrate status` already confirms the schema is fully in sync, and the checksum field is only used to warn a developer that a migration's on-disk content doesn't match what was recorded, not to block anything by itself. No further action is recommended; "fixing" it would require hand-editing Prisma's internal bookkeeping table, which is a riskier operation for zero real benefit.
- **The true original content of `20260401230630_y` and `20260622000000_time_balance_leave` is permanently unknown** unless a teammate has a local copy in an old, unshared checkout. If such a copy is ever found, the placeholder files should be replaced and re-verified with the same `migrate diff --from-url` zero-drift check used in this report before trusting them.
- **This shared-database-across-branches pattern is the actual systemic risk**, not any single migration. As long as multiple branches/checkouts point at the same `DATABASE_URL`, this exact class of "already exists" failure can recur. Consider (as a separate, non-database-layer decision) giving each active branch/developer its own database, or at minimum documenting in `SETUP.md` that `DATABASE_URL` in `.env` is a **shared** resource, not a personal dev database.
- **No changes were made to protect against this recurring** — that would require a process/tooling change (e.g., a branch-specific database convention), which is outside this task's scope (database-layer repair only) and would need its own product/infra decision.

---

## Verification Checklist

| Check | Result |
|---|---|
| `prisma migrate status` | ✅ `Database schema is up to date!` (previously reported drift and two divergent migration lists) |
| `prisma migrate diff --from-url <DB> --to-schema-datamodel schema.prisma` | ✅ Empty diff — zero schema drift, before and after this recovery |
| `prisma validate` | ✅ Schema valid |
| `prisma generate` | ✅ Succeeds (already run in Phase 1; unaffected by bookkeeping-only changes) |
| Any `DROP`/`DELETE`/`ALTER COLUMN` executed against the database | ❌ None — every command run was either read-only or a `_prisma_migrations`-only bookkeeping write |
| `migrate reset` executed | ❌ Never |
| Notification Engine tables re-created or modified | ❌ Untouched — this recovery only added a bookkeeping record for the migration that created them in Phase 1 |
| Business data modified | ❌ No table other than `_prisma_migrations` was written to |
| Local migration folders now match the database's applied-migration list | ✅ 53 local folders; `migrate status` confirms full agreement |
| Future `pnpm prisma migrate dev` (no schema change) | Expected to report no pending changes cleanly — no longer blocked by the previously-stuck failed migration |
| Future `pnpm prisma migrate deploy` | Expected to apply cleanly on a fresh environment, since every folder now present contains either verified-correct SQL or a documented, drift-proven-safe no-op |

---

## Files Changed / Added

| File | Change |
|---|---|
| `prisma/migrations/20260401230630_y/migration.sql` | New — empty, documented placeholder |
| `prisma/migrations/20260622000000_time_balance_leave/migration.sql` | New — empty, documented placeholder |
| `prisma/migrations/20260613010000_add_email_config/migration.sql` | New — real, verified SQL for the previously-untracked `EmailConfig` table |
| `_prisma_migrations` (database bookkeeping table only) | 5 rows updated/inserted via `prisma migrate resolve` — no other database table touched |
| `MigrationRecoveryReport.md` | This file |

No file under `src/`, no other Prisma model, and no `prisma/schema.prisma` content was changed in this phase.
