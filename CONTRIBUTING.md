# CONTRIBUTING.md

Coding standards reverse-engineered directly from the existing codebase (not a prescriptive style guide invented for this document — every rule below reflects an observed, repeated pattern). Follow these to keep new code indistinguishable from existing code.

See also: [CLAUDE.md](CLAUDE.md) (AI-agent-focused conventions — significant overlap with this file, written for human contributors), [DECISIONS.md](DECISIONS.md).

## Table of Contents

- [Formatting](#formatting)
- [File & Folder Naming](#file--folder-naming)
- [Class / Component Naming](#class--component-naming)
- [Function & Variable Naming](#function--variable-naming)
- [Prisma Model & Enum Naming](#prisma-model--enum-naming)
- [DTO / Return-Value Conventions](#dto--return-value-conventions)
- [Error Handling](#error-handling)
- [Validation](#validation)
- [Logging](#logging)
- [Git Workflow](#git-workflow)
- [How to Add a New Module](#how-to-add-a-new-module)

## Formatting

- No Prettier config file found in the repository — formatting is whatever ESLint's `eslint-config-next` (`core-web-vitals` + `typescript` presets) allows, which does not enforce a strict formatting style. `eslint.config.mjs` explicitly **disables** several checks project-wide: `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-require-imports`, `@typescript-eslint/no-unused-vars`, `react-hooks/exhaustive-deps`, `react-hooks/set-state-in-effect`, `react-hooks/error-boundaries`, `react-hooks/purity`, `react/no-unescaped-entities`, `@next/next/no-img-element`. **Do not re-enable these locally in a new file** — the codebase relies on `any` and effect dependencies being unchecked in many places.
- Indentation is inconsistent between files (4-space in some action files like `user.actions.ts`, mixed elsewhere) — match the file you're editing, don't reformat whole files as a side effect of a small change.
- Double quotes are the dominant string-literal style across `src/actions/*.ts`; single quotes appear in some `src/app/api/*` route files. Match the file you're in.

## File & Folder Naming

| Kind | Convention | Example |
|---|---|---|
| Server Action file | `<kebab-or-single-word-domain>.actions.ts` in `src/actions/` | `leave-automation.actions.ts`, `timeline-modification-request.actions.ts` |
| Service file | `<domain>.service.ts` in `src/lib/services/` | `zkteco.service.ts` |
| Lib helper | `<purpose>.ts` in `src/lib/` (no suffix) | `employee-status.ts`, `timeline-status.ts` |
| React component | PascalCase `.tsx` | `EmployeeTimelineTable.tsx` |
| shadcn/ui primitive | lowercase-kebab `.tsx` in `src/components/ui/` | `alert-dialog.tsx`, `dropdown-menu.tsx` |
| Route Handler | always `route.ts` inside a descriptive folder path | `src/app/api/leave-automation/route.ts` |
| Page | always `page.tsx` inside the route's folder | `src/app/(admin)/admin/payroll/page.tsx` |
| Route group | parenthesized, matches the role it gates | `(admin)`, `(manager)`, `(employee)` |
| Dynamic segment | bracketed, camelCase | `[id]`, `[employeeId]` |

Feature components are namespaced by folder to match the role that primarily consumes them: `src/components/admin/`, `manager/`, `employee/`, `shared/` (used by 2+ roles), `system/` (System Control/Email Config), `late-checkin/`, `timeline-modification/`. When adding a new component, put it in the folder matching its primary consumer, not in `shared/` by default — reserve `shared/` for components genuinely used by more than one role.

## Class / Component Naming

- React components: PascalCase, descriptive of the feature + role when ambiguous — e.g. `ManagerOvertimeVerificationClient.tsx`, `AdminWalletDashboard.tsx`, `EmployeeTimelineCalendar.tsx`. The `...Client` suffix marks a top-level `"use client"` component that owns significant local state for a page (as opposed to smaller presentational client components without the suffix).
- The one class-per-file singleton pattern in `src/lib/services/*.service.ts` names the class `<Domain>Service` (e.g. `EmailService`, `ZKTecoService`) and exports a lowercase singleton instance (`emailService`, `zkTecoService`) — **import and use the singleton, never `new` the class**.

## Function & Variable Naming

- Server Action exports: verb-first, domain-scoped, and mirror their own file's domain — `getActiveEmployees`, `approveEmployeeWithDetails`, `toggleUserArchiveStatus`, `applyForLoan`. Boolean-returning/status-check helpers use `is`/`has`/`should` prefixes (`isActiveStatus`, `shouldGeneratePayroll`).
- "Get all" vs. "get mine" vs. "get pending" is a consistent three-way split across almost every domain: `getAllLoans`/`getMyLoans`, `getAllWalletRequests`/`getMyWalletRequests`, `getAllOvertimeRequestsWithManagerInfo`/`getMyOvertimeRequests`. When adding a new listing function to an existing domain, follow this naming split rather than inventing new terms (e.g. `list...`, `fetch...`).
- Approve/reject pairs are consistently named `approve<Entity>`/`reject<Entity>` or `verify<Entity>Request`/`reject<Entity>Request` for the manager-verification step — see [CLAUDE.md](CLAUDE.md#backend-patterns-server-actions).
- Manager-scoped mirrors of admin functions get a `ForManager` suffix (`getActiveEmployeesForManager`, `getPendingProfileUpdateRequestsForManager`) rather than a separate naming scheme.

## Prisma Model & Enum Naming

- Models: PascalCase singular nouns (`User`, `Loan`, `DailyTimeRecord`, `BreakingNoticeRecipient`).
- Enums: PascalCase type name, `SCREAMING_SNAKE_CASE` members (`LoanStatus.MANAGER_VERIFIED`, `DailyRecordStatus.WEEKLY_OFF`).
- Named relations use a descriptive string matching the role of that specific FK, not the field name — e.g. `@relation("LoanManagerVerification")`, `@relation("TimelineModificationActionActor")` — required whenever a model has more than one FK to the same target model (see [DATABASE.md](DATABASE.md#relationship-summary)). Follow this exact naming style (`"<Model><Purpose>"`) when adding a second relation to an existing target model.

## DTO / Return-Value Conventions

There is no formal DTO layer or shared response-type definitions (no `types/api.ts` or equivalent was found). Conventions observed instead:
- Mutating actions return a plain object literal: `{ success: true, message?, ...data }` or `{ success: false, error: string }`. **New actions should follow this exact shape** — callers universally check `.success` before reading anything else (see any `"use client"` component calling an action, e.g. `src/components/admin/ApprovalButtons.tsx`).
- Read-only "get" actions typically return the raw Prisma result (or an array of it) directly, with `include`/`select` shaping the payload — there is no separate mapping/serialization step between Prisma and the component prop.
- A few actions `throw` instead of returning `{ success: false }` for permission failures (e.g. many functions do `if (!admin) throw new Error("Unauthorized")` at the top). This inconsistency is a known trait of the codebase, not a bug to silently "fix" everywhere — but new code should prefer the `{ success: false, error }` return style since it's the majority pattern and plays better with the `toast.error(result.error)` UI convention.

## Error Handling

See [CLAUDE.md](CLAUDE.md#error-handling-conventions) for the full breakdown. In short: `try/catch` + `console.error(...)` + return a plain error object (Server Actions) or `NextResponse.json({ error }, { status })` (Route Handlers). No custom `Error` subclasses, no centralized error mapper, no `error.tsx` boundaries found under `src/app/`.

## Validation

- No single validation strategy. `zod` + `react-hook-form` + `@hookform/resolvers` are available and used in some client forms, but most Server Actions validate manually with early-return `if` checks (`if (!branchId) return { success: false, error: "Branch is required..." }`).
- When adding a field to an existing form/action, match whatever validation style that specific file already uses rather than introducing `zod` into a file that currently validates manually, or vice versa — consistency within a file matters more than project-wide uniformity here.

## Logging

- `console.log`/`console.error`/`console.warn` are used directly throughout — no logging library (no `pino`/`winston`/etc.).
- Two DB-backed "audit" logging mechanisms exist for state that needs to be queryable later (not just console output): `SystemAudit` (email send attempts, payroll run outcomes) and the four domain-specific audit tables (`AuditLog`, `LeaveAuditLog`, `SystemControlChangeLog`, `TimelineModificationActionLog` — see [DATABASE.md](DATABASE.md)). Use the matching one for the domain you're working in rather than inventing a new audit table.
- Do not add a new logging dependency without discussing it first — this is a deliberate low-dependency choice observed consistently across 34 action files.

## Git Workflow

Reverse-engineered from `git log` only (no `CONTRIBUTING`-specific branch/PR policy file existed before this document):
- Feature branches merged into `main` via Pull Request (recent history shows merge commits like "Merge pull request #26 from PravakarDas/timelinepage_redesign").
- Branch names observed: short, kebab-case, feature-descriptive (`timelinepage_redesign`, `fix`, `mailSetup` — inconsistent snake_case/lowercase, not strictly enforced).
- Commit message style: `(type): short description`, e.g. `(feat): nodemailer setup and test mail sending part added`, `(fix): admin & manegr timeline page employee name search`, `(refactor): improve admin and manager role handling, ...`. Parenthesized conventional-commit-like type prefix (`feat`, `fix`, `refactor`) followed by a colon and a plain-English summary — match this style for new commits.
- No CI test gate exists on `main` (the only workflow is `deploy.yml`, which builds and ships on every push to `main` with no test/lint step — see [SETUP.md](SETUP.md)).
- `.gitignore` excludes all `*.md` files — remember to add explicit negations (`!README.md` etc.) if you want documentation tracked in version control.

## How to Add a New Module

Based on the consistent shape of every existing domain (e.g. compare `medical.actions.ts` and `wallet.actions.ts` — structurally near-identical despite different business rules):

1. **Add Prisma model(s)** to `prisma/schema.prisma`, run `pnpm prisma migrate dev --name <description>`.
2. **Create `src/actions/<domain>.actions.ts`**, starting with `"use server";` and `import { prisma } from "@/lib/prisma";`.
3. Implement CRUD/workflow functions following the `getAll.../getMy.../getPending...` naming split and the `{ success, ... }` return convention.
4. Add permission checks inline in every exported function (resolve caller via `getDbUser()`, compare `role`/`isManager`).
5. Wrap any multi-write mutation in `prisma.$transaction`.
6. Call `createAdminNotification()` for anything admin should be alerted to; call the manager-audit helpers (`logManagerOrganizationAction`/`logManagerEmployeeEditAction`) if a manager can perform admin-equivalent actions in this domain.
7. Call `revalidatePath()` for every page (admin/manager/employee mirrors as applicable) that will display the new/changed data.
8. Build the UI: a `page.tsx` (Server Component) that calls the new action and passes data to a `"use client"` component in the matching `src/components/<role>/` folder, built from `src/components/ui/*` primitives.
9. If external HTTP calls or nontrivial calculations are needed by more than one action, extract them into `src/lib/services/<domain>.service.ts` rather than duplicating logic across action files.
10. Update [DATABASE.md](DATABASE.md), [API.md](API.md) (if you added a Route Handler), and [CLAUDE.md](CLAUDE.md)'s reusable-services/utilities tables if you added something other modules should reuse.
