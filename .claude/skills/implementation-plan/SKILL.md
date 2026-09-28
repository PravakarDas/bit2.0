---
name: implementation-plan
description: A step-by-step checklist for implementing a new feature or workflow in bit2.0, following the codebase's established conventions end to end (schema, action, auth guard, UI, sidebar, notifications). Use when planning or starting any non-trivial new feature, not just for small bug fixes.
---

# bit2.0 — Implementation Plan Checklist

This is a **process skill**, not a fixed roadmap — bit2.0 has no single canonical backlog
document; use this checklist to plan any new feature so it lands consistent with the rest
of the app. Load the more specific skills (`[[app-flow]]`, `[[backend-schema]]`,
`[[auth-roles-permissions]]`, `[[ui-ux-design]]`, `[[attendance-automation]]`,
`[[payroll-finance]]`) for the details behind each step below.

## 1. Scope the feature against existing patterns first

Before writing anything new, check whether the feature is a variant of an existing workflow:

- Is it an **approval workflow** (employee requests → manager verifies → admin
  approves/declines)? Loans, overtime requests, and timeline modification requests all
  follow this exact shape — copy that model rather than inventing a new status flow.
- Is it **money-moving**? Route it through the existing wallet ledger / `SalaryPayment` /
  loan patterns in `[[payroll-finance]]` instead of a new ad hoc balance field.
- Is it **admin-only vs. admin+manager**? Decide this early since it determines which route
  group(s) the pages go in and which action-level check to reuse (see
  `[[auth-roles-permissions]]`).

## 2. Data model

1. Add/extend a Prisma model in `prisma/schema.prisma`, following existing conventions:
   `cuid()` ids, `createdAt`/`updatedAt`, a `*Status` enum + `reviewedBy`/`reviewedAt` pair
   for anything with an approval step, month-scoped data keyed by a `"YYYY-MM"` string, `Float`
   for money.
2. `npx prisma migrate dev --name <feature_name>` to generate the migration — never hand-edit
   `prisma/migrations/`.
3. If the feature needs an audit trail, reuse or extend `AuditLog`/`LeaveAuditLog`/
   `SystemControlChangeLog`/`TimelineModificationActionLog` rather than adding a bespoke log
   table unless the shape genuinely doesn't fit.

## 3. Server actions

1. Add a new `src/actions/<feature>.actions.ts` (or extend an existing one if the feature is
   clearly part of an existing domain, e.g. a new loan sub-feature belongs in
   `loan.actions.ts`, not a new file).
2. Every action starts with `getDbUser()` to resolve the actor, then an explicit role/
   ownership check (copy the `["SUPERADMIN","HR"].includes(actor.role) ||
   (actor.role === "EMPLOYEE" && actor.isManager)` idiom, or scope by
   `userId`/`branchId` for self-service actions) — see `[[auth-roles-permissions]]`.
3. Wrap multi-step mutations in `prisma.$transaction`, matching the pattern in
   `processPayroll`/`processLoanPayment`.
4. If the feature needs to notify someone, reuse `createAdminNotification` /
   `EmployeeNotification` creation helpers rather than inventing a new notification path.

## 4. Pages & UI

1. Place pages under the correct route group(s) — duplicate the page across `(admin)` and
   `(manager)` when both need it (this is the existing pattern; there's no shared-route
   trick used here), scoping the underlying action query by branch for the manager version.
2. Compose from `src/components/ui/*` primitives; put portal-specific components in
   `src/components/{admin,manager,employee}/`, cross-portal ones in `shared/` — see
   `[[ui-ux-design]]`.
3. Add the page to the relevant sidebar (`AppSidebar` and/or `ManagerSidebar`) so it's
   actually reachable — easy to forget.
4. Match the existing loading/empty/error state conventions (`Skeleton`, explicit empty
   messages) and table/dialog/form idioms already in that portal.

## 5. Cross-cutting checks before calling it done

- **Auth**: does every new action re-check the actor, not just rely on the page being
  behind a gated layout?
- **Reversibility**: if the feature edits attendance, leave balances, wallet, or loans, does
  it have an explicit reverse/undo path (matching the `reverse*`/`reconcile*` helpers in
  `timeline.actions.ts`) for when an admin needs to correct a mistake?
- **Idempotency**: if the feature can be triggered by a cron job or retried, can it run
  twice without double-applying (matching the `lastRunDate` guard pattern in
  `instrumentation.ts`)?
- **Migration safety**: since `prisma migrate deploy` runs automatically on every container
  start (`[[deployment-infra]]`), does the migration work against existing production data
  (defaults for new required columns, backfill for new non-null fields)?
- **Types**: run `pnpm lint` (ESLint via `eslint.config.mjs`) and `tsc` (via `next build`)
  before considering the feature complete — there's no separate test suite in this repo
  beyond a `playwright-report/` directory, so linting/type-checking plus manual verification
  in the browser is the actual quality gate.
