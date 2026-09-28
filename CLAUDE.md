# CLAUDE.md — AI Agent Context File

This file is the primary context file for Claude / other AI coding agents working in this repository. Read this before making changes. It documents observed conventions only — anything not directly observable in the code is marked "Not found in current project."

See also: [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE.md](DATABASE.md), [API.md](API.md), [CONTRIBUTING.md](CONTRIBUTING.md), [DECISIONS.md](DECISIONS.md).

## Table of Contents

- [Project Summary](#project-summary)
- [Overall Architecture](#overall-architecture)
- [Folder Responsibilities](#folder-responsibilities)
- [Backend Patterns (Server Actions)](#backend-patterns-server-actions)
- [Frontend Patterns](#frontend-patterns)
- [Database Access Patterns](#database-access-patterns)
- [Authentication Flow](#authentication-flow)
- [Authorization Flow](#authorization-flow)
- [Error Handling Conventions](#error-handling-conventions)
- [Validation Conventions](#validation-conventions)
- [Naming Conventions](#naming-conventions)
- [Existing Reusable Services](#existing-reusable-services)
- [Existing Helper Utilities](#existing-helper-utilities)
- [Existing Middleware](#existing-middleware)
- [Existing "Repositories"](#existing-repositories)
- [What Should NOT Be Changed](#what-should-not-be-changed)
- [What Should Always Be Reused](#what-should-always-be-reused)
- [Patterns That Must Always Be Followed](#patterns-that-must-always-be-followed)

## Project Summary

Bit HR — a Next.js 16 (App Router) monolithic HRM/payroll application for a multi-branch organization. No microservices, no separate API backend, no message queue. Server Actions in `src/actions/*.ts` are the entire business-logic/data-access layer. Prisma + PostgreSQL is the only datastore. Clerk handles authentication. See [README.md](README.md) for the feature list and [ARCHITECTURE.md](ARCHITECTURE.md) for the request-flow diagram.

## Overall Architecture

There are no `controllers/`, `services/` (only 4 small helper files under `src/lib/services/`), or `repositories/` folders in the traditional sense. The real layering is:

1. **Route layer** — `src/app/**/page.tsx` (Server Components) and a handful of `src/app/api/**/route.ts` Route Handlers.
2. **Action layer** — `src/actions/*.ts`, each file marked `"use server"` at the top, grouped by domain (one file per domain, e.g. `loan.actions.ts`, `leave.actions.ts`). These are called directly from both Server Components and Client Components (Next.js Server Actions can be imported into client code and invoked like async functions).
3. **Thin service layer** — `src/lib/services/*.service.ts` (email, loan math, medical math, ZKTeco HTTP client). Used only for **calculation-heavy or external-HTTP logic** that multiple actions need; most domains do NOT have a service file and put logic directly in the action.
4. **Data layer** — `src/lib/prisma.ts` exports a singleton `PrismaClient`; every action imports `{ prisma }` from `@/lib/prisma` and queries directly. There is no repository/DAO abstraction.

Full diagrams: [ARCHITECTURE.md](ARCHITECTURE.md).

## Folder Responsibilities

| Folder | Responsibility |
|---|---|
| `src/app/(admin)/admin/**` | SUPERADMIN-only pages. Layout (`(admin)/layout.tsx`) redirects anyone else to `/unauthorized`. |
| `src/app/(manager)/manager/**` | Pages for `role === "EMPLOYEE" && isManager === true`. Layout redirects everyone else to `/unauthorized`. |
| `src/app/(employee)/**` | Pages for any approved user (`status === "APPROVED"`). Layout also renders manager sub-routes' children directly if the pathname contains `/employee/manager` (see `src/app/(employee)/layout.tsx`). |
| `src/app/api/**` | Route Handlers: 1 Clerk webhook, cron trigger endpoints, and a few small REST-style JSON endpoints. Full list in [API.md](API.md). |
| `src/actions/*.ts` | Business logic + Prisma access, one file per domain. This is where you add/modify almost all backend logic. |
| `src/lib/services/*.ts` | Cross-cutting calculation/integration logic reused by multiple actions (EMI math, medical entitlement math, SMTP sending, ZKTeco HTTP client). |
| `src/lib/*.ts` (non-services) | Small stateless helpers: `roles.ts` (Clerk role check), `crypto.ts` (AES-256-GCM secret encryption), `currency.ts`/`utils.ts` (formatting), `duration.ts` (HH:MM parsing for display), `employee-status.ts` (active/archived status logic), `email-config.ts`/`system-control.ts` (DB-config upsert helpers), `timeline-status.ts` (attendance badge display logic). |
| `src/components/admin`, `manager`, `employee`, `shared`, `system`, `late-checkin`, `timeline-modification` | Feature components, namespaced by which role primarily uses them. `shared/` = used by more than one role. |
| `src/components/ui` | shadcn/ui primitives — generated, generally do not hand-edit business logic into these; extend via composition instead. |
| `src/hooks` | Custom React hooks (currently only `use-mobile.ts`). |
| `src/types` | Ambient type declarations (`clerk.d.ts` augments Clerk's session claims). |
| `prisma/` | `schema.prisma` (single schema file), `migrations/`, `seed.js`. |

## Backend Patterns (Server Actions)

Every file in `src/actions/`:
```ts
"use server";

import { prisma } from "@/lib/prisma";
// often: import { getDbUser } from "./user.actions";
// often: import { revalidatePath } from "next/cache";

export async function someAction(...) {
  // 1. Resolve caller (getDbUser() OR raw auth() + prisma.user.findUnique)
  // 2. Permission check (throw or return { success: false, error }) 
  // 3. Prisma query/mutation, wrapped in prisma.$transaction(...) if it touches money/leave/status together
  // 4. revalidatePath(...) for every page that displays the mutated data (commonly both /admin/... and /manager/... mirrors)
  // 5. return a plain object (usually { success, ...data } or { success: false, error })
}
```

Key recurring rules:
- **Permission checks are per-function, not centralized.** There is no shared middleware/guard wrapper for actions — every exported action re-implements its own role check inline. When adding a new action, copy the pattern from a sibling function in the same file rather than inventing a new check style.
- **Two caller-resolution styles coexist**: most files call `getDbUser()` (from `user.actions.ts`); a few call `@clerk/nextjs/server`'s `auth()` directly and do `prisma.user.findUnique({ where: { clerkId } })` inline (e.g. `overtime-request.actions.ts`, `manual-loan.actions.ts`). Prefer `getDbUser()` for new code — it is the more common and more DRY pattern.
- **The "manager can do admin-equivalent org-config actions" pattern**: a local `canManageOrganization(user)` helper (`role === "SUPERADMIN" || (role === "EMPLOYEE" && isManager)`) gates branch/department/designation/bonus/leave-type/allowance/settings mutations. When a manager performs one of these, the action calls `logManagerOrganizationAction` (`manager-organization.actions.ts`) or `logManagerEmployeeEditAction` (`manager-employee-edit.actions.ts`) to write an `AuditLog` row and notify SUPERADMINs via `createAdminNotification`. **Reuse these two logging helpers for any new manager-privileged mutation** — do not write ad-hoc audit logging.
- **The two-step "manager verifies, then admin decides" workflow** exists ONLY for **Loans** and **Overtime Requests** (`manager-verification.actions.ts` + `loan.actions.ts` + `overtime-request.actions.ts`). Status enums for these two domains include `MANAGER_VERIFIED`/`MANAGER_REJECTED` in addition to `PENDING`/`APPROVED`/`DECLINED`(or `ACTIVE`/`CLOSED`). Admin approval functions accept **either** `PENDING` or `MANAGER_VERIFIED` as a valid starting state (admin can bypass manager verification). **Do not silently add this two-step pattern to other domains** (leave, medical, wallet, profile updates, timeline modification requests) — those are deliberately single-step `PENDING → APPROVED/REJECTED`, decided directly by admin or manager. If asked to add manager verification to one of those domains, treat it as a deliberate scope decision requiring confirmation, not a bug fix.
- **`prisma.$transaction` is required** whenever a mutation touches more than one of: money (`WalletTransaction`/`walletBalance`), leave balances (`UserLeaveEntitlement.usedDays`), loan/EMI state, or a status transition that has side effects (e.g. approving a leave app increments `usedDays` in the same transaction as the status update). Follow this precedent for any new "approve X" style action.
- **`createAdminNotification`** (`notification.actions.ts`) is the shared primitive for anything that should alert SUPERADMINs — reuse it rather than writing directly to the `AdminNotification` table.
- **`revalidatePath`** is called after essentially every mutation for both the admin and manager/employee route mirrors of the same data (e.g. `/admin/employees` and `/manager/employees`). When adding a new page that displays action-mutated data, add its path to the relevant action's `revalidatePath` calls.

## Frontend Patterns

- **Server Components by default.** `page.tsx` files are `async function` Server Components that call actions directly and pass data to client components as props. Route-group `layout.tsx` files are also async Server Components that call `getDbUser()` for the auth/redirect gate (see [Authorization Flow](#authorization-flow)).
- **Client components** are marked `"use client"` at the top and hold local state (`useState`/`useEffect`), call Server Actions imported from `@/actions/*` directly as async functions, and use `sonner`'s `toast` for success/error feedback (see `src/components/admin/ApprovalButtons.tsx` for the canonical shape: local loading state per button, `toast.success`/`toast.error`, dialog closes on success).
- **UI primitives**: always use `src/components/ui/*` (shadcn/ui, "new-york" style, Radix UI underneath, `src/lib/utils.ts`'s `cn()` for class merging) instead of hand-rolling buttons/dialogs/inputs.
- **Layout shell**: `SidebarProvider` + `SidebarInset` (`src/components/ui/sidebar.tsx`) wraps every route-group layout; `AppSidebar`/`Header` for admin & employee, `ManagerSidebar`/`ManagerHeader` for manager.
- **Forms**: `react-hook-form` + `@hookform/resolvers` + `zod` are dependencies, but usage is inconsistent — many dialogs (e.g. `ApprovalButtons.tsx`) use plain `useState` + manual validation instead of `react-hook-form`. When adding a non-trivial form, prefer `react-hook-form` + `zod` if the surrounding file already uses it; otherwise matching the existing file's style is preferred over introducing a new pattern into a small dialog.
- **Currency formatting**: always `formatCurrency()` (defined identically in both `src/lib/currency.ts` and `src/lib/utils.ts` — see [DECISIONS.md](DECISIONS.md) for the duplication) — renders `৳` + `en-BD` locale grouping. Never hand-format currency.
- **Date/time formatting**: `src/lib/utils.ts` (`formatDate`, `formatTime12`, `formatDateTime12`) for display; `src/lib/duration.ts` (`parseDurationToMinutes`, `formatDurationPill`) specifically for the `HH:MM`/`-HH:MM` duration strings stored on `DailyTimeRecord` (active time, overtime/undertime, break). **Do not confuse the two** — duration strings are not clock times.
- **Attendance status badges**: use `getTimelineStatusDisplay()` from `src/lib/timeline-status.ts` rather than re-implementing the PRESENT/ABSENT/ON_LEAVE/WEEKLY_OFF → label/variant/className mapping.

## Database Access Patterns

- Single Prisma client singleton (`src/lib/prisma.ts`), cached on `globalThis` in non-production to survive Next.js dev hot-reload. **Always `import { prisma } from "@/lib/prisma"`** — do not instantiate `new PrismaClient()` in new code. (`manager.actions.ts` does this today; it is a known inconsistency, not a pattern to copy — see [DECISIONS.md](DECISIONS.md).)
- No repository/DAO layer — actions call `prisma.<model>.<method>` directly.
- `prisma.$transaction(async (tx) => { ... })` for any multi-write mutation (see Backend Patterns above). Use `tx` (not `prisma`) for every query inside the callback.
- Raw SQL (`prisma.$queryRaw`/`Prisma.sql`) is rare — only seen in `dashboard.actions.ts` for two aggregate reports. Prefer the Prisma query API; only drop to raw SQL for aggregations that are awkward in Prisma's query builder, matching existing precedent.
- Soft-delete pattern: `EmployeeNote` uses `deletedAt: DateTime?` (soft delete, filtered with `deletedAt: null`). Most other models use hard delete (e.g. `deleteTimelineRecords`, `deleteLoan`, `deleteBranch`) or an `isActive`/`isArchived` boolean toggle instead of deletion. Match whichever pattern the specific model already uses — do not introduce a third deletion style for an existing model.
- Multi-tenancy: none. Single global database serving one organization; branch scoping (`Branch` model) is a business-data dimension, not a tenancy boundary.

## Authentication Flow

1. Clerk hosts sign-in/sign-up UI (`src/app/sign-in/[[...sign-in]]/page.tsx`, `sign-up/[[...sign-up]]/page.tsx`).
2. `src/proxy.ts` — the **Next.js 16 middleware file** (Next.js 16 renamed the `middleware.ts` convention to `proxy.ts`; functionally equivalent to Next.js middleware in earlier versions) — wraps every non-public route in `clerkMiddleware(...).auth.protect()`. Public routes: `/sign-in(.*)`, `/sign-up(.*)`.
3. On first authenticated request to `/`, `syncUserWithDb()` (`user.actions.ts`) either creates a new `User` row (`role: EMPLOYEE`, `status: PENDING`) or updates `email`/`imageUrl` on an existing row — **first/last name are only ever set at creation time and never overwritten from Clerk afterwards** (deliberate, see the function's own comment).
4. A hardcoded email (`pravakar459@gmail.com`) is auto-provisioned as `SUPERADMIN`/`APPROVED` on first sign-in. This is the only bootstrap admin mechanism in the codebase.
5. Clerk webhooks (`src/app/api/webhooks/clerk/route.ts`, verified via `svix`) also create/update/delete the `User` row on `user.created`/`user.updated`/`user.deleted` events — this is a secondary path to `syncUserWithDb()`, not a replacement for it.
6. `getDbUser()` (`user.actions.ts`) — `currentUser()` (Clerk) → `prisma.user.findUnique({ where: { clerkId } })` — is the standard way to get "who is calling" inside any Server Component or Server Action.
7. `src/lib/roles.ts`'s `checkRole`/`getUserRole` read the role out of the **Clerk session claims metadata** (`CustomJwtSessionClaims.metadata.role`, augmented in `src/types/clerk.d.ts`) rather than the database — "Not found in current project": where/how Clerk's session-claim metadata gets synced with the DB `User.role` field. Treat `getDbUser().role` (DB) as the authoritative source used almost everywhere in `src/actions/*`; `lib/roles.ts` appears to be a lighter-weight/legacy alternative — confirm which one a given call site expects before relying on it.

## Authorization Flow

- **Roles**: `Role` enum = `SUPERADMIN | HR | EMPLOYEE`. There is **no separate "MANAGER" role** — a manager is `role: "EMPLOYEE"` with `isManager: true` (`User.isManager: Boolean`). This is fundamental: any code that checks "is this a manager" must check both fields, e.g. `user.role === "EMPLOYEE" && user.isManager`.
- **Route-group layouts are the primary authorization gate** for pages:
  - `(admin)/layout.tsx`: redirect to `/sign-in` if no user, `/pending` if `status === "PENDING"`, `/unauthorized` if `role !== "SUPERADMIN"`.
  - `(manager)/layout.tsx`: same, but requires `role === "EMPLOYEE" && isManager === true`.
  - `(employee)/layout.tsx`: same, but only requires `status === "APPROVED"` (any approved role/manager combination may enter).
- **Action-level checks are the real enforcement boundary** — page-level gating is a UX convenience, not the security boundary, since Server Actions can be invoked directly. Every action must re-check permissions itself (see Backend Patterns) — never assume the calling page already enforced access.
- **Field-level authorization** exists in a few places: `manager.actions.ts` explicitly `select`s away salary/wallet fields when a manager queries employee data, and `profile.actions.ts`'s manager-direct-edit path restricts which `User` fields a manager may write (no salary/bank/address fields) versus what SUPERADMIN/HR can edit. Follow this precedent — don't expose salary/financial fields to manager-scoped queries or mutations without an explicit product decision.
- **Sensitive-field redaction**: `system-control.actions.ts` blanks `zktecoUsername`/`zktecoPassword` for managers (only SUPERADMIN/HR see them) and redacts them from the change-log view too.

## Error Handling Conventions

- No centralized error boundary, no global error-formatting middleware. "Unable to determine from current codebase" whether `error.tsx`/`global-error.tsx` boundaries exist — none were found under `src/app/`.
- **Server Actions**: wrap body in `try/catch`, `console.error(...)` the raw error, and return `{ success: false, error: "<message>" }` (a plain string, sometimes the caught error's message, sometimes a fixed string). Callers check `result.success` and show `result.error` via `toast.error(...)`. Some actions instead `throw new Error("Unauthorized")` for permission failures (inconsistent with the `{ success: false }` style) — check the specific function's existing pattern before adding a new branch to it.
- **API Route Handlers**: wrap body in `try/catch`, return `NextResponse.json({ error: ... }, { status: ... })` on failure (400 for bad input, 401 for auth, 404 for not found, 500 for unexpected). See [API.md](API.md) for the exact shape of every route.
- **Email sending** (`email.service.ts`) never throws to callers — `sendMail()` always resolves to `{ success, message }`, with SMTP errors mapped to human-readable messages (`mapSmtpError`) and logged to the `SystemAudit` table.

## Validation Conventions

- No consistent validation library usage across the board. `zod` is a dependency and used with `react-hook-form` in some forms, but many Server Actions do manual `if (!field) return { success: false, error: "... required" }` checks instead of a shared schema.
- When adding validation to a new Server Action, prefer the manual-check style already used by sibling functions in the same file unless the file already uses `zod` schemas.
- Business-rule validation (loan eligibility, leave entitlement checks, medical claim limits) lives inline in the relevant action or its `lib/services/*.service.ts` companion — see [ARCHITECTURE.md](ARCHITECTURE.md) for the specific formulas.

## Naming Conventions

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full reverse-engineered style guide. Summary:
- Action files: `<domain>.actions.ts`, kebab-case for multi-word domains (`leave-automation.actions.ts`, `timeline-modification-request.actions.ts`).
- Service files: `<domain>.service.ts` under `src/lib/services/`.
- Components: PascalCase `.tsx`, feature components grouped by role folder; shadcn primitives lowercase-kebab under `src/components/ui/`.
- Prisma models: PascalCase singular (`User`, `Loan`, `DailyTimeRecord`); enums PascalCase with SCREAMING_SNAKE_CASE members.

## Existing Reusable Services

| Service | File | Reuse for |
|---|---|---|
| `emailService.sendMail(...)` | `src/lib/services/email.service.ts` | Any outbound email — handles SMTP config resolution, transporter caching, and error mapping. **Never call `nodemailer` directly from an action.** |
| `calculateEMI`, `processLoanPayment`, `checkLoanEligibility`, `refreshEmiState` | `src/lib/services/loan.service.ts` | Any loan/EMI math or payment posting. |
| `checkAndCreateEntitlement`, `validateAndSubmitClaim` | `src/lib/services/medical.service.ts` | Medical entitlement lookups and claim submission validation. |
| `zkTecoService` (singleton) | `src/lib/services/zkteco.service.ts` | Any ZKTeco device HTTP call — authentication/token caching, transaction fetch, and punch-event → check-in/out/break processing already implemented here. |

## Existing Helper Utilities

| Utility | File | Use for |
|---|---|---|
| `cn()` | `src/lib/utils.ts` | Merging Tailwind classes (clsx + tailwind-merge) |
| `formatCurrency()` | `src/lib/utils.ts` / `src/lib/currency.ts` | ৳ currency display |
| `formatDate`, `formatTime12`, `formatDateTime12`, `parseFilterDate`, `getEndOfDay`, `buildDateRangeFilter` | `src/lib/utils.ts` | Display formatting and Prisma date-range filter construction |
| `parseDurationToMinutes`, `formatDurationPill` | `src/lib/duration.ts` | HH:MM duration string handling (read-only/UI side, NOT the write-path formatters inside `timeline.actions.ts`) |
| `isActiveStatus`, `isArchivedStatus`, `isArchivingTransition`, `isReactivatingTransition`, `getStatusLabel`, `getStatusBadgeVariant`, `shouldGeneratePayroll` | `src/lib/employee-status.ts` | Employee status/archive logic — reuse for any archive-related feature instead of re-deriving the active/archived status lists |
| `getTimelineStatusDisplay` | `src/lib/timeline-status.ts` | Attendance status badge label/variant |
| `encryptSecret`/`decryptSecret` | `src/lib/crypto.ts` | Any secret that must be stored in the DB (currently SMTP app password) — AES-256-GCM keyed by `EMAIL_SECRET_KEY` |
| `checkRole`, `getUserRole` | `src/lib/roles.ts` | Reading role from Clerk session claims (see Authentication Flow caveat above) |
| `getOrCreateSystemControlSettings`, `getRuntimeSystemControlConfig`, `normalizeCronPart` | `src/lib/system-control.ts` | Reading the singleton `SystemControlSettings` row |
| `getOrCreateEmailConfig` | `src/lib/email-config.ts` | Reading the singleton `EmailConfig` row |

## Existing Middleware

- `src/proxy.ts` is the **only** middleware in the app (Clerk `clerkMiddleware` + `auth.protect()` for all non-public routes; matcher excludes static assets and Next internals, always runs for `/api` and `/trpc`). There is no custom logging/rate-limiting/CORS middleware.
- `src/instrumentation.ts`'s `register()` is not HTTP middleware — it is a Next.js instrumentation hook that starts three background interval loops on Node.js runtime boot (see [ARCHITECTURE.md](ARCHITECTURE.md)).

## Existing "Repositories"

There is no repository layer. If asked to "add a repository" or "add a DAO," the correct action in this codebase is to add a new exported function to the relevant `src/actions/<domain>.actions.ts` file that calls `prisma` directly — do not introduce a new architectural layer unless explicitly asked to refactor the whole codebase.

## What Should NOT Be Changed

- **`src/lib/prisma.ts`'s singleton pattern** — do not instantiate additional `PrismaClient()` instances (an existing one in `manager.actions.ts` is a known bug, not precedent to extend).
- **`EMAIL_SECRET_KEY` handling** — per [[feedback-prisma-db-push-safety]]-style caution: changing or losing this key makes all previously-encrypted SMTP passwords unrecoverable. Never regenerate it without a migration plan for re-entering credentials.
- **The hardcoded SUPERADMIN bootstrap email** (`pravakar459@gmail.com` in `user.actions.ts`) — do not remove without providing another way to create the first SUPERADMIN.
- **Name-preservation logic in `syncUserWithDb`** — first/last name are deliberately never overwritten from Clerk after initial creation; do not "fix" this by re-syncing names on every login.
- **The single-step vs. two-step approval distinction** (see Backend Patterns) — do not add `MANAGER_VERIFIED` states to leave/medical/wallet/profile/timeline-modification workflows without explicit product sign-off; it is a deliberate, not accidental, difference from loans/overtime.
- **`.gitignore`'s `*.md` rule** — be aware that new markdown files (including this one) are not tracked by git unless the user adds an explicit negation pattern.
- Never run `prisma db push` or `prisma migrate reset` against the real database — see [[feedback-prisma-db-push-safety]] memory: a prior run of this kind deleted real data on this project. Always use `prisma migrate dev`/`deploy` and diff against the live schema first.

## What Should Always Be Reused

- `getDbUser()` for resolving the current user in Server Components/Actions.
- `createAdminNotification()` for anything that should alert SUPERADMINs.
- `logManagerOrganizationAction()` / `logManagerEmployeeEditAction()` for any manager-privileged mutation's audit trail.
- The four `lib/services/*.service.ts` modules for their respective domains (see table above).
- shadcn/ui primitives under `src/components/ui/*` for all new UI — never hand-roll a dialog/button/table when a primitive exists.
- `formatCurrency`, `formatDate`/`formatTime12`/`formatDateTime12`, `parseDurationToMinutes`/`formatDurationPill`, `getTimelineStatusDisplay` for their respective formatting jobs.

## Patterns That Must Always Be Followed

1. Every new Server Action file starts with `"use server";` and imports `{ prisma } from "@/lib/prisma"`.
2. Every exported action re-checks the caller's permission itself — never rely solely on page-level layout gating.
3. Any mutation touching money, leave balances, or a multi-field status transition with side effects must be wrapped in `prisma.$transaction`.
4. Call `revalidatePath()` for every route (admin + manager + employee mirrors, as applicable) that displays the mutated data.
5. Manager-privileged org-config or employee-edit mutations must log via the shared manager-audit helpers, not ad hoc.
6. Keep the Loan/Overtime two-step manager-verification workflow isolated to those two domains unless explicitly asked to extend it elsewhere.
