# DECISIONS.md

Architectural decisions inferred from the code itself — not from design docs, ADRs, or commit messages explaining rationale (none were found). Each entry states **what** was chosen, **why** it appears to have been chosen (inferred from context/consequences visible in the code), the **tradeoffs** actually observed, and **alternatives** that would have been reasonable. Where intent cannot be determined, this is stated explicitly rather than guessed.

See also: [ARCHITECTURE.md](ARCHITECTURE.md), [CLAUDE.md](CLAUDE.md), [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Table of Contents

- [Next.js App Router + Server Actions instead of a separate API backend](#nextjs-app-router--server-actions-instead-of-a-separate-api-backend)
- [Prisma + PostgreSQL as the only datastore](#prisma--postgresql-as-the-only-datastore)
- [Clerk for authentication instead of custom auth](#clerk-for-authentication-instead-of-custom-auth)
- [In-process interval loops instead of a job queue](#in-process-interval-loops-instead-of-a-job-queue)
- [Manager is a flag on EMPLOYEE, not a separate role](#manager-is-a-flag-on-employee-not-a-separate-role)
- [Two-step manager-verification limited to Loans and Overtime](#two-step-manager-verification-limited-to-loans-and-overtime)
- [DB-backed runtime configuration over redeploy-required env vars](#db-backed-runtime-configuration-over-redeploy-required-env-vars)
- [Docker + Traefik + self-managed VM over a PaaS](#docker--traefik--self-managed-vm-over-a-paas)
- [Money stored as Float, not Decimal](#money-stored-as-float-not-decimal)
- [Durations stored as HH:MM strings, not intervals](#durations-stored-as-hhmm-strings-not-intervals)
- [No repository/service layer for most domains](#no-repositoryservice-layer-for-most-domains)
- [Four separate audit-log tables instead of one generic table](#four-separate-audit-log-tables-instead-of-one-generic-table)
- [Observed inconsistencies not treated as deliberate decisions](#observed-inconsistencies-not-treated-as-deliberate-decisions)

## Next.js App Router + Server Actions instead of a separate API backend

**What:** The entire application — UI, business logic, and data access — lives in one Next.js 16 project. Server Actions (`src/actions/*.ts`) are called directly from React components (server or client) instead of via a REST/GraphQL API consumed over `fetch`.

**Why (inferred):** Eliminates an entire API-contract layer (request/response schemas, client SDK, versioning) for an internal single-tenant HR tool with one first-party frontend. Fits a small team building fast without needing to support third-party API consumers.

**Tradeoffs observed:** No independent API to test/mock without spinning up the whole Next.js app; no way to reuse this backend logic from a separate mobile app without duplicating it or wrapping actions in Route Handlers. The small number of actual `src/app/api/*` Route Handlers (see [API.md](API.md)) exist specifically for cases Server Actions can't handle (webhook signature verification, cron bearer tokens, arbitrary HTTP methods/status codes).

**Alternatives:** A separate Express/Fastify/NestJS API with a documented REST contract; tRPC (would have kept type-safety while adding an explicit RPC boundary). Given the single-frontend scope, the chosen approach is a reasonable, low-overhead fit.

## Prisma + PostgreSQL as the only datastore

**What:** Prisma 6 as the sole ORM/query layer; PostgreSQL 17 as the sole database; no cache layer (no Redis/memcached in the repo).

**Why (inferred):** Prisma's TypeScript-first client and migration tooling pairs naturally with a TypeScript Next.js codebase; Postgres is a safe, well-understood default for relational HR/payroll data with many foreign-key relationships (this schema has 37 models — see [DATABASE.md](DATABASE.md)).

**Tradeoffs observed:** Every read goes to Postgres directly — the two raw-SQL aggregate queries in `dashboard.actions.ts` and the day-by-day JS loops in the employee dashboard suggest some reporting queries are already at the edge of what's comfortable without either better indexing or a caching layer. No connection pooling middleware (e.g. PgBouncer) is configured in `docker-compose.yml` — a straight container-to-container Postgres connection, adequate at current scale.

**Alternatives:** Drizzle ORM (lighter-weight, more SQL-like); a caching layer (Redis) for the dashboard aggregates. Not necessary at the current apparent scale (single organization, one Postgres instance, no sharding/replicas configured).

## Clerk for authentication instead of custom auth

**What:** All authentication (sign-in/sign-up UI, session, JWT) is delegated to Clerk. The app only stores a `clerkId` foreign key on `User` and never touches passwords.

**Why (inferred):** Avoids building/maintaining password hashing, session management, MFA, and account-recovery flows — reasonable for a small internal tool where engineering time is better spent on HR/payroll domain logic.

**Tradeoffs observed:** Hard external dependency for all authentication — if Clerk is unreachable, no one can sign in (webhook events also depend on Clerk's delivery). Two now-partially-redundant paths keep the local `User` row in sync with Clerk (the webhook in `src/app/api/webhooks/clerk/route.ts`, and `syncUserWithDb()` called on every visit to `/`) — see [ARCHITECTURE.md](ARCHITECTURE.md#authentication-flow-sequence). `src/lib/roles.ts` reads role from Clerk's session-claims metadata, while the rest of the app reads `role` from the `User` table directly — these two sources are not obviously kept in sync anywhere in the reviewed code (see [TROUBLESHOOTING.md](TROUBLESHOOTING.md)).

**Alternatives:** NextAuth.js / Auth.js (open-source, self-hosted session logic); a custom auth system. Clerk trades a monthly cost and vendor dependency for near-zero auth-code maintenance — a defensible choice for this app's size.

## In-process interval loops instead of a job queue

**What:** `src/instrumentation.ts` starts three `setInterval(..., 60_000)` loops directly inside the Next.js Node.js process (daily timeline generation, ZKTeco sync, leave automation) instead of using a job queue (BullMQ, Sidekiq-equivalent, cron container, etc.).

**Why (inferred):** Simplicity — no extra infrastructure (no Redis, no separate worker process/container) for jobs that only need to run once a day (or every N minutes) and only really matter for a single-instance deployment.

**Tradeoffs observed:**
- **Single point of execution**: if the Next.js process isn't running (crashed, mid-deploy), no cron fires. There is no persistence of "missed" runs beyond each job's own backfill logic (`checkAndGenerateToday`, `processBackfillLeaveAutomation` can catch up gaps, but only when next invoked).
- **Not horizontally scalable**: if this app were ever run as multiple replicas, all replicas would start all three loops, each independently deciding "is it time to run" — the `lastRunDate` guard is per-process memory, not shared/distributed, so multiple replicas could all fire the same job on the same tick. Currently mitigated only by the fact that `docker-compose.yml` runs a single `app` replica.
- The `node-cron` package is a declared dependency but is **not used anywhere** in `src/` — the hand-rolled scheduler in `instrumentation.ts` replaced or preceded it. This looks like a leftover/unused dependency rather than an intentional choice (see [Observed inconsistencies](#observed-inconsistencies-not-treated-as-deliberate-decisions)).
- Parallel HTTP-triggerable equivalents exist (`/api/cron/generate-timeline`, `/api/leave-automation`, `/api/cron/daily-notifications`) as a second, redundant mechanism for external cron systems — see [API.md](API.md). "Not found in current project": which mechanism (in-process loop vs. external HTTP cron) is actually relied upon in production; both exist and could both fire.

**Alternatives:** A dedicated cron container calling the `/api/cron/*` routes (removes the single-replica assumption from the loops, centralizes scheduling outside app code); `node-cron` (already a dependency, unused) for declarative schedule strings instead of hand-rolled hour/minute comparison logic; a real job queue if the app ever needs retries/observability/horizontal workers.

## Manager is a flag on EMPLOYEE, not a separate role

**What:** `Role` enum is only `SUPERADMIN | HR | EMPLOYEE`. "Manager" is `User.isManager: Boolean`, meaningful only when `role === "EMPLOYEE"`.

**Why (inferred):** A migration (`20260312155252_remove_manager_role` immediately followed by `20260312171645_add_is_manager_field`) shows this was **changed mid-project** — `MANAGER` used to be a `Role` enum value and was replaced with the boolean flag. This suggests the team found a manager needing "most employee permissions plus some admin-lite permissions" awkward to express as a fully separate role (would have required duplicating every employee-facing permission check for a fourth role value), and the boolean-flag-on-EMPLOYEE model composes more naturally with the existing `role === "EMPLOYEE"` checks scattered through the codebase.

**Tradeoffs observed:** Every permission check that means "manager or admin" must remember to check **both** `role` and `isManager` (`role === "SUPERADMIN" || (role === "EMPLOYEE" && isManager)`) — this exact expression is re-implemented locally in many files rather than being a single shared exported helper (see [Observed inconsistencies](#observed-inconsistencies-not-treated-as-deliberate-decisions)). A true RBAC/permissions-matrix system would avoid this repetition but is heavier machinery than this app's three-role, one-flag model needs.

**Alternatives:** A full RBAC system with role-permission mapping tables; a fourth `MANAGER` role (already tried and reverted per the migration history above — do not re-introduce it without understanding why it was removed).

## Two-step manager-verification limited to Loans and Overtime

**What:** Only `Loan` and `OvertimeRequest` have `MANAGER_VERIFIED`/`MANAGER_REJECTED` intermediate states; every other approval workflow (leave, medical, wallet, profile updates, timeline modification) is single-step `PENDING → APPROVED/REJECTED`.

**Why (inferred):** Loans and overtime both involve financial commitment (loan principal disbursement; overtime pay affecting year-end payout) large/sensitive enough to warrant a manager pre-screen before admin/HR makes the final call, whereas leave/medical/wallet/profile changes are lower-stakes or already bounded by other guardrails (entitlement caps, claim limits).

**Tradeoffs observed:** Two different status-transition shapes exist in the codebase for conceptually similar "employee requests something, gets approved" flows — a developer adding a new approval-style feature must choose the right one deliberately (see [CLAUDE.md](CLAUDE.md#what-should-not-be-changed)) rather than copying whichever example they find first.

**Alternatives:** Applying the two-step pattern uniformly (more consistent, but adds friction to lower-stakes approvals like a wallet reimbursement request); a generic configurable-approval-chain system (significantly more engineering effort than this app's needs justify).

## DB-backed runtime configuration over redeploy-required env vars

**What:** Cron schedules, ZKTeco credentials, and SMTP settings are stored in singleton DB rows (`SystemControlSettings`, `EmailConfig`) that env vars only *seed* on first creation — changing them afterward requires no redeploy, just an admin UI edit.

**Why (inferred):** These settings genuinely need to change without a deploy cycle (e.g. rotating the SMTP app password, adjusting when the nightly job runs) — reasonable given this is an internally-operated tool where a non-engineer admin may need to make these changes.

**Tradeoffs observed:** Two-tier configuration (env-var defaults vs. DB overrides) means "what value is actually in effect" requires checking the database, not just `.env` — a source of confusion during troubleshooting (see [TROUBLESHOOTING.md](TROUBLESHOOTING.md)). The ZKTeco password is stored **in plaintext** in `SystemControlSettings` while the SMTP password is encrypted in `EmailConfig` — an inconsistency, not an intentional security decision (see [Observed inconsistencies](#observed-inconsistencies-not-treated-as-deliberate-decisions)).

**Alternatives:** A dedicated secrets manager (Vault, cloud KMS) for both credential sets; pure env-var configuration (simpler, but loses the redeploy-free editability that appears to be the whole point of this design).

## Docker + Traefik + self-managed VM over a PaaS

**What:** Deployment target is a self-managed server reached over SSH, running Docker Compose with Traefik for TLS/routing — not Vercel, Railway, Fly.io, or another Next.js-native PaaS.

**Why (inferred):** Full control over the Postgres instance (with custom `barman-cloud` backup tooling built into the Postgres image) and over background/cron process lifetime (`instrumentation.ts`'s in-process loops need a long-lived Node process, which is a poor fit for a serverless/edge PaaS like Vercel's default runtime model). Traefik's automatic TLS/cert renewal (`certresolver=le`) suggests a preference for infra-as-labels simplicity over a managed load balancer.

**Tradeoffs observed:** No auto-scaling, no zero-downtime blue/green deploys (the deploy workflow does `docker compose down` then `up`, causing brief downtime on every deploy); the `daily-notifications` cron route's own code comment ("can be called by ... Vercel Cron ...") suggests the code may have been written with a Vercel deployment in mind at some point, even though the actual deployment target is not Vercel — a residual comment, not evidence of an actual multi-target deployment strategy.

**Alternatives:** Vercel (would fit the Next.js app itself well, but would require moving cron/background jobs to Vercel Cron + likely a managed Postgres like Neon/Supabase, and would need `instrumentation.ts`'s stateful loops rewritten as externally-triggered functions); a Kubernetes-based deployment (more operational overhead than this app's scale appears to need).

## Money stored as Float, not Decimal

**What:** Every monetary column in `prisma/schema.prisma` (`baseSalary`, `walletBalance`, `amount`, `netAmount`, etc.) is `Float`, not Prisma's `Decimal` type.

**Why (inferred):** Likely developer convenience/familiarity — `Float` requires no special handling in JS (`Decimal` requires `Prisma.Decimal` or a library like `decimal.js` for arithmetic), and at the amounts and currency involved (Bangladeshi Taka, `.toLocaleString("en-BD")` formatting, no cents/paisa arithmetic visible anywhere) floating-point rounding error is unlikely to be immediately visible.

**Tradeoffs observed:** `Float` is IEEE-754 double precision — safe for the *display* precision this app uses, but repeated arithmetic (EMI waterfall calculations, payroll aggregation summing many `Float` fields) accumulates rounding error over time in a way `Decimal` would not. No evidence in the code of a specific bug caused by this (e.g. no compensating "round to nearest paisa" logic beyond the EMI's own `Math.round(...)` calls), but it is a latent risk for a payroll system specifically.

**Alternatives:** `Decimal` (Prisma-native, exact for currency); storing amounts as integer minor units (paisa) — the standard fix for float-money bugs in other stacks. Changing this now would require a schema migration and touching every monetary calculation across ~10 action files — a deliberate, larger refactor, not a quick fix.

## Durations stored as HH:MM strings, not intervals

**What:** `DailyTimeRecord`'s time-duration fields (`actualActiveTime`, `overtimeUndertime`, `requiredBreakTime`, etc.) are `String?` in `"HH:MM"`/`"-HH:MM"` format rather than `Int` (minutes) or Postgres `interval`.

**Why (inferred):** Human-readable directly from the database (useful for debugging/reporting without a formatting step) and simple to display without conversion in the common case; negative durations (undertime) are representable with a leading `-`, which a plain unsigned minutes-integer wouldn't naturally express without a separate sign field.

**Tradeoffs observed:** Every arithmetic operation on a duration requires parsing the string first (`src/lib/duration.ts`'s `parseDurationToMinutes`, plus separate private formatters inside `timeline.actions.ts` for the write path — see that file's own code comment explaining the split). Sorting/filtering by duration in SQL (e.g. `ORDER BY actualActiveTime`) would sort lexicographically, not numerically, for these fields — the codebase avoids this by doing "two-tier sort: DB-native vs in-memory for computed fields" in `getTimelineRecords` (per the actions-layer inventory), i.e. it works around the representation rather than changing it.

**Alternatives:** Store minutes as a signed `Int` and format `"HH:MM"` only at the presentation layer — would enable native SQL sorting/aggregation on duration fields. Not done here, likely because the current string-based approach was simpler to build incrementally alongside the ZKTeco integration (which itself returns times as strings).

## No repository/service layer for most domains

**What:** Only 4 domains (email, loan math, medical math, ZKTeco) have a dedicated `src/lib/services/*.service.ts` file; every other domain's business logic lives directly inside its `src/actions/*.ts` file, calling `prisma` inline.

**Why (inferred):** The 4 services that do exist are exactly the ones with either external HTTP integration (ZKTeco, email/SMTP) or calculation logic reused by multiple call sites (EMI math used by both `applyForLoan`'s eligibility check and `approveLoan`'s schedule setup) — i.e. services were extracted only where genuine reuse or an external boundary demanded it, not as a blanket architectural layer.

**Tradeoffs observed:** Business logic and data access are tightly coupled per action file — testing a business rule in isolation from Prisma would require significant mocking. `timeline.actions.ts` at ~2,700 lines is a clear symptom of this: the largest single business domain has no internal decomposition into smaller service files.

**Alternatives:** A full repository + service + controller layering (classic n-tier) for every domain — more testable and navigable at this file size, but a substantial refactor. See [CLAUDE.md](CLAUDE.md#what-should-not-be-changed) — do not introduce this layering piecemeal without a project-wide decision, since it would make the codebase inconsistent mid-refactor.

## Four separate audit-log tables instead of one generic table

**What:** `AuditLog`, `LeaveAuditLog`, `SystemControlChangeLog`, and `TimelineModificationActionLog` each capture a different domain's history, with different field shapes, rather than one generic `AuditLog(entityType, entityId, action, actorId, before, after)` table.

**Why (inferred):** Each was likely added at the time its owning feature (loans, leave automation, system control, timeline modification requests) was built, without revisiting or generalizing the earlier `AuditLog` table — a natural consequence of building features incrementally over many migrations (45 total) rather than up front.

**Tradeoffs observed:** No single place to query "everything that happened to user X" — a support/compliance query has to check up to four tables. `AuditLog` itself is oddly EMI-shaped (`oldEmi`/`newEmi` fields) but is reused for unrelated audit entries (manager org-config changes) by just setting those fields to `null` — a sign the table was extended past its original purpose rather than redesigned.

**Alternatives:** Consolidate into one polymorphic audit table with a `Json` details column (most of the data these four tables need — `SystemControlChangeLog.previousValues`/`newValues` already use `Json`, showing the pattern was known and available). Not done — likely to avoid a disruptive migration across four already-shipped features.

## Observed inconsistencies not treated as deliberate decisions

Some patterns in the code look like drift/oversight rather than intentional tradeoffs — listed here (not above) because attributing a "why" to them would be guessing:

- `manager.actions.ts` instantiates its own `new PrismaClient()` instead of importing the shared singleton from `src/lib/prisma.ts` — every other action file uses the singleton.
- `formatCurrency()` is defined identically in both `src/lib/currency.ts` and `src/lib/utils.ts`.
- `PaymentType` enum includes `MANAGER_VERIFIED`/`MANAGER_REJECTED` members that look copy-pasted from `LoanStatus` — no code path was found that sets a `Payment.type` to either value.
- ZKTeco credentials (`SystemControlSettings.zktecoPassword`) are stored in plaintext while the structurally similar SMTP credential (`EmailConfig.appPasswordEncrypted`) is AES-256-GCM encrypted.
- `LeaveType.applicableBranches` is a JSON-encoded string (`String`, default `"[]"`) while the very similar `PublicHoliday.applicableBranchIds` is a native Postgres `String[]` — two different representations of "which branches does this apply to" in the same schema.
- `node-cron` is an unused dependency (see [In-process interval loops](#in-process-interval-loops-instead-of-a-job-queue)).
- Several `/api/cron/*` and admin-trigger routes have no role/permission check at all, while every Server Action rigorously re-checks permissions (see [API.md](API.md)'s summary table).
- `/api/test-increments/route.ts` is explicitly a manual debug script left in the routable `app/api` tree rather than removed or gated to development only.

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for the operational impact of these, where relevant.
