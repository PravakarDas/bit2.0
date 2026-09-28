# Notification Action Authorization Report (Phase 17)

Complete authorization audit of `src/actions/notification.actions.ts`, prompted by the broader concern Phase 16 surfaced but deliberately left untouched: `handleNotificationAction` had no top-level authorization check of its own. This phase closes that gap and every other authorization gap discovered in the same file during the audit — without redesigning the Notification Engine, without a new permission framework, and without a schema change.

## Scope & Method

Read the entire file (`notification.actions.ts`, 12 exported functions) top to bottom. For `handleNotificationAction` specifically, traced every branch of its `switch (notification.type)` to the actual delegated implementation, and for every other exported function in the file, traced every real caller across the codebase (not just assumed) to determine whether a legitimate non-admin workflow depends on its current (lack of) authorization.

## Every Action Type `handleNotificationAction` Supports

| `notification.type` | Delegated to | Self-authorizes? |
|---|---|---|
| `PROFILE_UPDATE_REQUEST` | `approveProfileUpdateRequest`/`rejectProfileUpdateRequest` (`profile.actions.ts`) | **Yes** — `auth()` + `prisma.user.findUnique` + `SUPERADMIN \| HR \| (EMPLOYEE && isManager)`, using the verified `clerkId`, never client input. Already safe before this phase. |
| `LEAVE_APPLICATION_PENDING` | `approveLeaveApplication`/`rejectLeaveApplication` (`leave.actions.ts`) | **Yes, as of Phase 16** — `getDbUser()` + `canApproveLeave()` (`SUPERADMIN \| HR \| (EMPLOYEE && isManager)`), checked before any data read. |
| `LOAN_APPLICATION_PENDING` | **Nothing** — a hardcoded `{ success: true, message: ... }` stub; no `loan.actions.ts` function is ever called. | **No delegated action exists to authorize.** The only thing standing between an arbitrary caller and a fake-success "approval" was, before this phase, nothing at all. |
| `WALLET_REQUEST_PENDING` | **Nothing** — same stub pattern, no `wallet.actions.ts` function is ever called. | **No delegated action exists to authorize.** Same gap as above. |
| *(unrecognized type)* | — | Falls to `default: return { success: false, error: 'Action not supported for this notification type' }` — already safe (no mutation). |

## Security Issues Found

1. **`handleNotificationAction` had no authentication or role check at all.** Every branch above is an admin/HR/manager-approval workflow — none is ever legitimately self-service for a plain employee — yet any caller who could invoke this Server Action (authenticated or not, any role) could reach every branch.
2. **The two stub branches (`LOAN_APPLICATION_PENDING`/`WALLET_REQUEST_PENDING`) had nothing backing them.** Because they call no real business action, they had **zero** authorization anywhere in the call chain — the most severe finding in this audit. Any caller reaching `handleNotificationAction` with a `LOAN_APPLICATION_PENDING`/`WALLET_REQUEST_PENDING` notification id got an unconditional fake `{ success: true }`, which then caused the code to mark that `AdminNotification` `READ` and stamp its `metadata` with `processed: true` — a genuine, unauthorized write to administrative state, capable of hiding a real pending loan/wallet request from SUPERADMIN/HR's view of the queue.
3. **`action` was never validated at runtime.** `if (action === 'approve') {...} else {...}` meant any value other than the exact string `'approve'` — a typo, a malformed request, an attacker-crafted payload — silently fell into the `decline` branch instead of being rejected. TypeScript's `'approve' | 'decline'` type gives no runtime protection against a raw call that bypasses the type checker.
4. **Five other exported functions in the same file had no authorization at all**: `markNotificationAsRead`, `markAllNotificationsAsRead`, `markNotificationAsUnread`, `deleteNotification`, `getAllNotifications`, `getUnreadCount`. `getAllNotifications` in particular is an information-disclosure risk — it returns the full `AdminNotification` feed (titles/messages/metadata, which for these notification types can include leave reasons, profile-change details, and — once loan/wallet are wired for real — financial figures), and was directly callable by any authenticated user with zero role check. Discovered during this same "complete audit of the current implementation" (required by this phase), directly relevant since one of them (`markNotificationAsRead`) is called internally by `handleNotificationAction` itself, and all are part of the same AdminNotification-management surface `handleNotificationAction`/the pre-existing `getUnreadNotifications` (the file's only previously-checked function) belong to.

## Existing Authorization Pattern Discovered (and reused, not invented)

`getUnreadNotifications` — the one function in this file that already had a check — uses `!['SUPERADMIN', 'HR'].includes(user.role)`. This is the established precedent for "who may manage the shared `AdminNotification` inbox as a whole." Separately, `approveProfileUpdateRequest`/`rejectProfileUpdateRequest` (already safe) and `approveLeaveApplication`/`rejectLeaveApplication` (fixed in Phase 16) both use the three-way `SUPERADMIN | HR | (EMPLOYEE && isManager)` rule for "who may approve one specific delegated request." Both rules already existed in this codebase before this phase — neither was invented for this audit.

## Exact Fix

**New pure module**: `src/lib/notification-action-authorization.ts` (zero Prisma/Clerk imports, unit-testable by the dependency-free harness — same reason `leave-authorization.ts`/`smtp-shared.ts`/`crypto.ts` are separate files):

- `canProcessAdminNotificationAction()` — the three-way `SUPERADMIN | HR | (EMPLOYEE && isManager)` rule, matching the *loosest* requirement among everything `handleNotificationAction` can delegate to. It must not be stricter than its delegates, or it would incorrectly block a manager legitimately entitled to approve a leave/profile request through this surface.
- `canManageAdminNotificationInbox()` — the narrower `SUPERADMIN | HR` rule, copied from `getUnreadNotifications`'s own existing precedent, for the 6 general inbox-management functions. Deliberately does **not** include manager — approving one specific delegated request is a different permission class from administering the entire shared notification feed (bulk mark-read, delete, full listing), and nothing in this codebase suggests managers were ever meant to have the latter.
- `isValidNotificationDecision()` / `hasNotificationId()` — small runtime guards closing finding #3 and defending against a missing/malformed `notificationId`.

Deliberately **not** shared with `leave-authorization.ts` even though `canProcessAdminNotificationAction`'s boolean logic is identical to `canApproveLeave`'s — this codebase's own stated convention (CLAUDE.md: "Permission checks are per-function, not centralized... copy the pattern from a sibling function in the same file") is to keep each action file's authorization local to its own domain rather than importing a shared cross-domain helper, even when the rule happens to coincide. This is not a new permission framework — it is the same "small, local helper function" pattern every other action file in this codebase already uses (`canManageOrganization`, `isAdministrator`, `canApproveLeave`, etc.), just pulled into `src/lib/` (as Phase 16 already established) purely so it can be unit-tested.

**`notification.actions.ts`** changes:

- `handleNotificationAction`: resolves `getDbUser()` and checks `canProcessAdminNotificationAction()` as the very first statement — before the notification is even read from the database, let alone any delegated action runs. Also validates `action` (`isValidNotificationDecision`) and `notificationId` (`hasNotificationId`) at runtime.
- `markNotificationAsRead`, `markAllNotificationsAsRead`, `markNotificationAsUnread`, `getAllNotifications`, `getUnreadCount`, `deleteNotification`: each now resolves `getDbUser()` and checks `canManageAdminNotificationInbox()` before doing anything.
- A new private, unexported helper `setAdminNotificationStatus(notificationId, status)` holds the actual status-write logic with no check of its own; `markNotificationAsRead`/`markNotificationAsUnread` call it after their own `canManageAdminNotificationInbox` check, and `handleNotificationAction` calls it directly (bypassing the narrower public wrapper) after its own, correctly-wider `canProcessAdminNotificationAction` check — so a manager who legitimately approved a leave/profile request through this flow still gets their notification correctly marked read, without incorrectly hitting the SUPERADMIN/HR-only gate meant for general inbox administration.
- `getUnreadNotifications`'s existing check was left behaviorally identical, just re-expressed via the new shared local function instead of its own inline array-literal, for consistency.
- `createAdminNotification` and `checkAndCreateIncrementReminders` were **deliberately left untouched** (see "Deliberately Not Fixed" below).

## Why `handleNotificationAction` Not "Blindly" Given One Generic Check

`canProcessAdminNotificationAction` was derived, not assumed: it is the union of what `approveProfileUpdateRequest`, `rejectProfileUpdateRequest`, `approveLeaveApplication`, and `rejectLeaveApplication` already independently require (all four: `SUPERADMIN | HR | (EMPLOYEE && isManager)`). It is intentionally distinct from `canManageAdminNotificationInbox` (`SUPERADMIN | HR`, no manager) used for the six general inbox-management functions — a direct implementation of requirement 5's "different actions may have different authorization rules," backed by the actual pattern already present in the codebase, not invented.

## Authorization at the Business-Action Boundary (requirement 7)

Every delegated action this phase's `handleNotificationAction` fix relies on already defends itself independently:

- `approveProfileUpdateRequest`/`rejectProfileUpdateRequest`: already safe, unmodified.
- `approveLeaveApplication`/`rejectLeaveApplication`: made safe in Phase 16, unmodified this phase.
- `LOAN_APPLICATION_PENDING`/`WALLET_REQUEST_PENDING`: **no real business action exists to delegate to** (they are stubs) — there is nothing to hardened at "the business-action boundary" for these two, because that boundary doesn't exist yet. `handleNotificationAction`'s own new top-level gate is therefore the *only* protection for these two branches, which is exactly why it was necessary regardless of how well every other delegate defends itself.

This means every one of `handleNotificationAction`'s delegated actions remains safe even if called directly, without going through `handleNotificationAction` at all — the stated goal of requirement 7 — for the two branches where that's possible; for the two stub branches, there is no direct business action to call in the first place.

## Never Trusts Client-Supplied Identity (requirements 9/10)

`notification.actions.ts` never accepted an identity/approver/user-id argument from the client in the first place (`handleNotificationAction`'s params are `notificationId`, `action`, `adminNote` — none identity-bearing). The actual identity-forgery vector this whole audit chain traces back to was in the *delegated* actions (`approveLeaveApplication`'s pre-Phase-16 `approvedBy` string), already fixed. This phase's new checks resolve the caller exclusively via `getDbUser()`, matching every other authorization check across the codebase.

## No IDOR / Cross-User Access Path (requirement 10)

`AdminNotification` is not a per-user resource with an "owner" field to check — it's a shared administrative feed. The relevant IDOR-shaped risk here was different: an unauthorized caller supplying an arbitrary `notificationId` to *mutate shared administrative state* (mark other people's business read/decisions, or fake-approve a loan/wallet notification) without ever being entitled to touch that feed at all. That is exactly what the new checks close — a caller who fails `canProcessAdminNotificationAction`/`canManageAdminNotificationInbox` can no longer read or mutate any `AdminNotification` row via this file, regardless of which `notificationId` they supply.

## Live Workflow Impact — Verified, Not Assumed

Traced every real caller of every function this phase modified:

- `handleNotificationAction`'s **only** importer anywhere in the codebase is `src/components/admin/NotificationBell.tsx` — which is itself **never imported by any page or layout** (confirmed: no file anywhere imports `NotificationBell`). It is dead/orphaned UI. There is currently **zero live workflow** that reaches `handleNotificationAction` at all — this phase's hardening of it carries no regression risk to any working feature, only closes a direct-invocation exploit path.
- `markNotificationAsRead`, `markAllNotificationsAsRead`, `markNotificationAsUnread`, `deleteNotification`, `getAllNotifications`, `getUnreadCount` are called from two places: the same orphaned `NotificationBell.tsx`, and the real, live `src/app/(admin)/admin/notifications/page.tsx` — which lives under the `(admin)` route group, gated to `role === "SUPERADMIN"` only by `(admin)/layout.tsx`. Every legitimate user who can reach that page today is already a SUPERADMIN, a strict subset of the new `canManageAdminNotificationInbox` (`SUPERADMIN | HR`) check — so no existing workflow is broken; HR is newly, correctly entitled at the action layer (consistent with this codebase's established pattern of authorizing HR at the action layer even where no dedicated HR route exists yet — see `AdminPreferenceManagementReport.md`, Phase 14).
- `getUnreadCount` is also called by `NotificationWithBadge.tsx`, itself rendered in `AppSidebar.tsx` only inside an explicit `role === "SUPERADMIN"` condition — again a strict subset of the new check.
- **Not confused with a same-named sibling**: `src/components/employee/NotificationPanel.tsx` imports a *different* `markNotificationAsRead` from `leave-automation.actions.ts` (operating on `EmployeeNotification`, the genuinely employee-self-service model) — a completely separate function this phase does not touch at all. Verified via `git diff` that zero lines of `leave-automation.actions.ts` changed.

## Deliberately Not Fixed (and why)

- **`createAdminNotification`**: called internally from ~14 other action files (`profile.actions.ts`, `leave.actions.ts`, `manager-organization.actions.ts`, `medical.actions.ts`, `timeline.actions.ts`, etc.) as a "fire an admin alert" utility, always triggered by already-authorized business logic elsewhere (e.g., an employee submitting a leave application legitimately triggers an admin alert *about themselves*). It has no "current acting user" concept to authorize — the caller *is* whichever business action decided an alert was warranted. Adding a role check here would incorrectly block every one of those legitimate internal call sites. Not touched.
- **`checkAndCreateIncrementReminders`**: only called from `src/app/api/cron/daily-notifications/route.ts`, a cron-triggered Route Handler, not a user-facing action. No client-supplied identity or target id is involved (it batch-scans all active employees for anniversaries). Not touched — also out of scope as a different file, and this phase's rule 14 forbids touching worker/instrumentation-adjacent infrastructure.
- **The `LOAN_APPLICATION_PENDING`/`WALLET_REQUEST_PENDING` stub behavior itself** (always reporting fake success instead of calling real `loan.actions.ts`/`wallet.actions.ts` logic): now properly access-gated (only a `SUPERADMIN`/`HR`/manager caller can reach it at all), but the stub's *functional* incompleteness is a correctness/feature gap, not a security vulnerability once access-gated — fixing it would mean wiring new business logic into this handler, outside a security-hardening phase's scope (and this phase's rule 16 forbids new business events). Documented as a known issue.
- **`api/cron/daily-notifications/route.ts`'s own lack of a shared-secret/signature check**: observed while tracing `checkAndCreateIncrementReminders`'s caller, but it is a different file entirely, unrelated to `notification.actions.ts`'s authorization model, and outside this phase's audit target. Documented as an out-of-scope observation only.

## Files Changed

**Created**: `src/lib/notification-action-authorization.ts`, `src/lib/notification-action-authorization.test.ts`, this report.

**Modified**: `src/actions/notification.actions.ts`, `tsconfig.test.json`, `package.json`.

**Not touched**: `prisma/schema.prisma`, any migration, `NotificationService.raiseEvent()`, `QueueEngine`, `WorkerRuntime`, `TemplateEngine`, `DeliveryManager`, SMTP, `instrumentation.ts`, `production-worker.ts`, `leave.actions.ts`, `profile.actions.ts`, `leave-automation.actions.ts`, any UI component or page.

## Database / Schema Changes

**None.**

## Tests

New file: `src/lib/notification-action-authorization.test.ts` (15 tests, dependency-free):

| Requirement | Coverage |
|---|---|
| A. Unauthenticated caller rejected | `canProcessAdminNotificationAction`/`canManageAdminNotificationInbox` both return `false` for `null`/`undefined` |
| B. Employee attempting another's action rejected | Both functions reject a plain `EMPLOYEE` unconditionally — there is no self-service branch to exploit for any user, so this holds regardless of whose request is targeted |
| C. Legitimate employee action still succeeds | Not applicable to `handleNotificationAction` itself (no employee-self-service branch exists in it — see the test file's own doc comment for why inventing one would violate this phase's "do not invent permissions" instruction); verified instead that the actual legitimate employee-facing notification function (`leave-automation.actions.ts`'s own `markNotificationAsRead`, a different function on a different model) is untouched by this phase's diff |
| D. Manager performing a legitimate action succeeds | `canProcessAdminNotificationAction` returns `true` for `EMPLOYEE`+`isManager:true`; a dedicated test also proves `canManageAdminNotificationInbox` correctly returns `false` for the same actor, demonstrating the two rules are deliberately different |
| E. HR performing an HR-authorized action succeeds | Both functions return `true` for `HR` |
| F. SUPERADMIN performing an admin-authorized action succeeds | Both functions return `true` for `SUPERADMIN` |
| G. Forged identity has no effect | `NotificationActor`'s only fields are `role`/`isManager` — both resolved server-side via `getDbUser()`, never client input; a test asserts the type has no other field a forged value could occupy |
| H. Invalid/unknown action type safely rejected | `isValidNotificationDecision` tested against valid values, a near-miss string, empty string, `null`/`undefined`, a number, and an object |
| I. Missing/invalid target ID safely rejected | `hasNotificationId` tested against a valid id, `undefined`, `null`, empty string, whitespace-only string, a number, and an object |

```
tests 563   suites 139   pass 563   fail 0
```

548 pre-Phase-17 tests, unmodified and still green (including every Phase 13–16 suite) + 15 new. Ran twice from a clean `.test-build` rebuild — identical result both times.

`handleNotificationAction`'s own runtime wiring (that it actually calls `getDbUser()`/`canProcessAdminNotificationAction()` first, and that the two stub branches are now unreachable without passing that check) is verified by direct code review — `notification.actions.ts` imports `@/lib/prisma`, which the dependency-free harness cannot resolve, the same unavoidable constraint documented in every prior phase's report for Server Action files.

## Verification Results

- `pnpm tsc --noEmit` — zero errors, whole project.
- `pnpm run lint` (ESLint) — zero warnings/errors, whole project.
- `pnpm run build` — run by the user (not by the agent, per standing instruction); result to be recorded once provided. Expected: successful compile, same 5 pre-existing cosmetic Turbopack Edge-runtime warnings as every prior phase, no new warning (this phase's changes are confined to `src/actions/notification.actions.ts` and two new `src/lib/*.ts` files, none of which touch `instrumentation.ts`/Edge-runtime-adjacent code).

## Security Review (final diff inspection)

- **IDOR/cross-user access**: closed — every function that reads or mutates `AdminNotification` now requires a verified, authorized caller regardless of the `notificationId` supplied.
- **Client-controlled identity**: none exists anywhere in this file's own parameters; every check resolves the caller via `getDbUser()`.
- **Missing authentication**: closed for all 7 previously-unchecked functions.
- **Missing role checks**: closed, using rules derived from this codebase's own existing precedent, not invented.
- **Authorization performed only in the UI**: the one UI surface for `handleNotificationAction` (`NotificationBell.tsx`) is orphaned/unreachable — confirms server-side enforcement was always the only thing that could matter, and it is now real.
- **Authorization performed only in `handleNotificationAction` while direct business actions remain unsafe**: verified the opposite — `approveProfileUpdateRequest`/`rejectProfileUpdateRequest`/`approveLeaveApplication`/`rejectLeaveApplication` all independently self-authorize and remain safe called directly; only the two stub branches (which have no direct business action at all) rely solely on `handleNotificationAction`'s own gate, which is now present.
- **Accidental privilege escalation**: none — every change is a narrowing (added checks) using rules that are, if anything, equal to or narrower than what a legitimate caller already needed to reach the same functionality through the live UI (verified per-function above).
- **Unintended changes to existing workflows**: none found — traced every real (non-orphaned) caller of every modified function and confirmed each is already restricted to a subset of the new server-side rule.

## Known Remaining Issues

- `LOAN_APPLICATION_PENDING`/`WALLET_REQUEST_PENDING` remain functional stubs (properly access-gated now, but still not wired to real `loan.actions.ts`/`wallet.actions.ts` logic) — a correctness gap, not a security one post-fix; flagged for a future phase if this legacy admin-notification flow is ever meant to be completed.
- `api/cron/daily-notifications/route.ts` has no shared-secret/signature verification of its own — observed, not fixed (different file, outside this phase's audit target).
- The Phase 14 HR page-routing gap (HR authorized at the action layer, no dedicated page route yet) remains, unrelated to and unaffected by this phase.
- `NotificationDeliveryAttempt` rows are still never written anywhere in the Notification Engine's dispatch pipeline (pre-existing, unrelated to this phase's legacy-`AdminNotification` audit).

## Next Recommended Phase

Either wire `LOAN_APPLICATION_PENDING`/`WALLET_REQUEST_PENDING` to real `loan.actions.ts`/`wallet.actions.ts` approval logic (a feature-completion phase, now safe to build on top of since the access gate is in place), or continue the Phase 15 business-event rollout to `approveMedicalClaim`/`rejectMedicalClaim` and `approveTimelineModificationRequest`/`rejectTimelineModificationRequest`.
