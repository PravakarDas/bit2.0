# Business Events Integration Report (Phase 15)

Wires the next 4 real business events into the existing `NotificationService.raiseEvent()` pipeline — `LEAVE_APPROVED`, `LEAVE_REJECTED`, `OVERTIME_REQUEST_APPROVED`, `OVERTIME_REQUEST_DECLINED` — using the exact pattern `LOAN_APPROVED` (Phase 10) established. No engine component redesigned, no new table, no new architecture.

## Goal & Scope

Extend the set of business events the engine actually delivers, without touching `NotificationEvent`'s `eventType`/`payload` model, without putting notification logic inside business modules, and without an internal `eventType → recipient` resolver inside `NotificationService` (recipients are supplied explicitly by the caller, exactly as Phase 9's own disclosed design decision already established for `LOAN_APPROVED`).

## Candidate Investigation

Inspected every exported function in `leave.actions.ts`, `overtime-request.actions.ts`, `timeline-modification-request.actions.ts`, `medical.actions.ts`, and `wallet.actions.ts` for clean, single-purpose state transitions with real recipient data available after commit.

**Selected — exact match for the requested priority list:**

| Event | Function | File:line | Guard making the transition effectively single-fire |
|---|---|---|---|
| `LEAVE_APPROVED` | `approveLeaveApplication()` | `leave.actions.ts:679` | `application.status !== "PENDING"` rejects a second call before any write |
| `LEAVE_REJECTED` | `rejectLeaveApplication()` | `leave.actions.ts:753` | same |
| `OVERTIME_REQUEST_APPROVED` | `approveOvertimeRequest()` | `overtime-request.actions.ts:306` | `status !== "PENDING" && status !== "MANAGER_VERIFIED"` rejects a re-approval |
| `OVERTIME_REQUEST_DECLINED` | `declineOvertimeRequest()` | `overtime-request.actions.ts:~466` | same |

**Considered, not selected** (structurally similar, deliberately left for a future phase to keep this one to 4): `approveMedicalClaim`/`rejectMedicalClaim`, `approveTimelineModificationRequest`/`rejectTimelineModificationRequest`, `updateWalletRequestStatus`, `processPayroll`.

**Pre-existing gap surfaced, not fixed (out of scope for a notification-integration phase)**: `approveLeaveApplication`/`rejectLeaveApplication` accept `approvedBy` as a raw client-supplied string (`"admin"`/`"manager"`, from `LeaveApprovalButtons.tsx`) with **no server-side role check at all** — unlike every other approve/reject action in this codebase, including the 2 overtime functions this same phase touches. This phase's `raiseEvent` calls use exactly the same (unauthenticated) `approvedBy` value these functions already trust — adding a role check was not requested and is out of scope here.

## Business Trigger Points (exact placement)

All 4 calls follow `approveLoan()`'s (`loan.actions.ts:339`) own established shape precisely: after the state-changing write commits, wrapped in its own `try/catch`, logging (not throwing) on failure.

- `approveLeaveApplication()`: after `prisma.$transaction([...])` (status update + leave-balance deduction) and the existing `notifyLeaveDecision()` call, before `revalidatePath`.
- `rejectLeaveApplication()`: after the `prisma.leaveApplication.update()` and `notifyLeaveDecision()` call, before `revalidatePath`.
- `approveOvertimeRequest()`: after `prisma.$transaction(...)` (status update + `DailyTimeRecord` adjustment + in-app notifications) and the existing `revalidatePath` calls.
- `declineOvertimeRequest()`: after the plain sequential `prisma.overtimeRequest.update()` + `employeeNotification.create()` calls and the existing `revalidatePath` calls (this function has no `$transaction` — none was added; a single `update()` needs none).

## Recipient Resolution — Business Data, Not an Internal Map

No lookup table was added to `NotificationService`. Each call site resolves its own recipient directly from data it already has post-commit:

- Leave events: `application.user.email`/`application.userId` — from the `include: { user: true }` the query already performed.
- Overtime events: `request.user.email`/`request.user.id` — required adding `email: true` to an existing `select` block in both `approveOvertimeRequest` and `declineOvertimeRequest` (the block already selected `id`/`firstName`/`lastName`; email was the one field missing). No schema change, no new query.

## Event Types, Payloads, Dedupe Keys

| Event | Payload shape | Dedupe key |
|---|---|---|
| `LEAVE_APPROVED` | `{ employee: { id, name }, leaveType, leaveDate (ISO), approvedBy }` | `LEAVE_APPROVED:${applicationId}` |
| `LEAVE_REJECTED` | `{ employee: { id, name }, leaveType, leaveDate (ISO), rejectedBy }` | `LEAVE_REJECTED:${applicationId}` |
| `OVERTIME_REQUEST_APPROVED` | `{ employee: { id, name }, totalOvertime, overtimeDate (ISO), approvedBy }` | `OVERTIME_REQUEST_APPROVED:${requestId}` |
| `OVERTIME_REQUEST_DECLINED` | `{ employee: { id, name }, totalOvertime, overtimeDate (ISO), declinedBy, declineReason }` | `OVERTIME_REQUEST_DECLINED:${requestId}` |

`approvedBy`/`rejectedBy` for leave events come from a small extracted helper, `leaveDecisionActorLabel()` — the exact same `"manager"→"Manager"`/`"admin"→"Admin"` capitalization the file's existing `notifyLeaveDecision()` already computed inline; pulled into a one-line shared function so both call sites (the existing in-app notification and the new `raiseEvent` payload) stay consistent, rather than duplicating the ternary a third time. `approvedBy`/`declinedBy` for overtime events use the actual approving admin's real name (`admin.firstName`/`admin.lastName`, from the function's own existing `getDbUser`-equivalent lookup) — a real name, unlike leave's role label, because overtime's approve/decline functions (unlike leave's) do have proper server-side auth resolving a real admin identity.

## Channel

`EMAIL` only, matching `LOAN_APPROVED` and this phase's explicit instruction — no other channel is safely wired end to end yet.

## Preferences (Phase 13/14) — Automatic, Zero Business-Module Logic

`NotificationService.raiseEvent()` is completely unmodified by this phase. Its existing `isOptedOut()` check (Phase 13) reads `NotificationPreference` by `(recipientUserId, eventType, channel)` — a generic lookup with no hardcoded list of event types — so all 4 new events are preference-enforced automatically, with zero code added to `leave.actions.ts`/`overtime-request.actions.ts` for it. None of the 4 business functions check, read, or reference `NotificationPreference` in any way.

To make these actually *toggleable* through the existing Phase 13/14 preference UI (self-service and the admin panel), all 4 were added to `MANAGEABLE_NOTIFICATION_TYPES` (`preferences/preference-catalog.ts`) — a pure data addition to the catalog array, exactly the extension point that file's own doc comment describes ("adding a future business event to this list is the only step required"). This does not touch enforcement (which already worked without it) — it only makes the toggle appear in the UI.

## Templates

Registered via the existing mechanism — `prisma/seed.js`'s idempotent `findFirst`-then-`create` pattern, the same one `LOAN_APPROVED`'s template already uses, extended with a small loop over the 4 new template definitions (same idempotency guard, same shape, zero change to the existing loan-template block or the file's loan-seeding block above it).

| Event | Subject | Placeholders |
|---|---|---|
| `LEAVE_APPROVED` | "Your leave application has been approved" | `{{employee.name}}`, `{{leaveType}}`, `{{leaveDate}}`, `{{approvedBy}}` |
| `LEAVE_REJECTED` | "Your leave application has been rejected" | `{{employee.name}}`, `{{leaveType}}`, `{{leaveDate}}`, `{{rejectedBy}}` |
| `OVERTIME_REQUEST_APPROVED` | "Your overtime request has been approved" | `{{employee.name}}`, `{{totalOvertime}}`, `{{overtimeDate}}`, `{{approvedBy}}` |
| `OVERTIME_REQUEST_DECLINED` | "Your overtime request has been declined" | `{{employee.name}}`, `{{totalOvertime}}`, `{{overtimeDate}}`, `{{declinedBy}}`, `{{declineReason}}` |

Every placeholder maps 1:1 to a payload field listed above — verified directly by the integration tests' exact-string assertions on the rendered `subject`/`html`/`text`, not just by inspection.

**Applied to the live database**: not by running the full `seed.js` (which also non-idempotently creates 2 fake `PENDING` loans for `prisma.user.findFirst()` — the same unrelated side effect flagged and avoided during the earlier SMTP investigation). Instead, a temporary, template-only script (`seed-business-event-templates-only.mjs`) replicated just the idempotent template-registration loop, ran once, and was deleted immediately after — verified via `git status --short` before and after. All 4 templates now exist as active rows:

```
Created LEAVE_APPROVED/EMAIL notification template.
Created LEAVE_REJECTED/EMAIL notification template.
Created OVERTIME_REQUEST_APPROVED/EMAIL notification template.
Created OVERTIME_REQUEST_DECLINED/EMAIL notification template.
```

## Failure Isolation

Every one of the 4 `raiseEvent` calls is wrapped in its own `try/catch` that only `console.error`s — never rethrows, never touches the function's `return`. Each call happens strictly *after* the business write already committed (a `prisma.$transaction`/`update` that already succeeded), so there is no code path by which a notification failure can roll back or block the leave/overtime decision itself. This is architecturally identical to `approveLoan()`'s own placement, not a new pattern.

## Duplicate Rendering/Queueing/Retry/Provider Logic — None Added

`leave.actions.ts`/`overtime-request.actions.ts` gained exactly one call each to `notificationEngineContainer.notificationService.raiseEvent(...)` per function — no template rendering, no queue interaction, no retry logic, no provider selection anywhere in either file. `QueueEngine`, `WorkerRuntime`, `TemplateEngine`, `DeliveryManager`, and the SMTP provider are byte-for-byte unmodified.

## Database Changes

**None.** No migration, no schema edit. The only database writes this phase performed outside the running application were the 4 `NotificationTemplate` rows above — pure data, using the existing model and the existing idempotent seeding mechanism.

## Tests

New file: `src/lib/services/notification-engine/integration/business-events.integration.test.ts` — one `describe` block per event (plus one small block proving `raiseEvent`'s own contract: it throws synchronously only for a validation error, never for a delivery problem, which is exactly what each call site's `try/catch` is defensively written to catch). Structure and fake infrastructure (`FakeQueueRepository`, `FakeEventRepository`, `FakeJobRepository`, `Unused*Repository`) copied verbatim from `loan-approved.integration.test.ts`, matching that file's own documented convention of duplicating fakes per integration test file rather than sharing them across files. The one deliberate difference: a controllable `FakePreferenceRepository` (seedable per test) replaces `AlwaysEnabledPreferenceRepository`, since this phase's tests need to exercise both the enabled and explicitly-disabled preference paths per event.

Per event, verified:
- `raiseEvent` creates the `NotificationEvent` and enqueues a `QUEUED` job with the correct `eventType`, `payload` (exact `deepEqual`), recipient address/id, and `dedupeKey`.
- Full delivery succeeds end to end: worker claims the job, `TemplateEngine` renders the real payload into the real template content, `SmtpDeliveryProvider` sends it — exact `subject`/`html`/`text` string assertions, job reaches `SENT`.
- A graceful SMTP failure (`resolveSmtpConfig: async () => null`) schedules a retry (`RETRY_SCHEDULED`, `attemptCount: 1`) instead of completing the job.
- An explicitly disabled preference: the event is still recorded, but **zero** jobs are created.
- (`LEAVE_APPROVED` only, representative of all 4 — the underlying check is identical for every event, already proven generically in Phase 13's own suite) an explicit *enabled* preference behaves identically to the default no-row path.
- A duplicate `raiseEvent` call with the same `dedupeKey` does not create a duplicate job (`deduplicated: true`, one job total) — `QueueEngine`'s idempotency guard, unmodified, verified again under a new eventType.

The existing `LOAN_APPROVED` suite (`loan-approved.integration.test.ts`) was not touched and continues to pass unmodified, proving this phase introduced no regression to the first business event.

**Not re-tested per new event** (already fully, generically proven once by Phase 13's own suite, and unaffected by which `eventType` is involved): the *general* preference-resolution logic inside `NotificationService.isOptedOut()` itself, and dedup's interaction with `QueueEngine`'s idempotency guard at the unit level.

**Business-module trigger tests**: this project's dependency-free `node --test` harness cannot import `@/lib/prisma` or `@clerk/nextjs/server` (an established, unavoidable constraint documented in every prior phase's own report, including Phase 14's) — so, exactly like `approveLoan()` itself, `approveLeaveApplication()`/`rejectLeaveApplication()`/`approveOvertimeRequest()`/`declineOvertimeRequest()` are not directly unit-tested calling `raiseEvent`. Verified instead by direct code review: each call site's `eventType`/`dedupeKey`/`payload` shape was copied line-for-line into the integration test fixtures above, and `tsc --noEmit` confirms every field referenced (`application.user.email`, `request.user.id`, etc.) actually exists on the query result at that point in the function.

```
tests 537   suites 133   pass 537   fail 0
```

(515 pre-Phase-15 tests, unmodified and still green, + 22 new.) Ran twice from a clean `.test-build` rebuild — identical result both times.

## TypeScript / ESLint

`pnpm tsc --noEmit` → zero errors, whole project. `pnpm run lint` (ESLint) → zero warnings/errors, whole project.

## Build

Not run this phase, per standing instruction to wait for the go-ahead before running `pnpm run build`.

## Security / Authorization

No authorization logic was added or changed in this phase — `approveLeaveApplication`/`rejectLeaveApplication`/`approveOvertimeRequest`/`declineOvertimeRequest` keep exactly the permission checks (or, for the two leave functions, lack thereof — see "Candidate Investigation") they had before. No credential or secret is referenced anywhere in the new code — the SMTP path is entirely reused, unmodified, from Phase 7/8. `employee.email`/`employee.id` in each payload come from data the calling admin/manager/HR user was already authorized to read via the existing query.

## Known Issues

- `approveLeaveApplication`/`rejectLeaveApplication` have no server-side role check (pre-existing, not introduced or fixed by this phase — see "Candidate Investigation").
- `NotificationDeliveryAttempt` rows are still never written anywhere in the dispatch pipeline (pre-existing, unrelated to this phase).
- The HR page-routing gap flagged in `AdminPreferenceManagementReport.md` (Phase 14) is unaffected by and unrelated to this phase — the 4 new preferences are visible through the same admin panel once HR can reach it.

## Deliberately Not Implemented

- No SMS/WhatsApp/push channel for these events — EMAIL only, per instruction.
- No new business events beyond the 4 selected (medical claims, timeline modification, wallet requests, payroll — all left for a future phase).
- No change to the leave/overtime authorization gap noted above.
- No caching, denormalization, or new database table — the existing `NotificationEvent`/`NotificationJob`/`NotificationPreference`/`NotificationTemplate` models handle all 4 events unmodified.

## Next Recommended Phase

Extend the same pattern to the next safest candidates identified above (`approveMedicalClaim`/`rejectMedicalClaim`, `approveTimelineModificationRequest`/`rejectTimelineModificationRequest`), or address the leave-approval authorization gap as its own, explicitly-scoped fix.
