# TROUBLESHOOTING.md

Common issues and how to resolve them, based on what is actually observable in the codebase (defensive code, error messages, comments, and known-inconsistency points documented in [DECISIONS.md](DECISIONS.md)). Where the codebase doesn't reveal a root cause, this is stated rather than guessed.

See also: [SETUP.md](SETUP.md), [DATABASE.md](DATABASE.md), [DECISIONS.md](DECISIONS.md), [ARCHITECTURE.md](ARCHITECTURE.md).

## Table of Contents

- [Database Connection Issues](#database-connection-issues)
- [Missing Columns / Out-of-Sync Schema](#missing-columns--out-of-sync-schema)
- [Docker / Docker Compose Issues](#docker--docker-compose-issues)
- [Environment Variable Issues](#environment-variable-issues)
- [Build Failures](#build-failures)
- [Port Conflicts](#port-conflicts)
- [SMTP / Email Issues](#smtp--email-issues)
- [Authentication Issues](#authentication-issues)
- [Migration Issues](#migration-issues)
- [ZKTeco Sync Issues](#zkteco-sync-issues)
- [Cron / Background Job Issues](#cron--background-job-issues)
- [Common Runtime Errors](#common-runtime-errors)

## Database Connection Issues

**Symptom:** App fails to start, or every Server Action throws a Prisma connection error.
- Confirm `DATABASE_URL` in `.env` is correct and reachable from wherever the app runs (inside Docker, the app container must reach the `postgres` service by its Compose service name, `postgres`, not `localhost`).
- In Docker Compose, `app` has `depends_on: postgres: condition: service_healthy` — if Postgres's healthcheck (`pg_isready`) never passes, `app` will not start. Check `docker compose logs postgres`.
- `docker-compose.yml` requires `DB_PASSWORD` to be set (`POSTGRES_PASSWORD: ${DB_PASSWORD:?DB_PASSWORD required}`) — Compose will refuse to start with a clear error if it's missing. `DB_NAME`/`DB_USER` default to `hrm`/`hrm` if unset.

## Missing Columns / Out-of-Sync Schema

**Symptom:** Prisma error code `P2022` ("column does not exist"), or errors referencing `fiverrLink`/`upworkLink`/`isLoanApplicationEnabled`.
- The codebase has **known defensive workarounds** for exactly this: `syncUserWithDb()` (`user.actions.ts`) detects a `P2022` for `User.fiverrLink`/`User.upworkLink` and runs `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` directly, then retries. `branch.actions.ts` similarly falls back to a default if `Branch.isLoanApplicationEnabled` is missing.
- The presence of these workarounds indicates this exact class of drift has happened before in this project (a deployed database missing a migration that was already merged to `main`). The correct fix is **always to run `prisma migrate deploy`** against the affected database, not to rely on the runtime patch — the runtime patches exist for resilience, not as a substitute for running migrations.
- If you see this for any *other* column not covered by the two workarounds above, the fix is the same: run pending migrations against that database (`pnpm prisma migrate deploy` or `migrate dev` locally), not to add another ad hoc `ALTER TABLE` patch in application code.

## Docker / Docker Compose Issues

**Symptom:** `docker compose up` fails with a network error about `traefik-public`.
- `docker-compose.yml` declares `traefik-public` as `external: true` — it must already exist before `docker compose up`. Create it once: `docker network create traefik-public`. This is only needed if you're running the full stack with Traefik; for local-only testing, either create the network anyway or strip the Traefik labels/network from a local override file.

**Symptom:** App container starts but the site isn't reachable at `https://${DOMAIN}`.
- Confirm an external Traefik instance is actually running and attached to `traefik-public` — `docker-compose.yml` only supplies routing *labels*, it does not run Traefik itself.
- Confirm DNS for `DOMAIN` points at the server, and that `ACME_EMAIL`/`certresolver=le` is correctly configured on the Traefik side (outside this repo).

**Symptom:** Backups aren't running.
- `docker/postgres`'s barman-cloud backup job is disabled unless `BACKUP_S3_BUCKET` is set (per `docker-compose.yml`'s own comment: "omit S3_BUCKET to disable"). Check `BACKUP_S3_BUCKET`, `BACKUP_S3_ENDPOINT_URL`, `BACKUP_AWS_ACCESS_KEY_ID`/`BACKUP_AWS_SECRET_ACCESS_KEY` are all set if backups are expected.

## Environment Variable Issues

**Symptom:** `POST /api/webhooks/clerk` throws `"Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local"`.
- This is a hard `throw` in the route handler (`src/app/api/webhooks/clerk/route.ts`) when `CLERK_WEBHOOK_SECRET` is unset — set it from the Clerk Dashboard's Webhooks page.

**Symptom:** Email sending fails immediately with "Email is not configured yet."
- `emailService.sendMail()` returns this when `EmailConfig.smtpHost`/`senderEmail`/`appPasswordEncrypted` are unset in the database — this is a **database** configuration issue (System Control → Email Config in the admin UI), not an env var, even though `EMAIL_SECRET_KEY` (env var) must also be set correctly for the encrypted password to decrypt. See [SMTP / Email Issues](#smtp--email-issues) below.

**Symptom:** `/api/cron/generate-timeline` always returns 401.
- Check whether `CRON_SECRET_TOKEN` is set in the environment; if so, the caller must send `Authorization: Bearer <same value>`. This variable is **not listed in `.env.example`** — see [SETUP.md](SETUP.md) — so it's easy to set it in production and forget to document/share it with whatever external system calls this endpoint.

**Symptom:** `docker-compose.yml` fails with `DB_PASSWORD required`.
- Set `DB_PASSWORD` in `.env` (referenced by `docker-compose.yml` but absent from `.env.example` — see [SETUP.md](SETUP.md)).

## Build Failures

**Symptom:** `next build` fails referencing a Prisma Client type that doesn't exist / stale types.
- Run `pnpm prisma generate` before building — the Dockerfile does this as an explicit separate step (`RUN env CI=true pnpm prisma generate` before `RUN env CI=true pnpm build`) precisely because `next build` does not implicitly regenerate the Prisma Client.

**Symptom:** `pnpm dev:clean` / `dev:fresh` doesn't work on macOS/Linux.
- These scripts use Windows `cmd.exe` syntax (`if exist .next rmdir /s /q .next && npm run dev`) and will fail under bash/zsh. On macOS/Linux, just run `rm -rf .next && pnpm dev` manually.

## Port Conflicts

**Symptom:** `next dev`/`next start` fails to bind, or the Docker container's port 3000 conflicts with another local service.
- The app always listens on port 3000 (`Dockerfile`: `ENV PORT=3000`); change the host-side mapping in your own Compose override (`docker-compose.yml` itself does not publish a host port directly — routing is via Traefik labels, not a `ports:` mapping) if running locally without Traefik, or stop whatever else occupies 3000 for local `next dev`.

## SMTP / Email Issues

`src/lib/services/email.service.ts` maps SMTP transport errors to specific messages — use these to diagnose directly from the System Control UI's test-email result or server logs:

| Error code | Meaning | Fix |
|---|---|---|
| `EAUTH` | "Authentication failed." | Re-check sender email + app password in System Control → Email Config. For Gmail, this must be an **App Password**, not the account's normal login password. |
| `ENOTFOUND` / `EDNS` | "Invalid SMTP host." | Check the configured SMTP host spelling. |
| `ECONNECTION` / `ECONNREFUSED` | "Could not connect to the SMTP server." | Check host/port and that outbound traffic on that port isn't blocked by the server's firewall/hosting provider. |
| `ETIMEDOUT` / `ESOCKET` | "Connection ... timed out." | Network/firewall issue between the app server and the SMTP host. |
| `EENVELOPE` | "Invalid sender or recipient email address." | Check the `senderEmail` value and the recipient address passed to `sendMail`. |
| `EMESSAGE` | "SMTP server rejected the message." | Check message content/size limits on the provider side. |

If credentials were saved successfully before but suddenly fail to decrypt (`decryptSecret` throws inside `resolveConfig()`), the most likely cause is `EMAIL_SECRET_KEY` having changed since the password was encrypted — see [DECISIONS.md](DECISIONS.md) and [CLAUDE.md](CLAUDE.md#what-should-not-be-changed). The fix is to re-enter the SMTP app password in System Control after restoring/matching the original `EMAIL_SECRET_KEY`, or accept the loss and re-save fresh credentials under the new key.

Every send attempt (success or failure) is logged to the `SystemAudit` table (`action: "EMAIL_SEND"`) — query this table for a history of send attempts and their failure reasons if the UI doesn't surface enough detail.

## Authentication Issues

**Symptom:** New user is stuck on `/pending` forever.
- This is expected default behavior: every new sign-up becomes `role: EMPLOYEE, status: PENDING` (except the hardcoded bootstrap SUPERADMIN email — see [SETUP.md](SETUP.md)). A SUPERADMIN must approve them from the admin employees page (`approveEmployeeWithDetails`, requiring a branch + base salary) before they can access anything else.

**Symptom:** A user's role/permissions seem wrong even after being changed in the admin UI.
- Two different sources of "role" exist: the `User.role` column in Postgres (used by nearly all Server Actions and layout gating) and Clerk's session-claims metadata (`CustomJwtSessionClaims.metadata.role`, read by `src/lib/roles.ts`'s `checkRole`/`getUserRole`). **How/whether these two stay in sync is not shown anywhere in the reviewed codebase** — if a code path uses `lib/roles.ts` instead of `getDbUser().role`, a DB role change might not be reflected until the Clerk-side session claim is also updated (e.g. via a Clerk session-claims template referencing your own metadata, configured in the Clerk Dashboard — outside this repo). Prefer `getDbUser().role` when troubleshooting, and treat any `lib/roles.ts` usage as a potential source of stale-role bugs. See [DECISIONS.md](DECISIONS.md).

**Symptom:** Webhook `POST /api/webhooks/clerk` returns 400 "Error occured -- no svix headers" or "Error occured".
- The former means Clerk's request didn't include `svix-id`/`svix-timestamp`/`svix-signature` (check the webhook is actually configured to hit this exact URL from the Clerk Dashboard, not a proxy stripping headers). The latter means signature verification failed — check `CLERK_WEBHOOK_SECRET` matches the value shown for this specific endpoint in the Clerk Dashboard (each endpoint has its own secret).

## Migration Issues

- **Never** run `prisma db push` or `prisma migrate reset` against a database containing real data — see [[feedback-prisma-db-push-safety]] and [CLAUDE.md](CLAUDE.md#what-should-not-be-changed): this exact action has previously deleted real data on this project.
- If `prisma migrate dev` complains the migration history is out of sync (e.g. after someone manually edited the database, or a migration file was edited after being applied elsewhere), resolve it with `prisma migrate resolve --applied <name>` (if the change is already live) or by creating a new forward migration that reconciles the difference — do not reset.
- 45 migrations currently exist (see [DATABASE.md](DATABASE.md#migration-strategy)); several have hand-authored-looking timestamp prefixes (`...000000`). If you need to insert a migration "between" two existing ones for some reason, do not renumber existing migration folders — Prisma tracks applied migrations by folder name in its `_prisma_migrations` table, and renaming an already-applied migration folder will desync that history.

## ZKTeco Sync Issues

**Symptom:** ZKTeco sync cron silently does nothing.
- `zkteco.service.ts`'s `isConfigured()` requires `baseUrl`, `username`, and `password` all to be non-empty — check System Control → ZKTeco settings (SUPERADMIN/HR only see the actual credential values; managers see them blanked, per `system-control.actions.ts`'s `canEditSensitiveZkteco` check).
- The sync cron loop in `instrumentation.ts` performs an `OPTIONS` reachability probe against `<baseUrl>/api-token-auth/` (8-second timeout) before syncing, and **skips the run entirely** (logs a warning) if that probe fails or the base URL is empty — check server logs for `"Skipping ZKTeco sync cron: base URL is down or unreachable"`.
- `system-control.actions.ts`'s `checkZktecoServer` action (surfaced in the System Control UI) does the same kind of reachability check with a shorter 3-second timeout, for manual verification without waiting for the next cron tick.

**Symptom:** Attendance times look shifted by 6 hours.
- `zkteco.service.ts` explicitly compensates for a **Bangladesh UTC+6 offset** when parsing punch times and when converting a stored (UTC) `DailyTimeRecord.date` into the date string sent to the ZKTeco API. If the ZKTeco device itself is not physically in the `Asia/Dhaka` timezone (or its own clock is misconfigured), this hardcoded offset will produce incorrect check-in/out times — this offset is not derived from `SystemControlSettings.appTimezone`, it's a literal constant (`BANGLADESH_OFFSET_MS`) in `zkteco.service.ts`. Changing `appTimezone` alone will **not** fix a ZKTeco time-shift issue.

## Cron / Background Job Issues

**Symptom:** Nightly jobs (timeline generation, leave automation) don't seem to run, or run at the wrong time.
- Check `SystemControlSettings` (via System Control admin UI) — the enabled flags and hour/minute for each job are read from the database, not directly from `CRON_*` env vars (those only seed the row once, on first creation). Changing an env var after the row already exists has **no effect** until someone edits it through the UI (or the row is manually deleted/recreated).
- Confirm the app process has been running continuously since before the scheduled time — `instrumentation.ts`'s loops only fire while the Node.js process is alive; a redeploy that restarts the container resets each loop's in-memory `lastRunDate`/`lastRunFinishedAt` state (harmless for DAILY mode, since it just re-evaluates "have I run today," but relevant for ZKTeco's INTERVAL mode, whose "time since last run" clock resets to "run immediately" on every restart).
- If running multiple app replicas (not the current default single-replica Compose setup), be aware each replica runs its own independent copy of these loops with no shared coordination — see [DECISIONS.md](DECISIONS.md).

**Symptom:** A day's attendance record is stuck un-processed / never gets an auto-leave or absence penalty applied.
- `leave-automation.actions.ts` deliberately **skips** a date if there are no punches at all and the date is less than 4 days old (a grace window for the ZKTeco device or a delayed sync) — this is expected, not a bug, for recent dates. It also skips (indefinitely, no auto-processing) any date with only *one* of check-in/check-out present, since that's treated as incomplete data — a manual timeline edit or modification-request approval is required to resolve those.

## Common Runtime Errors

**`"Unauthorized"` thrown from a Server Action.** Many actions `throw new Error("Unauthorized")` rather than returning `{ success: false }` (see [CLAUDE.md](CLAUDE.md#error-handling-conventions)) — if a client component doesn't wrap the action call in `try/catch`, this surfaces as an unhandled promise rejection / Next.js error overlay rather than a friendly toast. Check the specific action's permission check against the calling user's actual `role`/`isManager`/`status`.

**A payroll run throws for a month that "should" be re-runnable.** `processPayroll()` deliberately throws if a `SalaryPayment` already exists for that month/employee — payroll runs are immutable by design (see [ARCHITECTURE.md](ARCHITECTURE.md)). There is no "undo payroll" action in the reviewed codebase; correcting a bad payroll run would require direct database intervention, which should be done carefully and only with a clear understanding of every table `processPayroll` touches (see [DATABASE.md](DATABASE.md)).

**A profile field a manager should be able to edit isn't editable.** This may be intentional field-level authorization, not a bug — `profile.actions.ts`'s manager-direct-edit path deliberately excludes salary/bank/address fields from what a manager may write. See [CLAUDE.md](CLAUDE.md#authorization-flow).
