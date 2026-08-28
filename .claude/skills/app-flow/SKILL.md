---
name: app-flow
description: Explains bit2.0's overall purpose, the three-portal (Admin/Manager/Employee) navigation structure, and how a request flows from route to layout to server action to database. Use when orienting in the codebase, adding a new page/route, or explaining how the app is organized.
---

# bit2.0 — App Flow

## What this app is

bit2.0 is an internal **HR, Attendance & Payroll management system** ("bitcode-hrm") for a
company with multiple branches. It replaces manual spreadsheets for: employee records,
biometric attendance (via ZKTeco devices), leave, loans/EMI, medical claims, wallet
transactions, payroll processing, overtime, and internal notices.

Stack: Next.js 16 (App Router, React 19), Clerk (auth), Prisma 6 + PostgreSQL, shadcn/Radix
UI, Tailwind v4, deployed via Docker + Traefik. Package manager is **pnpm** (see
`pnpm-workspace.yaml`), even though some npm scripts remain in `package.json`.

## Three portals, one codebase

Routes are split into three Next.js route groups under [src/app/](src/app/), each with its
own layout that gatekeeps on the user's role (see `[[auth-roles-permissions]]` for the exact
rules):

| Route group | URL prefix | Who | Layout |
|---|---|---|---|
| `(admin)` | `/admin/*` | `SUPERADMIN` (some pages also allow `HR`) | [src/app/(admin)/layout.tsx](src/app/(admin)/layout.tsx) |
| `(manager)` | `/manager/*` | `EMPLOYEE` with `isManager = true` | [src/app/(manager)/layout.tsx](src/app/(manager)/layout.tsx) |
| `(employee)` | `/dashboard`, `/profile`, `/leaves`, etc. | any approved `EMPLOYEE` | [src/app/(employee)/layout.tsx](src/app/(employee)/layout.tsx) |

There is no separate `Role.MANAGER` — a manager is just an `EMPLOYEE` row with `isManager:
true`, and manager pages largely mirror admin pages with a narrower dataset (their own
branch/reports only). When adding a manager-side feature, check whether the admin
equivalent already exists in `src/actions/*.actions.ts` and can be reused/scoped rather than
duplicated.

Outside these groups: `/sign-in`, `/sign-up` (Clerk-hosted), `/pending` (awaiting HR
approval), `/unauthorized`, `/calendar`, and the root `/` (role-based redirect).

## Request lifecycle

1. **Route** — a `page.tsx` under one of the three groups (or a bare route like
   `src/app/calendar/page.tsx`).
2. **Layout gate** — the group's `layout.tsx` calls `getDbUser()`
   ([src/actions/user.actions.ts](src/actions/user.actions.ts)) to resolve the Clerk session
   into the app's `User` row, then redirects to `/sign-in`, `/pending`, or `/unauthorized` if
   the checks fail. Every admin/manager/employee layout sets `export const dynamic =
   "force-dynamic"` — these are not statically rendered.
3. **Data fetching** — pages are React Server Components that call functions from
   `src/actions/*.actions.ts` directly (no client-side fetch for initial load). These are
   Next.js **Server Actions** (`"use server"`), used both for reads and for
   form/mutation handlers.
4. **Mutations** — client components (`src/components/**`) call the same server actions via
   `<form action={...}>` or direct calls from event handlers, then rely on
   `revalidatePath`/`redirect` inside the action, or client-side `router.refresh()`.
5. **Cross-cutting jobs** — [src/instrumentation.ts](src/instrumentation.ts) starts three
   in-process interval loops on server boot (daily timeline generation, ZKTeco sync, leave
   automation). See `[[attendance-automation]]`.
6. **API routes** — `src/app/api/**/route.ts` exist for: Clerk webhooks (user
   provisioning), a couple of cron-triggerable HTTP endpoints (fallback to the
   instrumentation-based crons), and small JSON endpoints (`holidays/check`,
   `employees/[id]/name`). Prefer server actions for anything invoked from within the app;
   only add a `route.ts` when an external caller (webhook, cron, fetch from a client
   component that can't use a server action) needs it.

## Adding a new page — the established pattern

1. Put the route under the correct group (`(admin)`, `(manager)`, or `(employee)`).
2. Add/extend a `*.actions.ts` file in `src/actions/` with a `"use server"` function that
   does the Prisma query, scoped by role (see `[[auth-roles-permissions]]`).
3. Build the page as an async Server Component that calls the action and passes data to a
   client component for interactivity.
4. Reuse `src/components/ui/*` (shadcn primitives) and existing patterns in
   `src/components/{admin,manager,employee,shared}/` rather than inventing new UI — see
   `[[ui-ux-design]]`.
5. Add a sidebar entry (`AppSidebar` for admin/employee, `ManagerSidebar` for manager) so
   the page is reachable.

## Key domain areas (each is a full CRUD/workflow slice with its own actions + pages)

Employees & org (departments/designations/branches), Attendance/Timeline, Leave
management, Loans/EMI, Medical claims, Wallet, Payroll processing, Overtime requests,
Timeline modification requests, Breaking notices, Profile update requests, System control
settings, Role management, Employee notes. See `[[backend-schema]]` for the data model
behind each and `[[payroll-finance]]` for the money-related ones specifically.
