# Leave Authorization Hardening Report (Phase 16)

Fixes the pre-existing authorization weakness surfaced during Phase 15: `approveLeaveApplication()`/`rejectLeaveApplication()` trusted a client-supplied string as proof of who was approving/rejecting, with no server-side verification of the actual signed-in user at all. This phase is authorization-only — no Notification Engine architecture, no new business event, no schema change.

## Original Authorization Weakness

Before this phase:

```ts
export async function approveLeaveApplication(applicationId: string, approvedBy: string = "SYSTEM", _adminNote?: string) {
    void _adminNote;
    try {
        const application = await prisma.leaveApplication.findUnique({ ... });
        ...
        await prisma.$transaction([
            prisma.leaveApplication.update({ data: { status: "APPROVED", approvedBy, ... } }),
            ...
        ]);
```

- No `getDbUser()`/`auth()` call anywhere in either function — the current signed-in user was never resolved, let alone checked.
- `approvedBy` was accepted directly from the caller and written verbatim into `LeaveApplication.approvedBy`, used as the "who decided" label in the in-app `AdminNotification` and (as of Phase 15) the `LEAVE_APPROVED`/`LEAVE_REJECTED` email payload.
- The only caller in the UI, `LeaveApprovalButtons.tsx`, passed a **hardcoded literal** (`"admin"` or `"manager"`, from an `approverRole` prop set by which page rendered the button) — never anything derived from an actual session.
- A second, independent call site (`notification.actions.ts`'s `handleNotificationAction`, reachable from the Admin Notification Center's approve/decline quick-action for `LEAVE_APPLICATION_PENDING` notifications) had its own **separate bug**: it called `approveLeaveApplication(metadata.applicationId, adminNote)`, passing a free-text admin note into the `approvedBy` slot — meaning arbitrary typed text could end up stored as the approver identity and shown in the notification email. Neither call site's bug was reachable without also fixing the underlying function's total lack of verification, so both are fixed together as one coherent audit (see "Exact Fix").
- Net effect: **any code path that could reach these two functions — regardless of the caller's actual role — could approve or reject any pending leave application**, with the stored "approver" being whatever string the caller happened to pass, never verified against anything.

## Existing Authorization Pattern Discovered

Investigated every other approve/reject-style action in the codebase:

| File | Pattern |
|---|---|
| `loan.actions.ts` | `user.role !== "SUPERADMIN" && user.role !== "HR"` → reject |
| `overtime-request.actions.ts` | same SUPERADMIN-or-HR check, resolved via `auth()` + `prisma.user.findUnique` |
| `medical.actions.ts` | same SUPERADMIN-or-HR pattern |
| `wallet.actions.ts` | same SUPERADMIN-or-HR pattern |
| `timeline.actions.ts`'s `canUpdateTimeline` | three-way: `role === "SUPERADMIN" \|\| role === "HR" \|\| (role === "EMPLOYEE" && isManager)` |
| `settings.actions.ts` | same three-way pattern |
| `leave.actions.ts`'s own `canManageOrganization` (pre-existing, used for leave-type/entitlement CRUD) | two-way: `role === "SUPERADMIN" \|\| (role === "EMPLOYEE" && isManager)` — **excludes HR**, because it's an org-configuration permission class, not an approval permission class |

Every genuine "approve/reject a request" action in this codebase resolves the caller server-side (via `getDbUser()`, the codebase's preferred pattern per CLAUDE.md) and checks role before touching data — never accepts identity from the client. The three-way `SUPERADMIN | HR | (EMPLOYEE && isManager)` check is the dominant convention specifically for approval actions (as opposed to `canManageOrganization`'s narrower two-way check for configuration actions). Route-level evidence confirms leave approval was always intended to be admin-or-manager-reachable (`LeaveApprovalButtons.tsx`'s only two callers: `/admin/leave-applications`, SUPERADMIN-only, and `/manager/leave-applications`, `EMPLOYEE && isManager`-only) — HR was added to match every sibling approval domain's action-layer convention, consistent with the codebase's existing pattern of authorizing HR at the action layer even where no dedicated HR page route exists yet (documented in `AdminPreferenceManagementReport.md`, Phase 14, as a pre-existing, unrelated routing gap — not something this phase touches).

`isManager` in this schema has no direct-report scoping (no `managerId`/`reportsTo` relation exists on `User`) — every manager-gated check across the entire codebase is unscoped (any `isManager: true` user), so the new leave check follows the same granularity, not a stricter or looser one.

## Exact Fix

**New pure module**: `src/lib/leave-authorization.ts` — `canApproveLeave()` (a type predicate: `SUPERADMIN | HR | (EMPLOYEE && isManager)`) and `resolveApproverLabel()` (a real display name if the verified user has one, else a role-based fallback: "Admin"/"HR"/"Manager"). Zero imports from `@/lib/prisma` or Clerk — pure functions over a plain `ApproverCandidate` shape, extracted specifically so this logic can be unit-tested by this project's dependency-free `node --test` harness (the same reason `smtp-shared.ts`/`crypto.ts` exist as separate files from the Prisma-touching code that uses them).

**`leave.actions.ts`** — both functions now:
1. Resolve the caller via `getDbUser()` (this file's own established pattern, already used by `canManageOrganization`'s callers elsewhere in the same file).
2. Call `canApproveLeave(admin)` **as the first statement in the function body**, before any `prisma.leaveApplication.findUnique` or other read — an unauthorized caller never reaches the database at all, let alone the transaction.
3. On failure: `return { success: false, error: "Unauthorized" }` — same shape every other action in this codebase returns for this case.
4. On success: `resolveApproverLabel(admin)` replaces the old client-supplied `approvedBy` string everywhere it was used — the `LeaveApplication.approvedBy` column write, `notifyLeaveDecision()`'s in-app notification, and the `LEAVE_APPROVED`/`LEAVE_REJECTED` email payload's `approvedBy`/`rejectedBy` field.
5. Signature changed: `approveLeaveApplication(applicationId: string, adminNote?: string)` / `rejectLeaveApplication(applicationId: string, adminNote?: string)` — the old middle `approvedBy` parameter is gone entirely; the remaining optional string parameter is now genuinely just a note (unused today, same as before — `void adminNote` — no schema field exists to persist it into, unchanged from the pre-existing behavior).

**Call sites updated**:
- `LeaveApprovalButtons.tsx`: stopped passing any identity argument; `approverRole` prop removed entirely (it never did anything except get forwarded into the now-removed parameter). Both page callers (`(admin)/admin/leave-applications/page.tsx`, `(manager)/manager/leave-applications/page.tsx`) updated to match — the admin page already passed nothing, the manager page's `approverRole="manager"` was removed.
- `notification.actions.ts`'s `handleNotificationAction`: `adminNote` now lands in the correct (only remaining) parameter slot instead of accidentally impersonating an approver — the pre-existing misrouted-argument bug is fixed as part of the same audit, not left in place.

## Why This Fix Is Correct

- **Never trusts client input for identity** (requirement 3): the removed `approvedBy` parameter is gone from both functions' signatures entirely — there is no argument slot left that could carry an identity claim from a caller.
- **Authenticated/current DB user verified server-side** (requirement 4): `getDbUser()` resolves the caller from the actual Clerk session on every call, exactly as every other approval action in this codebase does.
- **Preserves existing behavior for authorized users** (requirement 5): the state transition (`status: "APPROVED"`/`"REJECTED"`, balance deduction, `notifyLeaveDecision`, `revalidatePath` calls, `LEAVE_APPROVED`/`LEAVE_REJECTED` `raiseEvent` calls) is byte-for-byte unchanged in shape — only the *value* assigned to `approvedBy`/`rejectedBy` changed, from an untrusted role-label string to a verified user's real name (or a role fallback when no name is on file), which is a strictly more accurate value, not a behavior change to the transition itself.
- **Rejects before mutating** (requirement 6): the `canApproveLeave` check is the first statement inside the `try` block, before the `prisma.leaveApplication.findUnique` call — an unauthorized caller triggers zero database reads or writes.
- **Notification behavior from Phase 15 unchanged** (requirement 7): `NotificationService.raiseEvent()`, `QueueEngine`, `WorkerRuntime`, `TemplateEngine`, `DeliveryManager`, and the SMTP provider are untouched by this phase. The `eventType`s (`LEAVE_APPROVED`/`LEAVE_REJECTED`), `dedupeKey` format (`LEAVE_APPROVED:${applicationId}`/`LEAVE_REJECTED:${applicationId}`), payload *shape* (`{ employee, leaveType, leaveDate, approvedBy }` / `{ ..., rejectedBy }`), preference enforcement (unmodified `isOptedOut()`), and best-effort `try/catch` placement (after commit, never blocking) are all identical to Phase 15 — verified by the entire Phase 15 integration suite still passing unmodified (see Tests).
- **No schema change** (requirements 8/9): `NotificationEvent`'s `eventType`/`payload` shape is untouched. `LeaveApplication.approvedBy` was already a free-text `String?` column before this phase — it simply now receives a correctly-verified value instead of an untrusted one. No migration was proposed, generated, or applied.
- **No unrelated gap fixed** (requirement 10): `handleNotificationAction`'s own top-level function has no authorization check of its own (a broader, pre-existing gap affecting every notification type it handles — profile requests, loans, wallet, etc., not just leave). This was deliberately **not** touched — it doesn't need to be, since `approveLeaveApplication`/`rejectLeaveApplication` now enforce authorization at the actual mutation boundary regardless of which caller reaches them, which is exactly the "action-level checks are the real enforcement boundary, never assume the calling page/caller already enforced access" principle this codebase already follows everywhere else (CLAUDE.md).

## Files Changed

**Created**: `src/lib/leave-authorization.ts`, `src/lib/leave-authorization.test.ts`, this report.

**Modified**: `src/actions/leave.actions.ts` (auth check + `resolveApproverLabel` wiring in both functions; removed the two inline helpers now living in `leave-authorization.ts`), `src/actions/notification.actions.ts` (fixed the misrouted `adminNote` argument), `src/components/admin/LeaveApprovalButtons.tsx` (removed the `approverRole` prop/argument), `src/app/(manager)/manager/leave-applications/page.tsx` (removed the now-nonexistent prop), `tsconfig.test.json` + `package.json` (registered the new test file).

**Not touched**: `prisma/schema.prisma`, any migration, `NotificationService`, `QueueEngine`, `WorkerRuntime`, `TemplateEngine`, `DeliveryManager`, the SMTP provider, the Notification Center, `notification-preferences.actions.ts`, `notification-preferences-admin.actions.ts`, `overtime-request.actions.ts`, `loan.actions.ts`, `(admin)/admin/leave-applications/page.tsx` (already passed no prop).

## Database / Schema Changes

**None.** `LeaveApplication.approvedBy` (pre-existing `String?` column) is the only field this phase writes differently — same column, same type, no migration.

## Tests

New file: `src/lib/leave-authorization.test.ts` (11 tests, dependency-free, zero Prisma/Clerk import):

| Requirement | Test(s) |
|---|---|
| A/C. Authorized user can approve/reject | `canApproveLeave` returns `true` for SUPERADMIN, HR, and an `EMPLOYEE` with `isManager: true` |
| C/D. Unauthorized user cannot approve/reject | `canApproveLeave` returns `false` for a plain `EMPLOYEE` (`isManager: false`) and for `null`/`undefined` |
| E. Client-supplied `approvedBy` cannot impersonate an approver | `canApproveLeave` is driven entirely by `role`/`isManager` — a test asserts that setting `firstName`/`lastName` to role-sounding strings (`"SUPERADMIN"`, `"HR"`) on an unauthorized candidate has no effect, proving the function has no code path where any string field grants authorization |
| — | `resolveApproverLabel` tests: real name preferred when present, role-based fallback for SUPERADMIN/HR/Manager when absent, blank-but-present name strings correctly fall through to the role label |

**F/G. Existing `LEAVE_APPROVED`/`LEAVE_REJECTED` notification behavior still works** and **I. existing preference behavior unchanged**: proven by the entire, **unmodified** Phase 15 `business-events.integration.test.ts` suite continuing to pass — this phase changed neither the payload shape, the `dedupeKey` format, nor any preference-enforcement code, so those tests exercising the full `raiseEvent → Queue → Worker → Template → SMTP` pipeline for `LEAVE_APPROVED`/`LEAVE_REJECTED` remain a valid, still-passing proof.

**H. Failed authorization does not create a notification event/job**: proven structurally, not by a live integration test — `raiseEvent()` is called only after the `prisma.$transaction`/`update` succeeds, which itself is only reached after `canApproveLeave(admin)` passes (see "Exact Fix" step 2's placement, verified by direct code reading of the current function body: the auth check is literally the first statement, with a `return` on failure — there is no code path from an unauthorized call to the `raiseEvent` call several statements later). This is the same verification method Phases 14/15 used for action-layer behavior the dependency-free test harness cannot execute (`leave.actions.ts` imports `@/lib/prisma`, which `node --test` cannot resolve).

**J. Existing test suite remains green**:

```
tests 548   suites 135   pass 548   fail 0
```

537 pre-Phase-16 tests, unmodified and still green (including the full, untouched Phase 15 `business-events.integration.test.ts` suite and the untouched Phase 10 `loan-approved.integration.test.ts` suite) + 11 new. Ran twice from a clean `.test-build` rebuild — identical result both times.

## Verification Results

- `pnpm tsc --noEmit` — zero errors, whole project.
- `pnpm run lint` (ESLint) — zero warnings/errors, whole project.
- `pnpm run build` — compiles successfully; the same 5 pre-existing cosmetic Turbopack Edge-runtime warnings as every prior phase (Node-only code reachable from `instrumentation.ts`'s Edge-runtime bundle — `crypto.ts`, `container.ts`, `delivery-manager.ts`, `notification.service.ts`, `production-worker.ts`), no new warning introduced by this phase's changes.

## Security Review

- Authorization now genuinely server-side and unforgeable through any client-supplied argument — the vulnerable parameter no longer exists in either function's signature.
- No new attack surface introduced: `getDbUser()` is the same, already-audited resolver every other action in this codebase uses; `canApproveLeave`/`resolveApproverLabel` are pure functions with no I/O, no injection surface, no dynamic property access.
- No secret or credential referenced anywhere in this phase's changes.
- No new dependency added.
- The `handleNotificationAction` top-level gap (see "Why This Fix Is Correct") remains — flagged, not fixed, per requirement 10.

## Known Issues

- `handleNotificationAction` (`notification.actions.ts`) still has no authorization check of its own at the top level — a broader, pre-existing gap affecting every notification type it routes (profile requests, loans, wallet, etc.), not just leave. Each individual action it delegates to (including the two fixed here) enforces its own authorization independently, so this gap does not currently allow an unauthorized leave decision — but it is a defense-in-depth gap worth a dedicated future look if other delegated actions don't all independently authorize as robustly.
- The Phase 14 HR page-routing gap (HR authorized at the action layer but no dedicated page route exists for `/admin/leave-applications` or any HR-specific route) is unaffected by and unrelated to this phase.
- `NotificationDeliveryAttempt` rows are still never written anywhere in the dispatch pipeline (pre-existing, unrelated).

## Next Recommended Phase

Either extend the same `SUPERADMIN | HR | (EMPLOYEE && isManager)` authorization audit to `handleNotificationAction`'s other delegated action types (as its own explicitly-scoped hardening phase), or continue the Phase 15 business-event rollout to the next safe candidates already identified (`approveMedicalClaim`/`rejectMedicalClaim`, `approveTimelineModificationRequest`/`rejectTimelineModificationRequest`).
