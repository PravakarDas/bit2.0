---
name: backend-schema
description: Maps bit2.0's Prisma/PostgreSQL data model — the User-centric schema, its domain clusters (org, attendance, leave, loans, medical, wallet, payroll, notices, notifications), and migration conventions. Use when writing queries, adding a model/field, or reasoning about relations.
---

# bit2.0 — Backend Schema

Single source of truth: [prisma/schema.prisma](prisma/schema.prisma) (Postgres, Prisma 6
client). Client singleton: [src/lib/prisma.ts](src/lib/prisma.ts) — always import `prisma`
from there, never instantiate `PrismaClient` directly. Migrations live in
`prisma/migrations/` (timestamp-prefixed, one per feature); seed script is
`prisma/seed.js`.

## Everything hangs off `User`

`User` ([schema.prisma:165](prisma/schema.prisma#L165)) is the hub of the schema. Key
identity/status fields:

- `clerkId` (unique) links to Clerk auth; `email` unique.
- `role: Role` (`SUPERADMIN | HR | EMPLOYEE`) + `isManager: Boolean` — manager is a flag on
  an `EMPLOYEE`, not its own role (see `[[auth-roles-permissions]]`).
- `status: UserStatus` (`PENDING | APPROVED`) — new sign-ups start `PENDING` until an
  admin approves them.
- `employeeStatus: EmployeeStatus` (`ACTIVE | PROBATION | RESIGNED | TERMINATED | LAYOFF |
  RETIRED | CONTRACT_ENDED | SUSPENDED | ABSCONDED`) plus `isArchived` /
  `archivedAt` / `payrollContinuationMonths` — an archived employee's payroll keeps running
  for N months after departure, see `[[payroll-finance]]`.
- `walletBalance` and `baseSalary` are denormalized "current value" fields kept in sync by
  actions/services — history lives in `WalletTransaction` and `BaseSalary` respectively;
  never trust a stale cached value over the ledger when doing financial calculations.
- One free-text `EmployeeNote` thread per employee, visible to Admin/Manager only (not the
  employee).

From `User`, dozens of one-to-many relations fan out into the domain clusters below — nearly
every feature model has a required `userId` FK back to `User`.

## Domain clusters

**Org structure**: `Branch` (has check-in/out times, break duration, weekly-off days per
branch — attendance requirements are branch-configured, not global) → `Department` (self-
referencing hierarchy via `parentId`) → `Designation`. `PublicHoliday` can be global or
scoped to specific `applicableBranchIds`.

**Attendance/Timeline**: `DailyTimeRecord` (one row per user per date, `@@unique([userId,
date])`) carries required vs. actual check-in/out, computed active time, and
overtime/undertime deltas. `DailyTimeRecordTemporary` is a staging table (`onDelete:
Cascade`) used during timeline regeneration/backfill before promoting rows into
`DailyTimeRecord`. See `[[attendance-automation]]`.

**Leave**: `LeaveType` (allocated days/year, `LeaveResetPolicy`) → `UserLeaveEntitlement`
(per user/type/year balance, `@@unique([userId, leaveTypeId, year])`) → `LeaveApplication`
(status workflow) → `LeaveAuditLog` (append-only trail of every automated/manual leave
balance change — write to this whenever balances change programmatically).

**Loans**: `Loan` → `EmiState` (1:1, current EMI + carry-forward) → `Payment` (per-payroll-
month ledger entries) → `AuditLog` (EMI recalculation history). Status has both an
admin-approval track and a `MANAGER_VERIFIED`/`MANAGER_REJECTED` pre-approval track. See
`[[payroll-finance]]` for the EMI math.

**Medical**: `MedicalEntitlement` (per user/year limit + remaining balance, `@@unique([userId,
year])`) → `MedicalClaim` (status workflow, optional link back to the entitlement).

**Wallet**: `WalletTransaction` (append-only ledger, `TransactionType` enum) and
`WalletRequest` (employee-initiated withdrawal/adjustment request with its own approval
status) — two different things, don't conflate them.

**Payroll**: `SalaryPayment` (one row per user per processed month — snapshot of base
salary, bonuses, allowances, medical reimbursement, loan deduction, wallet adjustment, net
amount), `AllowanceType`/`EmployeeAllowance`/`PayrollAllowanceOverride` (per-month
include/exclude/override of an allowance for a specific user), `BonusType` (branch-scoped),
`OvertimePayout` (yearly overtime settlement, `@@unique([userId, year])`).

**Overtime & timeline correction workflows**: `OvertimeRequest` and
`TimelineModificationRequest` both follow the same shape — employee requests → manager
verifies (`MANAGER_VERIFIED`/`MANAGER_REJECTED`) → admin approves/declines —
plus `TimelineModificationActionLog` as an immutable audit trail of every action taken on a
modification request.

**Comms/audit**: `AdminNotification` (system-generated, admin-facing),
`EmployeeNotification` (user-facing), `BreakingNotice` +
`BreakingNoticeRecipient` (broadcast to all/one branch/one employee, with per-recipient
seen-state and versioning for edits), `SystemAudit` and `SystemControlChangeLog`
(who changed system settings and what changed).

**System control**: `SystemSettings` (id `"global"`, e.g. medical claim limit) and
`SystemControlSettings` (id `"global"`, cron timing/enablement + ZKTeco credentials — see
`[[attendance-automation]]` and `[[deployment-infra]]`).

## Conventions when touching the schema

- IDs are `cuid()`. Money fields are `Float` (not `Decimal`) — stay consistent with existing
  rounding behavior (e.g. `Math.round` in EMI calc) rather than introducing new precision.
- Month-scoped rows (payroll, EMI payments, allowance overrides) key off a `String` like
  `"2024-01"`, not a `DateTime` — match this when adding new month-scoped data.
- Every status-driven workflow model pairs a `*Status` enum with `reviewedBy`/`reviewedAt`
  (or `approvedBy`/`approvedAt`) fields — follow this shape for new approval workflows
  instead of inventing a new pattern.
- Run `npx prisma migrate dev --name <description>` for schema changes locally; never hand-
  edit files under `prisma/migrations/`. `prisma/migrations/migration_lock.toml` pins the
  provider — don't touch it.
