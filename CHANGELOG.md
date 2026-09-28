# CHANGELOG.md

This project has no tagged releases, no `version` bumps beyond `package.json`'s static `"0.1.0"`, and no prior `CHANGELOG.md`. This file summarizes the project's evolution as reconstructed from `git log` (211 commits total) and `prisma/migrations/` (45 migrations), and states current status as a single logical "Version 1.0.0" baseline per the documentation brief.

See also: [DECISIONS.md](DECISIONS.md), [DATABASE.md](DATABASE.md#migration-strategy), [ARCHITECTURE.md](ARCHITECTURE.md).

## Table of Contents

- [Version 1.0.0 — Current State](#version-100--current-state)
- [Implemented Modules](#implemented-modules)
- [Development History Summary (from git log)](#development-history-summary-from-git-log)
- [Known Limitations](#known-limitations)
- [Future Direction](#future-direction)

## Version 1.0.0 — Current State

`package.json` version is `0.1.0` and has apparently never been bumped despite 211 commits and 45 schema migrations — version numbering is not actively used as a release-tracking mechanism in this project. The "Version 1.0.0" heading below is a documentation convenience representing the current `main` branch state at the time this documentation was generated, not an official release tag.

## Implemented Modules

Reverse-engineered from `src/actions/*.ts`, `prisma/schema.prisma`, and route structure (full detail in [README.md](README.md#main-features) and [ARCHITECTURE.md](ARCHITECTURE.md)):

- Clerk-based authentication with role-based routing (`SUPERADMIN` / `HR` / `EMPLOYEE`, plus an `isManager` flag)
- Employee onboarding & approval workflow, archive/reactivate lifecycle with payroll continuation window
- Organization structure: Branches, Departments (hierarchical), Designations
- Attendance/Timeline: daily record generation, ZKTeco biometric sync (DAILY or INTERVAL mode), manual edit/reprocess, employee-submitted modification requests
- Leave management: leave types, per-user entitlements, applications, public/branch holidays, nightly automation (auto-leave deduction, auto-absence wallet penalty, late-checkin penalty)
- Overtime: employee requests with manager-verification + admin approval, year-end OT/UT-to-wallet payout calculation
- Loans/EMI: application with eligibility rules, manager-verification + admin approval, EMI scheduling, waterfall payment processing, manual/legacy loan entry
- Medical claims: annual entitlement tracking against a configurable global limit, claim approval workflow
- Payroll: monthly run combining base salary, allowances (fixed/branch/custom), bonuses, medical reimbursement, and loan deduction into an immutable per-employee record
- Wallet: ledger of all credits/debits, employee reimbursement request workflow, admin manual adjustments
- Notifications: admin notification center with a generic approve/reject dispatcher, per-employee notifications, org/branch/individual "Breaking Notice" announcements with versioning and read tracking
- System Control: DB-backed cron scheduling and ZKTeco credential management with change-history logging; SMTP email configuration with encrypted credential storage
- Role management: SUPERADMIN-only role/manager-flag/archive administration
- Manager tooling: manager-scoped mirrors of employee directory, dashboard, and approval screens with salary/financial fields excluded

## Development History Summary (from git log)

The commit history (not individually reproduced here — see `git log` directly for full detail) shows the project was built feature-by-feature via PRs merged to `main`, with the following broad phases visible in commit message content and migration timestamps:
1. **Foundational schema** (`20260124*` migrations): users, branches, bonuses, payroll/claims, medical entitlements, settings, dynamic allowances, salary history, wallet transactions, loan fields.
2. **Employee profile depth** (`20260128`–`20260219` migrations): profile fields, image support, professional links, emergency/nominee details.
3. **Timeline/attendance system** (`20260129145310_add_timeline_system` onward, plus many `fix(...)`/`fix:` commits referencing timeline, leave-automation, and overtime bugs): the largest and most iterated-on subsystem, including a documented 4-day grace-window fix for incomplete attendance records (`a8d3b6a`/`be7a6b5`) and a fix syncing approved timeline modifications back into `DailyTimeRecord` (`9fb47c3`).
4. **Overtime request system** (`20260219181932_add_overtime_request_system`) and manager-verification (`20260316164814_add_manager_verification`, plus the `remove_manager_role`/`add_is_manager_field` migration pair — see [DECISIONS.md](DECISIONS.md)).
5. **Operational/infra hardening**: self-hosted Postgres with S3 (barman-cloud) backups and a Docker build/ship GitHub Actions workflow (`9b22539` and follow-up fixes `0991d27`, `890df1b`, `a4dab40`).
6. **Employee Notes** (`e40075a`, `45780d5` — includes a same-day fix for a missing production migration, illustrating the migration-drift risk documented in [TROUBLESHOOTING.md](TROUBLESHOOTING.md)).
7. **UI/UX redesign passes**: timeline page redesign (`1a93cef`, PR #26), standardized 12-hour timestamp formatting app-wide (`8b7b523`), admin/manager role-handling refactor (`1a93cef`).
8. **Most recent commit** (`6feb58a`): nodemailer setup and test-mail sending — i.e. the SMTP/System-Control email feature (`EmailConfig`, `src/lib/services/email.service.ts`) is the newest addition at the time of this documentation.

## Known Limitations

Directly observable from the code (see [DECISIONS.md](DECISIONS.md) for the "why" behind several of these):

- No automated test suite exists anywhere in the repository.
- No CI test/lint gate before deployment — `.github/workflows/deploy.yml` builds and ships on every push to `main` with no verification step.
- Background jobs (`instrumentation.ts`) run in-process and assume a single app replica; not horizontally-scalable as currently implemented.
- `node-cron` dependency is unused dead weight.
- ZKTeco credentials are stored in plaintext (`SystemControlSettings`), unlike the encrypted SMTP credential.
- Money is stored as `Float`, not `Decimal` — a latent rounding-precision risk in payroll/EMI arithmetic.
- Several `/api/cron/*` and admin-trigger routes have no role/permission check.
- `/api/test-increments` is a leftover manual debug endpoint reachable in any environment.
- Two parallel "keep `User` in sync with Clerk" mechanisms exist (webhook + on-visit sync) with no visible reconciliation if they ever disagree.
- No error boundaries (`error.tsx`) were found under `src/app/`.
- Four separate, non-unified audit-log tables instead of one generic audit table.

## Future Direction

"Future planned modules (only if discoverable)": no roadmap document, TODO tracker, or planning file was found anywhere in the repository. A small number of in-code signals hint at incremental/unfinished work, listed here strictly as observed, not as confirmed plans:
- `manual-loan.actions.ts` has an `isManuallySeeded` field on `Loan` that a code comment notes is "TODO-commented out pending a migration" in at least one code path — suggesting a manual-loan-flagging feature was mid-implementation.
- The parallel existence of in-process cron loops and equivalent `/api/cron/*` HTTP endpoints (see [DECISIONS.md](DECISIONS.md)) suggests a possible in-progress or considered migration toward externally-triggered scheduling.

No other forward-looking plans could be determined from the current codebase.
