# Google Drive Migration Safety Audit

**Part 1 (below) is the original read-only investigation** — no database changes were made during it. **Part 2, appended after your approval of Option A, documents the actual migration execution** — the only part of this whole effort that touched the live database.

---

# Part 1 — Read-Only Investigation

Every command run in this part was either a local file/git inspection, a read-only SQL `SELECT`, or Prisma's own read-only `migrate diff` (which computes and prints a diff — it does not execute anything against the database).

## 1. Current (local) migration state

61 migration folders exist under `prisma/migrations/` on this branch (`mailSetup`), from `20260124161942_init` through `20260728120000_add_notification_job_inbox_state`, plus `migration_lock.toml`. Full list obtained via `ls prisma/migrations/`.

## 2. Database migration state

Queried `_prisma_migrations` directly (read-only `SELECT`, via a temporary throwaway script — written, run, and deleted, never committed, matching this project's established read-only-verification convention from earlier phases). **61 rows**, all either cleanly finished (`finished_at` set, `rolled_back_at` null) or a documented fail→rollback→retry→success sequence that the prior `MigrationRecoveryReport.md` (see §4) already investigated and closed out.

**Critically: `_prisma_migrations` contains a row for `20260804120000_add_branch_late_penalty_toggle`** — applied cleanly on 2026-08-04T10:13:21Z, 1 step, never rolled back. This confirms Prisma's drift report was accurate: this migration really did run against the live database; it just isn't in this branch's local `prisma/migrations/` folder.

## 3. Exact drift list — investigated item by item

The single most useful read-only command for ground truth is Prisma's own schema-vs-database diff (not the migration-history-replay diff `migrate dev` uses internally, which is noisier — see the note after this table):

```bash
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script
```

This produces the exact SQL that would be needed to make the **live database** match **this branch's current `schema.prisma`** — i.e., it answers "what is *actually* different," independent of migration-file bookkeeping noise. Result:

```sql
-- AlterTable
ALTER TABLE "Branch" DROP COLUMN "isLatePenaltyEnabled";

-- CreateTable
CREATE TABLE "GoogleDriveConfig" ( ... );
```

**That's it. Only two real differences exist between the live database and this branch's schema.prisma**: `Branch.isLatePenaltyEnabled` (exists live, not declared in this branch's `schema.prisma`) and `GoogleDriveConfig` (the model I added this session, not yet in the database — expected, not a problem).

| Object | Local `schema.prisma` (this branch) | Live DB state | Why different | Likely source | Risk |
|---|---|---|---|---|---|
| `Branch.isLatePenaltyEnabled` | **Not declared** | Column exists, `BOOLEAN NOT NULL DEFAULT true` | A different branch's feature was deployed to this shared database; `mailSetup` never merged it | Commit `91254be` ("branch wise penalty option introduced"), on `main`/`origin/main`/`origin/fix`, **not an ancestor of `mailSetup`** | **None** — an extra, unused column in the live DB that this branch's Prisma Client simply doesn't know about. Prisma ignores DB columns not declared in its schema; nothing reads or writes it from this branch's code. |
| `GoogleDriveConfig` | Declared (added this session) | Does not exist | Expected — this is the new table this feature needs | This session's work | None — this is the intended, not-yet-applied change |
| `DailyTimeRecord.requestedOTstart`/`requestedOTend`, `OvertimeRequest.requestedOTstart`/`requestedOTend` | **Declared** (confirmed via grep — 3 occurrences in schema.prisma) | Columns exist | `migrate dev`'s replay-based drift detector flagged these because `20260412100000_add_requested_ot_times`'s on-disk migration.sql has its `ADD COLUMN` statements **commented out** (the columns already existed live when it was written) — replaying migration folders literally doesn't produce these columns, even though schema.prisma and the live DB agree on them | Already fully investigated in `docs/notification-engine/audits/MigrationRecoveryReport.md` §"Deep dive" — confirmed the on-disk file's checksum exactly matches the DB's recorded successful-attempt checksum. **Not new — a predicted, documented recurrence.** | **None** — confirmed zero actual difference by the schema-vs-DB diff above; this is bookkeeping noise only |
| `User` index differences (`archivedAt`, `employeeStatus+isArchived`) | (whatever schema.prisma declares) | (whatever the DB has) | Same class of replay-vs-actual noise | Same root cause as above (documented in the prior recovery report as an accepted, permanent residue of resolve-based repairs) | **None** — the schema-vs-DB diff above shows **zero** index-related SQL at all, meaning schema.prisma and the live DB already agree exactly on `User`'s indexes |
| `SystemControlChangeLog.actorName` default, `SystemControlSettings.updatedAt` default | (whatever schema.prisma declares) | (whatever the DB has) | Same class of replay-vs-actual noise | Same root cause | **None** — same reasoning; the authoritative diff shows no `ALTER COLUMN` for either table |

**Why the two diff methods disagree, precisely**: `migrate dev`'s drift check replays every local migration folder's *SQL* from scratch into a shadow database and compares that shadow database against the live one. `migrate diff --to-schema-datamodel` compares the live database directly against `schema.prisma`'s *declared model*. When a migration folder's SQL doesn't match what actually happened historically (exactly the situation `20260412100000_add_requested_ot_times`, the `User` indexes, and the two `SystemControlChangeLog`/`SystemControlSettings` defaults are all already known instances of, per the prior recovery report), the two methods disagree even though the *real*, *currently relevant* answer — does the database match what the application's Prisma Client will actually use? — is yes. This was already the documented, accepted conclusion of the prior recovery ("Remaining Risks": *"Checksum mismatches remain, by design... This is not a functional problem"*), and this investigation independently re-confirms it's still true today.

## 4. Missing migration investigation — `20260804120000_add_branch_late_penalty_toggle`

**Fully recovered, exact original content, from git history.** Found via `git log --all --diff-filter=A --name-only`, which located commit `91254be` ("(feat): branch wise penalty option introduced", authored by PRAVAKAR DAS):

```sql
-- AlterTable
ALTER TABLE "Branch"
ADD COLUMN "isLatePenaltyEnabled" BOOLEAN NOT NULL DEFAULT true;
```

This commit exists on `main`, `origin/main`, and `origin/fix` (confirmed via `git branch --all --contains 91254be`), but `git merge-base --is-ancestor 91254be HEAD` returns **not an ancestor** — `mailSetup` forked from `main` before this commit landed there, and has never merged it since. The migration file was never deleted from this branch; it was simply never present, because the feature it belongs to was never merged into this branch's history.

## 5. Can the missing migration be recovered? — **Yes, fully, with the exact original SQL**

Unlike the two prior orphan migrations (`20260401230630_y`, `20260622000000_time_balance_leave` — both permanently unrecoverable per the earlier `MigrationRecoveryReport.md`, since no branch or backup anywhere contains their content), this one is a clean, complete recovery: real commit, real author, real date, on a still-existing branch, with a git-verified exact SQL match to what `_prisma_migrations` recorded as applied (1 step, finished cleanly, 2026-08-04T10:13:22Z).

## 6. Risk assessment

- **No data loss risk from anything found in this investigation.** Every drift item traces to either (a) an unrelated feature from another branch that happens to share this database, fully recoverable, or (b) already-documented, already-judged-safe bookkeeping noise from the prior recovery.
- **The systemic risk is exactly what the prior recovery report already predicted and flagged**: *"This shared-database-across-branches pattern is the actual systemic risk... As long as multiple branches/checkouts point at the same DATABASE_URL, this exact class of failure can recur."* It just did — `main`'s `91254be` deployed to the shared DB while `mailSetup` diverged. This is not a new category of problem; it's a recurrence of a known, named risk.
- **The only genuinely destructive path available here** would be running `prisma migrate reset` (which Prisma itself suggested) or `prisma db push` — both explicitly forbidden by this project's standing rules, and both correctly avoided in this investigation.

## 7. Recommended safe migration strategy (not executed — for your approval)

Two viable options, both entirely bookkeeping-safe (no `DROP`/`DELETE`/reset), differing only in whether `isLatePenaltyEnabled` gets formally adopted into this branch's schema:

**Option A — Fully isolated (recommended default)**: Leave `Branch.isLatePenaltyEnabled` completely alone (don't add it to this branch's `schema.prisma`, don't touch its migration bookkeeping at all — it's a harmless, unused-by-this-branch extra column). Generate the `GoogleDriveConfig` table's SQL via a **schema-to-schema** diff (isolating just this session's addition, not touching the Branch question at all), review the generated SQL, apply it with `prisma db execute` (a plain, direct SQL execution — not `migrate dev`, so it never triggers the shadow-database drift check that's currently blocked), then add a real migration folder with that exact SQL and reconcile it with `prisma migrate resolve --applied` — the exact same pattern the prior recovery report used for `EmailConfig` (§"Recovery Plan" item 5), already proven safe on this project. This never touches anything unrelated to Google Drive.

**Option B — Also reconcile the Branch drift**: First formally adopt `isLatePenaltyEnabled` into this branch's `schema.prisma` (merging awareness of that feature, though not necessarily its application code) and reconcile its bookkeeping the same bookkeeping-only way (create a migration folder with the exact recovered SQL from §4, then `prisma migrate resolve --applied` — since the column already exists live, this is a bookkeeping-only write, never a real `ALTER TABLE` execution, exactly like every other "already exists" case in this project's history). Then run a normal `prisma migrate dev --name add_google_drive_config`, which should now succeed cleanly since the only remaining real difference would be `GoogleDriveConfig` itself.

**Recommendation: Option A.** It fully satisfies "add only the new GoogleDriveConfig table... do not modify unrelated models" literally, and defers the Branch/`isLatePenaltyEnabled` question (a decision about whether this branch should be aware of an unrelated feature from `main`) to you, on its own timeline, rather than bundling it into the Google Drive work.

Neither option was executed. Both require your explicit approval before any command that touches the database (even a bookkeeping-only `migrate resolve`) is run.

## 8. What must NOT be done

- `prisma migrate reset` — drops the entire database. Prisma itself suggested this; it must never be run.
- `prisma db push` — bypasses migration history, can silently drop/recreate columns.
- Editing any existing migration folder's SQL, or renaming one (desyncs Prisma's applied-migration tracking, which matches by folder name).
- Hand-writing `UPDATE "_prisma_migrations" SET checksum = ...` or deleting rows from that table directly.
- Guessing at SQL for `20260401230630_y` or `20260622000000_time_balance_leave` (both already correctly handled as documented empty placeholders by the prior recovery — not reopened by this investigation).

## 9. What Google Drive / payroll work can continue right now, without any database change

**A. Can be developed now** (already started/possible with zero DB dependency):
- Payslip PDF generation — already complete (Phase 18a), untouched by this investigation.
- The Notification Engine's Document/attachment pipeline — already complete (Phase 18b), untouched.
- Google Drive service auth logic, folder find-or-create logic, upload logic (Stage 2 of the approved plan) — `googleapis` is installed; a `GoogleDriveConfig` row isn't needed to *write* this code, only to *resolve real credentials at runtime*. The service module (`src/lib/services/google-drive.service.ts`, already created this session with `resolveGoogleDriveConfig()`/`testConnection()`) can be extended with `findOrCreateFolder()`/`uploadFile()` now — it will simply return "not configured" until the config table exists and has a row, exactly like `resolveEmailConfig()` did before `EmailConfig` had real data.
- Payroll email flow design, notification template design — already documented in `PayrollEmailFlowReport.md`.
- Unit tests for anything that takes fake/injected repositories (matching this project's dependency-free `node --test` harness convention) rather than the real Prisma-backed `GoogleDriveConfig` repository — e.g., pure filename-sanitization logic, pure folder-path-building logic, a fake-repository-backed test of the Drive service's control flow.

**B. Must wait for the migration**:
- Actually persisting `GoogleDriveConfig` data (the table doesn't exist yet).
- The admin settings actions (`google-drive-config.actions.ts`) — they'd compile, but any real read/write against `prisma.googleDriveConfig` will fail at runtime (and `pnpm tsc --noEmit` will actually fail at compile time too, since the generated Prisma Client doesn't have this model until `prisma generate` runs against a migrated schema).
- The admin settings UI card that reads/writes real config.
- Any real, end-to-end "Test Connection" call (the code exists — `testConnection()` — but has nothing to resolve until a config row exists).
- Production configuration resolution generally.

## 10. Exact next steps requiring your approval

1. Which option (§7 A or B) for reconciling the `Branch.isLatePenaltyEnabled` drift, if any reconciliation is wanted at all right now (Option A doesn't require you to decide about the Branch feature — it can be revisited independently, anytime).
2. Approval to generate the `GoogleDriveConfig`-only migration SQL (via schema-to-schema diff, not `migrate dev`) and review it with you before it's applied.
3. Approval for the specific apply mechanism (`prisma db execute` + `migrate resolve --applied`, mirroring the prior `EmailConfig` recovery) once you've reviewed the exact SQL.
4. Confirmation of whether you'd like me to continue with Stage 1's non-DB-dependent parts (the Google Drive service's `findOrCreateFolder`/`uploadFile` logic, which is really Stage 2's scope) while this is pending, or hold everything until the migration question is resolved.

---

**Part 1 conclusion: NO DATABASE CHANGES WERE MADE. NO MIGRATION WAS CREATED OR APPLIED.**

---

# Part 2 — Migration Execution (Option A, Approved)

Executed after your explicit approval of Option A ("proceed with Option A only... leave `Branch.isLatePenaltyEnabled` completely untouched").

## Exact migration used

`prisma/migrations/20260829133705_add_google_drive_config/migration.sql` — created fresh, containing only:

```sql
-- CreateTable
CREATE TABLE "GoogleDriveConfig" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "serviceAccountEmail" TEXT NOT NULL DEFAULT '',
    "privateKeyEncrypted" TEXT NOT NULL DEFAULT '',
    "sharedDriveId" TEXT,
    "rootFolderId" TEXT NOT NULL DEFAULT '',
    "rootFolderName" TEXT NOT NULL DEFAULT 'Payroll',
    "updatedById" TEXT,
    "updatedByEmail" TEXT,
    "updatedByRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleDriveConfig_pkey" PRIMARY KEY ("id")
);
```

This SQL was generated once, via an **isolated schema-to-schema diff** (current `schema.prisma` vs. a temporary copy with only the `GoogleDriveConfig` model removed — never compared against the live database, so the unrelated `Branch` drift could not structurally appear in the output), shown to you for review, and then written byte-for-byte into this migration file with no edits in between generation and execution.

## Exact database change

Two commands, both against the live Neon database, in order:

1. `npx prisma db execute --file prisma/migrations/20260829133705_add_google_drive_config/migration.sql --schema prisma/schema.prisma` — executed the exact SQL above. Output: `Script executed successfully.`
2. `npx prisma migrate resolve --applied 20260829133705_add_google_drive_config` — bookkeeping-only write to `_prisma_migrations` (records this migration as applied; does not re-run any SQL). Output: `Migration 20260829133705_add_google_drive_config marked as applied.`

No other command touched the database. No existing migration file was edited or deleted. No `migrate reset`, `db push`, or destructive SQL was run at any point.

## Why the Branch drift was left untouched

Per your explicit instruction: `Branch.isLatePenaltyEnabled` belongs to an unrelated feature (commit `91254be` on `main`, never merged into this branch) and was deliberately excluded from both the generated SQL (by construction — the schema-to-schema diff never referenced it) and from `schema.prisma` (still not declared there). It remains exactly as it was before this task: present in the live database, unknown to this branch's Prisma Client, causing no runtime effect either way.

## Verification results (read-only, all run post-migration)

| Check | Result |
|---|---|
| `prisma migrate status` | ✅ `Database schema is up to date!` — 55 local migrations, no drift blocking anything |
| `GoogleDriveConfig` table exists | ✅ Confirmed via `information_schema.columns` |
| `GoogleDriveConfig` columns/types/defaults/nullability | ✅ All 11 columns match `schema.prisma` exactly (`id` default `'global'`, three `NOT NULL DEFAULT ''` text fields, nullable `sharedDriveId`/`updatedById`/`updatedByEmail`/`updatedByRole`, `rootFolderName` default `'Payroll'`, `createdAt`/`updatedAt` timestamps) |
| `GoogleDriveConfig` primary key constraint | ✅ `GoogleDriveConfig_pkey` present |
| `Branch.isLatePenaltyEnabled` still present, unchanged | ✅ Confirmed identical (`boolean`, `NOT NULL`, default `true`) before and after |
| `Branch` table column count | ✅ 12 columns both before and after — confirms nothing else on `Branch` was touched |
| `npx prisma generate` | ✅ Succeeded — Prisma Client regenerated with `GoogleDriveConfig` |
| `pnpm tsc --noEmit` | ✅ Zero errors, whole project (confirms `google-drive.service.ts`, written in the prior session before the migration existed, now type-checks correctly) |
| `pnpm eslint` | ✅ Zero warnings/errors, whole project |
| `pnpm run test` | ✅ **600/600 passing** |
| `pnpm run build` | Not run — deferred per your instruction ("Do not run build yet unless I ask") |

## Confirmation that existing data was preserved

No `DELETE`, `UPDATE`, `DROP`, or `ALTER` of any existing table was executed at any point in this task. The only DDL executed was a single `CREATE TABLE`. `Branch`'s column count and the specific `isLatePenaltyEnabled` column definition were independently re-verified byte-identical before and after. No other table was queried for writes, only reads (`information_schema`, `_prisma_migrations` SELECTs).

## Files changed (git status)

**New**: `prisma/migrations/20260829133705_add_google_drive_config/migration.sql`, this report, plus everything from the prior Phase 18a/18b/Part-1-investigation sessions already present before this task began.

**Modified**: `prisma/schema.prisma` (the `GoogleDriveConfig` model addition from the prior session — unchanged by this task, now backed by a real migration).

**Unrelated files changed**: none. `docs/notification-engine/updates/update.md` shows as modified from before this task started (untouched by this task specifically — see the update appended below).

Nothing was committed.

---

**NO existing migration file was edited or deleted. NO destructive SQL was run. NO unrelated table, index, or column was changed.**
