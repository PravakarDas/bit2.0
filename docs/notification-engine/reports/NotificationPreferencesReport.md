# Notification Preferences Report (Phase 13)

Makes the Notification Engine honor per-user, per-notification-type, per-channel opt-outs, enforced centrally inside `NotificationService.raiseEvent()` rather than by any business module. `LOAN_APPROVED`/`EMAIL` is the first (and, for now, only) preference exposed to employees; the underlying model and resolution logic are channel/event-type-generic.

## Goal & Scope

Read the existing `NotificationPreference` Prisma model (Phase 1, never previously read from or written to — flagged as a known gap in `NotificationServiceReport.md`'s "Known Limitations"), confirm it is sufficient as-is, and build the missing repository/service/action/UI layer on top of it. No engine component from Phases 2–12 was redesigned.

## Schema Decision

**No schema change was made or needed.** The existing model:

```prisma
model NotificationPreference {
  id String @id @default(cuid())
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  notificationType String // Matches NotificationEvent.eventType
  channel          NotificationChannel
  isEnabled        Boolean             @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([userId, notificationType, channel])
  @@index([userId])
}
```

already has exactly the shape this phase's own spec asked for (user, notificationType, channel, enabled), a unique constraint that makes "one row per triple" atomic via `upsert`, and an index on `userId` for the per-user list read. This confirms the Phase 1 database design correctly anticipated this feature. Per this phase's own STOP conditions, no migration was proposed, generated, or applied.

## Preference Resolution Rule

Implemented in `NotificationService.raiseEvent()`'s existing per-recipient fan-out loop (`notification.service.ts`'s new private `isOptedOut()` helper):

1. A recipient with no `recipientUserId` (no linked `User` to check a preference against — e.g. a future channel with only a raw address) is **never** opted out; there is nothing to look up.
2. Otherwise, look up `NotificationPreference` by `(recipientUserId, eventType, recipient.channel)`.
3. **No row found → enabled.** This is the default-behavior decision from this phase's own spec, applied literally: existing users who have never touched a preference continue receiving every notification exactly as before this phase shipped.
4. **Row found with `isEnabled: false` → opted out** — no `NotificationJob` is created for that recipient.
5. **Row found with `isEnabled: true` → enabled** (identical outcome to "no row," listed separately only because it is a distinct code path/test case).

This is a pure read — no caching, no denormalization. Every `raiseEvent` call re-checks the current preference state, so a preference changed between two events (or two identical events, since dedup only collapses truly duplicate `dedupeKey`s) takes effect on the very next `raiseEvent` call.

## Default Behaviour (explicit decision, per this phase's own spec)

> If a user has NO explicit preference → notification is ENABLED by default. If the user explicitly disables → not delivered.

Implemented exactly as written. This was the only behaviorally significant decision in this phase — getting it backwards (default-disabled) would have silently stopped every existing `LOAN_APPROVED` email for every employee who has never opened a preferences screen, which is precisely the regression the LOAN_APPROVED tests in this phase (scenario A) guard against.

## Disabled Behaviour — Event Recorded, No Job Created

`raiseEvent()` still: validates the request, deduplicates on `dedupeKey`, and inserts the `NotificationEvent` row — **before** any recipient's preference is checked. The preference check only affects the per-recipient fan-out step that follows. So for an event with every recipient opted out, `raiseEvent()` returns `{ event, jobs: [], deduplicated: false }` — the business event ("a loan was approved") remains permanently recorded and queryable (`getEventById`/`getEventByDedupeKey`, and via the Notification Center's admin queue view, which reads `NotificationJob` joined to `NotificationEvent`), even though nothing was queued for delivery. This satisfies the phase's explicit "do not destroy event/audit history" requirement without introducing any new table or flag — the existing dedupe-key-bearing `NotificationEvent` row already *is* that audit record.

## NotificationService Integration

`NotificationService`'s constructor gained one new required parameter, `preferenceRepository: INotificationPreferenceRepository` — the same additive-constructor-parameter pattern Phase 9 used to add `queueEngine`. Its one real caller, `container.ts`, was updated; no other previously-completed phase's public API changed.

```
raiseEvent()
    ↓ validate request (unchanged, Phase 9)
    ↓ deduplicate event on dedupeKey (unchanged, Phase 9)
    ↓ insert NotificationEvent (unchanged, Phase 9)
    ↓ for each recipient:
        ↓ check NotificationPreference (NEW — this phase)
        ↓ if opted out: skip (no job, event already recorded)
        ↓ if enabled: queueEngine.enqueue(...) (unchanged, Phase 3)
    ↓ return { event, jobs, deduplicated }
```

Preference logic lives nowhere else — not in `loan.actions.ts`, not in `WorkerRuntime`, not in `DeliveryManager`, not in the SMTP provider. `loan.actions.ts` was **not modified** in this phase; `approveLoan()`'s existing `raiseEvent(...)` call automatically gained preference enforcement for free, exactly as this phase's spec intended ("a business module should simply be able to call `raiseEvent(...)`").

## New Components (Core Infrastructure pattern, matching Phase 2's repository/DTO/validator style)

| Component | File | Role |
|---|---|---|
| `NotificationPreferenceDTO`, `UpsertNotificationPreferenceInput` | `dto/notification-preference.dto.ts` | DTOs derived from `@prisma/client`'s `NotificationPreference`, same `Pick`-based style as every other DTO in this module. |
| `INotificationPreferenceRepository` | `repositories/interfaces/notification-preference-repository.interface.ts` | `findOne`, `findByUser`, `upsert` — pure data access, no default-resolution logic (that lives in the service/enforcement layer, not here). |
| `NotificationPreferenceRepository` | `repositories/notification-preference.repository.ts` | Prisma-backed implementation, extends the shared `BaseRepository` (consistent error wrapping via `wrap()`), same shape as `NotificationTemplateRepository`/`NotificationProviderRepository`. |
| `NotificationPreferenceValidator` | `validators/notification-preference.validator.ts` | Structural-only validation (non-empty `userId`/`notificationType`, valid `channel` enum member, boolean `isEnabled`) — same posture as every other validator in this module: no business rules. |
| `MANAGEABLE_NOTIFICATION_TYPES` | `preferences/preference-catalog.ts` | The UI-facing catalog of `(notificationType, channel)` pairs an employee may self-manage — today just `LOAN_APPROVED`/`EMAIL`. Presentation-facing, not core architecture; extending it to a future business event/channel requires editing only this one array. |
| `NotificationPreferenceService` | `preferences/notification-preference.service.ts` | Read/write access to a user's own preferences (`listForUser`, `setForUser`) — the Notification Center-facing counterpart to `NotificationInboxService`. Never enqueues, sends, or touches `QueueEngine`/`WorkerRuntime`; `setForUser` rejects any `(notificationType, channel)` pair outside the catalog. |

All wired into `container.ts` exactly like every prior phase's components: `preferenceRepository` constructed once, passed into both `NotificationService` (enforcement) and `NotificationPreferenceService` (self-service read/write) — the same repository instance backs both, so a preference set via the UI is visible to the very next `raiseEvent` call with no extra plumbing.

## Duplicate / Idempotency Safety

No change to event-level (`dedupeKey`) or job-level (`idempotencyKey`) deduplication — both remain exactly as Phase 9/3 implemented them, unmodified. The preference check runs *before* `queueEngine.enqueue()` is ever called for an opted-out recipient, so `QueueEngine`'s own idempotency guard never even sees a request for that recipient; nothing about this phase bypasses or duplicates its logic. Verified directly: a duplicate `raiseEvent` call for an opted-out recipient still deduplicates on the event (`deduplicated: true` on the second call) and still creates zero jobs both times (test D, below).

## Notification Center — UI Changes

Added a "Preferences" button to the existing employee Notification Center page header (`(employee)/notification-center/page.tsx`), opening a new `NotificationPreferencesDialog` (`components/shared/notification-center/`) — one toggle per entry in `MANAGEABLE_NOTIFICATION_TYPES` (today: one row, "Loan approved" / EMAIL). Reuses the existing shadcn `Dialog`/`Switch`/`Label` primitives and `sonner` toast pattern already used throughout this Notification Center, per this phase's "do not redesign" instruction — no new page, no new route, no new sidebar entry. Optimistic toggle with rollback-on-failure, matching the read/archive toggle pattern already in `NotificationTable`.

**No admin or manager UI/action was added.** Per your explicit decision on this phase's stop condition, employee notification preferences are self-service-only in Phase 13 — no admin/manager view or override exists yet. This is a deliberate scope boundary, not an oversight; extending visibility or control to SUPERADMIN/HR/manager is left for a future, separately-scoped phase.

## Authorization

`notification-preferences.actions.ts` follows the exact wrapper shape of `notification-inbox.actions.ts`: every action calls `getDbUser()` and scopes every read/write to `user.id` — an employee can only ever see or change their own preferences, never another user's. There is no code path (action, service method, or repository call) through which one user's request can reach another user's `NotificationPreference` row. `setForUser` additionally rejects (via `ValidationError`) any `notificationType`/`channel` pair outside `MANAGEABLE_NOTIFICATION_TYPES`, preventing a client from writing an arbitrary preference row for an event type that isn't actually offered.

## Tests

15 new tests, all deterministic, zero live-database access (in-memory fakes throughout, same `node --test` dependency-free harness every prior phase uses):

**`notification.service.test.ts`** — 8 new tests in a `NotificationService.raiseEvent — preferences (Phase 13)` block, using a new in-memory `FakePreferenceRepository`:
- A. default (no preference) → job created
- B. explicit enable → job created
- C. explicit disable → event recorded, **zero** jobs, zero `queueEngine.enqueue` calls
- D. duplicate `raiseEvent` call while disabled → still deduplicates on the event, zero jobs both times
- opting out one channel doesn't affect a different channel for the same user/type
- multiple recipients checked independently — a mixed enabled/disabled recipient list yields jobs only for the enabled ones
- a preference change between two distinct events takes effect on the very next call (no caching)
- a recipient with no `recipientUserId` is never opted out

**`preferences/notification-preference.service.test.ts`** — 7 new tests covering `listForUser` (default view model, explicit-disabled view model, per-user scoping) and `setForUser` (valid upsert, rejects an out-of-catalog channel, rejects an unrecognized `notificationType`, round-trips through `listForUser`).

The two existing real-pipeline integration tests (`loan-approved.integration.test.ts`, `worker-activation.integration.test.ts`) were updated to construct `NotificationService` with a new `AlwaysEnabledPreferenceRepository` fake (`findOne` always returns `null` — the default-enabled path) so their pre-existing scenarios (success, SMTP failure/retry, crash recovery) continue to exercise the exact same behavior as before this phase, proving the preference check is transparent to every already-passing scenario when no preference has been set.

```
tests 491   suites 124   pass 491   fail 0
```

(476 pre-Phase-13 tests, unmodified and still green, + 15 new.)

## LOAN_APPROVED Regression

`loan.actions.ts` was not touched. Its existing `raiseEvent(...)` call for `LOAN_APPROVED` is unchanged; the four scenarios from this phase's own spec are covered exactly as it asked:

| Scenario | Result |
|---|---|
| A. Default user, no preference | Event created, job created (verified via `notification.service.test.ts`'s preference-block test A + the unmodified `loan-approved.integration.test.ts`, which proves the full real pipeline still sends for the default/no-preference case) |
| B. User explicitly enables `LOAN_APPROVED`/`EMAIL` | Event created, job created (test B) |
| C. User explicitly disables `LOAN_APPROVED`/`EMAIL` | Event created, **no** job created, no email sent (test C) |
| D. Same event submitted twice | Deduplication unchanged — second call returns the same event, `deduplicated: true`, no second fan-out attempted regardless of preference state (test D, plus the pre-existing dedup describe block, all still passing) |

## Code Quality

Strict TypeScript throughout (no `any`), no new dependency, no `console.log` (only `console.error` on the existing convention's failure paths, matching every other action file), reuses the existing `ValidationError`/`RepositoryError` hierarchy, the existing repository-interface/DI pattern, and the existing manual-wiring `container.ts` — no DI framework introduced. No Redis, no second queue, no second worker, no second notification engine.

## Known Limitations

- `MANAGEABLE_NOTIFICATION_TYPES` currently lists exactly one entry (`LOAN_APPROVED`/`EMAIL`) — matching the fact that it is still the only real business event/channel this project has wired end to end (Phase 10). Adding a future event/channel to the self-service UI requires only a one-line addition to this catalog; no engine or schema change.
- No admin/manager visibility or override of employee preferences exists yet (deliberate scope boundary — see "Notification Center — UI Changes" above).
- A recipient supplied without a `recipientUserId` can never be opted out, by construction — there is no user to check a preference against. This matches every other per-user feature in this engine (e.g. the Notification Center's own inbox state is likewise unavailable for a job with no `recipientUserId`).
- No bulk "opt out of everything" control — each `(notificationType, channel)` pair is toggled independently, matching the granularity the underlying `@@unique([userId, notificationType, channel])` model was built for.

## Next Recommended Phase

Per your decision on this phase's admin/manager stop condition: a deliberately-scoped follow-up phase for SUPERADMIN/HR visibility (and/or override) of employee preferences, if wanted. Beyond that, the same extension points every phase since Phase 2 has been built around: additional business events (each just needs a `raiseEvent` call + a `MANAGEABLE_NOTIFICATION_TYPES` entry to become preference-controllable), and additional channels behind their own `DeliveryProvider`.
