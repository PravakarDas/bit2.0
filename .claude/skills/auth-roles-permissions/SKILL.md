---
name: auth-roles-permissions
description: Explains bit2.0's Clerk-based authentication, the SUPERADMIN/HR/EMPLOYEE role model plus the isManager flag, user provisioning via webhook, and the per-layout authorization checks. Use when adding a new protected page, action, or any role-gated logic.
---

# bit2.0 — Auth, Roles & Permissions

## Identity: Clerk + local `User` mirror

Auth is fully delegated to **Clerk** (`@clerk/nextjs`). The app keeps its own `User` row
(`prisma/schema.prisma`) keyed by `clerkId`, which carries all app-specific fields (role,
branch, salary, etc.) that Clerk doesn't know about.

- **Provisioning**: [src/app/api/webhooks/clerk/route.ts](src/app/api/webhooks/clerk/route.ts)
  verifies the Clerk webhook (via `svix`) and, on `user.created`, inserts a `User` row with
  `status: PENDING`. A `SUPERADMIN`/`HR` must approve the user (flips `status` to
  `APPROVED`) before they can use any portal — see the role-management action.
- **Session → app user**: `getDbUser()` in
  [src/actions/user.actions.ts](src/actions/user.actions.ts) is the single place that
  resolves the current Clerk session into a `User` record; every layout and most server
  actions call this first. Don't re-implement session resolution elsewhere.
- **Role read helpers**: [src/lib/roles.ts](src/lib/roles.ts) (`checkRole`, `getUserRole`)
  read `role` off the Clerk session's JWT `sessionClaims.metadata` — this is a fast path for
  middleware-style checks that don't need the full `User` row; prefer `getDbUser()` when you
  need more than the role (branch scoping, `isManager`, `status`).

There is no `middleware.ts` in this app — authorization is enforced **per layout**, not
globally. Any new top-level route group needs its own guard; don't assume Next.js
middleware is protecting it.

## The role model

```
Role enum:  SUPERADMIN | HR | EMPLOYEE
isManager:  Boolean flag on any EMPLOYEE
```

**There is no `MANAGER` enum value.** "Manager" = `role === "EMPLOYEE" && isManager ===
true`. This shows up as a recurring authorization idiom across the codebase — search for it
before writing a new check:

```ts
const isAuthorized = ["SUPERADMIN", "HR"].includes(actor.role)
  || (actor.role === "EMPLOYEE" && actor.isManager);
```
(see e.g. [src/actions/employee.actions.ts:326](src/actions/employee.actions.ts#L326),
[src/actions/profile.actions.ts:262](src/actions/profile.actions.ts#L262))

`SUPERADMIN` and `HR` are mostly treated as equivalent ("admin-tier"), with a few
`SUPERADMIN`-only exceptions (e.g. the `(admin)` route group layout itself only allows
`SUPERADMIN` — `HR` users are redirected to `/unauthorized` at the layout level even though
individual pages like `system-control` explicitly allow `HR`). **Check the specific layout
and page, not just the action, when deciding what a role can reach** — a page-level guard
and its layout guard can disagree, and the layout guard runs first.

## Layout-level gates (defense per portal)

Each gated `layout.tsx` runs the same three checks in order — replicate this shape for any
new protected route group:

1. `const user = await getDbUser(); if (!user) redirect("/sign-in")`
2. `if (user.status === "PENDING") redirect("/pending")`
3. Role check specific to the portal, else `redirect("/unauthorized")`:
   - Admin ([src/app/(admin)/layout.tsx](src/app/(admin)/layout.tsx)): `user.role !==
     "SUPERADMIN"`
   - Manager ([src/app/(manager)/layout.tsx](src/app/(manager)/layout.tsx)): `user.role !==
     "EMPLOYEE" || !user.isManager`
   - Employee ([src/app/(employee)/layout.tsx](src/app/(employee)/layout.tsx)): only the
     sign-in/pending checks — any approved user can reach it, and a manager visiting an
     `/employee/manager` path gets passed through without the employee chrome so the manager
     layout can render its own.

## Server-action-level checks

Server actions must **not** rely solely on the layout guard (actions can theoretically be
invoked from anywhere) — every mutating action re-checks the actor's role/ownership, usually
via `getDbUser()` at the top of the function before touching Prisma. When adding a new
action:

- Re-fetch the actor with `getDbUser()`; don't trust a role passed in from the client.
- For employee-scoped data (e.g. "my leave applications"), filter by `userId: actor.id` —
  never take a `userId` param from an untrusted client caller.
- For manager-scoped data (e.g. "employees in my branch"), filter by `branchId:
  actor.branchId`, matching the existing pattern in `src/actions/manager*.actions.ts`.
- For admin-only mutations, use the `["SUPERADMIN", "HR"].includes(actor.role)` (or the
  full admin-or-manager) idiom shown above rather than a bespoke check.

## Adding a new permission tier

If a feature needs finer-grained permissions than the three roles, prefer extending an
existing boolean flag pattern (like `isManager`) scoped to `User`, rather than adding a new
`Role` enum value — the codebase's authorization checks are written as inline boolean
expressions throughout actions and layouts, not a centralized permission table, so a new
enum value would require finding and updating every one of those call sites.
