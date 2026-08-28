# Admin Preference Management Report (Phase 14)

Gives SUPERADMIN and HR the ability to view and override any employee's notification preferences, plus reset an override back to the system default, on top of Phase 13's `NotificationPreference` model and `NotificationPreferenceService` — unchanged at the enforcement level. No new preference table, no new authorization system, no engine redesign.

## Goal & Scope

Phase 13 shipped employee self-service only, with admin/manager visibility explicitly deferred as a "future, separately-scoped phase" (see `NotificationPreferencesReport.md`'s "Next Recommended Phase"). This phase is that follow-up: SUPERADMIN/HR can search for an employee, see each manageable `(notificationType, channel)` pair's current state — **Default**, **Explicitly Enabled**, or **Explicitly Disabled**, never conflating "no row" with "disabled" — and enable/disable/reset it. Managers do **not** get access (not documented anywhere in this codebase as HR/admin-equivalent for preferences, and the phase spec explicitly said not to broaden this without cause). `loan.actions.ts` and every other business module remain untouched and unaware preferences exist at all.

## Investigation — Existing Authorization (performed before writing any code)

- **Roles**: `Role` enum = `SUPERADMIN | HR | EMPLOYEE` (`prisma/schema.prisma`). No separate "MANAGER" role — a manager is `role: "EMPLOYEE"` with `isManager: true`.
- **Caller resolution**: `getDbUser()` (`user.actions.ts`) is the standard "who is calling" resolver used throughout `src/actions/*.ts`; this phase uses it exclusively, per CLAUDE.md's own stated preference.
- **The established "administrator" convention for this exact feature already exists**: `notification-admin.actions.ts` (Phase 12) defines `isAdministrator(user) = user.role === "SUPERADMIN" || user.role === "HR"` and uses it to gate the existing admin Notification Center's list/detail/queue-status actions. This phase's `isAdminOrHr()` helper is the same check, defined locally in the new action file — matching CLAUDE.md's "permission checks are per-function, not centralized" convention (every sibling `.actions.ts` file defines its own local role-check helper rather than importing a shared one).
- **Employee identity verification**: every mutating action in this codebase that accepts a target user id (`toggleManagerStatus`, `changeUserRole`, `profile.actions.ts`'s admin-edit paths, etc.) re-resolves that id against `prisma.user` before acting on it, never trusting the client-supplied id alone. This phase's `resolveTargetEmployee()` follows that same pattern.
- **Route-level access gap (pre-existing, not introduced by this phase)**: `(admin)/layout.tsx` redirects anyone whose `role !== "SUPERADMIN"` to `/unauthorized` — there is no HR-accessible route group anywhere in this application today (confirmed: `AppSidebar.tsx` only branches on `role === "SUPERADMIN"` vs. everything else). This is already true for every other "SUPERADMIN-or-HR" action in the codebase (`loan.actions.ts`, `wallet.actions.ts`, `medical.actions.ts`, `notification-admin.actions.ts` itself) — HR is authorized at the Server Action layer across this entire app, but has no dedicated page route to reach any of them from the browser. This phase's new UI lives at `/admin/notification-center`, reachable only by SUPERADMIN today, same as every other admin-equivalent feature. **This is a real, pre-existing gap, called out here rather than silently worked around** — see "Known Issues."

## Database Decision

**No schema change.** The existing Phase 13 model already has exactly `userId`, `notificationType`, `channel`, `isEnabled`:

```prisma
model NotificationPreference {
  id String @id @default(cuid())
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  notificationType String
  channel          NotificationChannel
  isEnabled        Boolean             @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([userId, notificationType, channel])
  @@index([userId])
}
```

`NotificationEvent`, `NotificationJob`, `NotificationDeliveryAttempt`, `NotificationProvider`, `NotificationTemplate`, `NotificationSettings` — all untouched, per the phase's explicit instruction. No migration was proposed, generated, or applied.

## Key Design Insight: the Service Layer Was Already Admin-Ready

`NotificationPreferenceService.listForUser(userId)` and `.setForUser(userId, ...)` were written in Phase 13 taking `userId` as a plain parameter — they never assumed "the caller" was the target. Only the Phase 13 *actions* layer (`notification-preferences.actions.ts`) added the "self only" restriction, by always deriving `userId` from `getDbUser()` and never accepting one from the client. That means:

- The **service** needed exactly one new method (`resetForUser`) and zero changes to the two that already existed.
- The **enforcement** side (`NotificationService.raiseEvent()`'s `isOptedOut()` check) needed **zero** changes — it already reads the same repository by `(recipientUserId, eventType, channel)` regardless of who last wrote that row. An admin-set preference is indistinguishable from an employee-set one at read time, by construction.
- Employee self-service is provably unaffected: `notification-preferences.actions.ts` was **not modified** — it still only ever passes `getDbUser().id`, which a client can neither see nor override (it's never a function parameter), so an employee spoofing a request still cannot reach another user's row through that file.

## New Components

| Component | File | Role |
|---|---|---|
| `INotificationPreferenceRepository.deleteOne` | `repositories/interfaces/notification-preference-repository.interface.ts` | New interface method — removes the explicit override row. |
| `NotificationPreferenceRepository.deleteOne` | `repositories/notification-preference.repository.ts` | `prisma.notificationPreference.deleteMany({ where: { userId, notificationType, channel } })` — `deleteMany`, not `delete`-by-unique-key, specifically so resetting an already-default preference is a safe no-op instead of a Prisma `P2025` "record not found" throw. |
| `NotificationPreferenceService.resetForUser` | `preferences/notification-preference.service.ts` | Same catalog validation as `setForUser` (rejects any non-manageable `notificationType`/`channel`), then calls `deleteOne` — never writes a fake "default" row, preserving Phase 13's "no row = enabled by default" design exactly. |
| `notification-preferences-admin.actions.ts` | `src/actions/notification-preferences-admin.actions.ts` | `getEmployeeNotificationPreferences`, `setEmployeeNotificationPreference`, `resetEmployeeNotificationPreference` — SUPERADMIN/HR-only wrappers over the service, each independently re-checking role and verifying the target employee exists before touching data. |
| `EmployeeNotificationPreferencesPanel` | `src/components/admin/EmployeeNotificationPreferencesPanel.tsx` | Client component: employee search + list (reusing `getUsers()`, same client-filter pattern as `EmployeeNotesBoard.tsx`) and a per-employee preference table with state badges and Enable/Disable/Reset actions. |

## Authorization

Every one of the three new actions performs the full sequence, independently:

1. `getDbUser()` resolves the caller.
2. `isAdminOrHr(caller)` — reject with `{ success: false, error: "Unauthorized" }` for anyone else, **including a manager** (`role === "EMPLOYEE" && isManager` is deliberately not in this check — managers get no access, per the phase spec).
3. `resolveTargetEmployee(employeeId)` — a real `prisma.user.findUnique` lookup; a non-existent id returns `{ success: false, error: "Employee not found" }` before any preference read/write is attempted.
4. `notificationType`/`channel` validation happens inside `NotificationPreferenceService` (rejects anything outside `MANAGEABLE_NOTIFICATION_TYPES` via `ValidationError`) — the action layer never trusts these strings either.

The employee-facing self-service actions (`notification-preferences.actions.ts`) were not touched and have no `employeeId`/`userId` parameter at all — an employee cannot target another user's preferences through them by construction, so "cannot change their own userId to target somebody else" (the phase's explicit §8 requirement) holds trivially: there is no field to change.

## Auditability

Reused the existing generic `AuditLog` table directly — the same way `profile.actions.ts`, `loan.actions.ts`, and `medical.actions.ts` already log non-loan SUPERADMIN/HR actions (`oldEmi`/`newEmi` left `null`, the actual record in `changeReason`). No new audit table. Every override/reset writes one row recording: actor id + name, target employee id + name, `notificationType`, `channel`, previous state label (`"default (enabled)"` / `"explicitly enabled"` / `"explicitly disabled"`), new state label, and `createdAt` (automatic). The write is wrapped in its own `try/catch` and only `console.error`s on failure — it never blocks or rolls back the actual preference change, matching this codebase's existing "logging is best-effort, never load-bearing" convention (e.g. `logManagerOrganizationAction`'s identical shape). No credentials or sensitive data ever touch this table — it only ever holds preference true/false state.

**Deliberately not using `createAdminNotification`**: that helper is documented in CLAUDE.md as reserved for *manager*-privileged actions elevated to admin-equivalent, so other SUPERADMINs are alerted a manager did something unusual. A SUPERADMIN or HR user managing preferences is a routine, expected admin action, not something that needs to interrupt every other admin — broadcasting one here would be noise, not signal, and CLAUDE.md's own "reuse pattern" doesn't extend that helper to plain admin actions elsewhere in the codebase either.

## Notification Center — UI Changes

Added a second tab, **"Employee Preferences"**, to the existing `/admin/notification-center` page, next to the existing "All Notifications" tab (using the `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` primitives already used elsewhere in this codebase, e.g. `admin/loans/page.tsx`) — no new route, no new page, no redesign of the existing notification list/detail/retry UI. The new tab renders `EmployeeNotificationPreferencesPanel`:

- Left column: a search `Input` over `getUsers()`'s employee list (name/email substring match), clicking a row selects that employee — identical interaction pattern to `EmployeeNotesBoard.tsx`.
- Right column: once an employee is selected, `getEmployeeNotificationPreferences` loads their preference view models. Each row shows the notification label/description/channel, a `Badge` for current state (`secondary` = "Default (enabled)", `default` = "Explicitly enabled", `destructive` = "Explicitly disabled"), a toggle button (Enable/Disable, reflecting current effective state), and — only when an explicit row exists — a "Reset to Default" button.
- All three admin actions re-fetch and re-render from the server after every mutation (no optimistic local-only state divergence), so the effective state shown always reflects what `NotificationService.raiseEvent()` will actually apply on the next event — matching Phase 13's "no caching, fresh read every time" decision.

## Behavior Preserved (unchanged from Phase 13, verified)

| Scenario | Status |
|---|---|
| A. No preference row → enabled | Unchanged — `NotificationService.raiseEvent()` untouched. |
| B. Explicit `isEnabled: true` → enabled | Unchanged. |
| C. Explicit `isEnabled: false` → event recorded, no job created | Unchanged. |
| D. Duplicate event → existing dedup behavior | Unchanged — no dedup code touched. |
| E. Preference changed → next `raiseEvent` uses the latest value | Unchanged, and now exercised by two distinct write paths (employee self-service, admin override) hitting the identical repository row — proven by the new `"also works for an arbitrary target userId"` test in `notification-preference.service.test.ts`. |

## Tests

7 new tests, all deterministic, zero live-database access, same dependency-free `node --test` harness as every prior phase:

**`preferences/notification-preference.service.test.ts`**:
- `setForUser` also works for an arbitrary target `userId` (the Phase 14 admin-override use case — the service has no notion of "self").
- `resetForUser`: removes an explicit row, returning to `isEnabled=true`/`isExplicit=false`.
- `resetForUser`: never stores a fake "default" row — asserts the repository call is a delete, never an upsert.
- `resetForUser`: is a safe no-op when no explicit row exists.
- `resetForUser`: rejects a `(notificationType, channel)` pair outside the catalog, without touching the repository.
- `resetForUser`: rejects an unrecognized `notificationType` entirely.
- `resetForUser`: only resets the specific `(notificationType, channel)` pair — a different channel for the same user is untouched.

`INotificationPreferenceRepository.deleteOne` was added to the interface, which TypeScript then required in all four existing implementers (`NotificationPreferenceRepository`, and the three in-memory fakes in `notification.service.test.ts`, `preferences/notification-preference.service.test.ts`, and both integration test files' `AlwaysEnabledPreferenceRepository`) — a compile-time forcing function that ruled out an incomplete implementation shipping unnoticed.

```
tests 515   suites 128   pass 515   fail 0
```

(508 pre-Phase-14 tests, unmodified and still green, + 7 new.) Ran twice from a clean `.test-build` rebuild — identical result both times.

### Authorization scenarios — testing constraint (documented, not silently skipped)

The dependency-free `node --test` harness this project uses cannot import `@/lib/prisma` or `@clerk/nextjs/server` (see `tsconfig.test.json`'s scoped file list and every existing phase's own "Testing" section making the same point) — so **no Server Action in this entire codebase has ever had its role-check logic covered by an automated test**, including every pre-existing "SUPERADMIN-or-HR" gate in `loan.actions.ts`, `wallet.actions.ts`, `medical.actions.ts`, and `notification-admin.actions.ts` itself. This phase's three new actions follow that same, unavoidable constraint: `isAdminOrHr()`/`resolveTargetEmployee()` are verified by direct code review against the proven sibling pattern (byte-for-byte the same shape as `notification-admin.actions.ts`'s `isAdministrator`), by `tsc --noEmit`, and are ready for the manual verification steps below — not by `node --test`. The state-machine behavior underneath the authorization gate (default/explicit/reset, catalog rejection, per-user scoping) **is** fully covered, at the service/repository level, by the 7 new tests above plus Phase 13's untouched 15.

## TypeScript / ESLint

`pnpm prisma generate` → clean. `pnpm tsc --noEmit` → zero errors, whole project. `pnpm run lint` (ESLint) → zero warnings/errors, whole project.

## Build

Not run this phase, per your standing instruction ("make sure you don't run build any more, I will do that, tell me when to run"). No change in this phase touches `proxy.ts`, `instrumentation.ts`, or anything Edge-runtime-related — the 5 pre-existing cosmetic Turbopack warnings from prior phases are the only ones expected if/when you run it.

## Code Quality

Strict TypeScript throughout (no `any`), no new dependency, no new UI primitive (reused `Tabs`, `Card`, `Input`, `Button`, `Badge` — all pre-existing shadcn components), no new console output beyond the existing `console.error`-on-failure convention, reuses `ValidationError` from the existing errors hierarchy, reuses the manual `container.ts` wiring unmodified (only `preferenceService` gained one new method — the container's own wiring code required zero edits).

## Known Issues

- **Route-level HR access gap (pre-existing, not introduced by this phase)**: as documented under "Investigation," HR is authorized at the Server Action layer (can call all three new actions successfully) but cannot reach `/admin/notification-center` in the browser today, because `(admin)/layout.tsx` gates on `role === "SUPERADMIN"` only and no HR-accessible route exists anywhere in this application. This is identical to the existing situation for every other "SUPERADMIN-or-HR" feature in the codebase (loans, wallet, medical, the rest of the admin Notification Center). Fixing it would mean changing `(admin)/layout.tsx`'s role gate — a cross-cutting change affecting every admin page, well outside this phase's scope, and not something to decide unilaterally. Flagged here for your call, not worked around silently.
- `NotificationDeliveryAttempt` rows are still never written anywhere in the dispatch pipeline (a pre-existing gap noted in earlier work on this engine, unrelated to preferences, not touched here).
- Manager access was deliberately not added, per the phase spec.

## Next Recommended Phase

If HR needs to actually use this feature day to day, the real next step is a dedicated decision about HR page-level routing (a new route group, or loosening `(admin)/layout.tsx`) — that's a routing/access-model change, not a notification-engine change, so it deserves its own explicit scope discussion rather than being folded into this phase. Beyond that: the same extension points every phase since Phase 2 has been built around — additional business events and additional channels, each of which the admin panel here will pick up automatically the moment they're added to `MANAGEABLE_NOTIFICATION_TYPES`, with zero further UI work.
