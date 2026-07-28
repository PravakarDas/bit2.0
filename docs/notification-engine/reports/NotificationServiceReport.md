# Notification Service Report (Phase 9 — Notification API & Orchestration)

This phase completes `NotificationService.raiseEvent()` — the single public entry point business modules will eventually use to raise a notification — as a pure orchestrator over the components Phases 2–8 already built. It does not integrate any business module, does not activate the worker, and does not touch `instrumentation.ts`.

## Goal & Scope

Turn `NotificationService` from a stub façade into a working orchestration layer: validate the request, deduplicate on `dedupeKey`, fan out one `NotificationJob` per supplied recipient via the existing `QueueEngine`, and return. No new architecture — `raiseEvent` composes `NotificationEventValidator` (Phase 2), `QueueEngine.enqueue` (Phase 3, including its existing job-level idempotency), and one small new validator/DTO pair for the request shape itself.

## Files Created

- `src/lib/services/notification-engine/dto/raise-event.dto.ts` — `RaiseEventRecipient`, `RaiseEventRequest`, `RaiseEventResult`.
- `src/lib/services/notification-engine/validators/raise-event-request.validator.ts` — `RaiseEventRequestValidator` (structural checks on `recipients`, mirroring `NotificationJobValidator`'s channel check).
- `src/lib/services/notification-engine/notification.service.test.ts` — 20 tests covering every item in this phase's Testing section.
- `docs/notification-engine/reports/NotificationServiceReport.md` — this file.

## Files Modified

| File | Change |
|---|---|
| `notification.service.ts` | `raiseEvent()` fully implemented (was a throw-stub). New constructor parameter: `queueEngine: IQueueEngine`. `processJob`/`resendJob` remain stubs — see "Scope Boundary" below. |
| `container.ts` | `queueEngine` is now constructed before `notificationService` and passed into its constructor. |
| `utils/clock.ts` / `utils/index.ts` | Added `FixedClock implements IClock` (additive) — the mechanism `scheduledAt` uses (see "Scheduling" below). |
| `dto/index.ts` / `validators/index.ts` | Export the two new files above. |
| `tsconfig.test.json` / `package.json` | Added `notification.service.ts`/`notification.service.test.ts` to the compiled/run test set (this file lives at the package root, not under an already-included subfolder). |

## Public API

```ts
await notificationService.raiseEvent({
  eventType: "LOAN_APPROVED",
  payload: { employeeId, employeeName, amount, approvedBy },
  recipients: [
    { channel: "EMAIL", recipientAddress: employee.email, recipientUserId: employee.id },
  ],
});
```

`recipients`, `dedupeKey`, `sourceDomain`, `triggeredByUserId`, `scheduledAt`, and `maxAttempts` are the only other fields — none of them require the caller to know about `QueueEngine`, `WorkerRuntime`, `TemplateEngine`, `DeliveryManager`, SMTP, providers, retry logic, or the queue implementation. `raiseEvent` returns `{ event, jobs, deduplicated }`.

## Design Decisions (Disclosed, Per This Phase's Own Instructions)

This phase's own STOP conditions require disclosing, not silently making, any interpretation that goes beyond "obvious wiring." Two came up:

**1. `recipients` is a required field, even though the phase's own example usage omits it.**
The frozen design's class diagram sketches a private `resolveRecipients(eventType, payload)` method — an internal `eventType → recipient` mapping table. That table is real business logic ("who cares about `LOAN_APPROVED`" is a decision only the Loan domain can make), and this phase explicitly forbids two things that a hardcoded version of that table would require: implementing the Loan module, and putting business logic inside `NotificationService` ("NotificationService is an ORCHESTRATION layer. It must NOT contain business logic."). The existing (Phase 2) `NotificationJobFactory`'s own doc comment already anticipated this: *"Does NOT decide which recipients/channels a given event should fan out to — that resolution is business logic... Callers already know the one recipient/channel pair they want a job for."* Requiring the caller to supply `recipients` is therefore not new scope creep — it is the pre-existing Phase 2 boundary, made explicit at the `raiseEvent` layer instead of silently deferred again. A future phase that builds real business modules can still add an internal resolver *on top of* this API (e.g. an optional `recipients`-omitted path that consults a mapping table) without changing today's signature — this is additive, not a breaking redesign.

**2. `dedupeKey`/`sourceDomain` are optional, with a documented default derivation, rather than required.**
Both fields already exist on `NotificationEvent` (Phase 1, frozen — this phase does not add, rename, or remove any field). Requiring every caller to invent a dedupe convention would reintroduce the same "engine internals leak into business modules" problem `dedupeKey`'s *format* represents. Defaults:
- `sourceDomain` = the lowercased first `_`-delimited segment of `eventType` (`"LOAN_APPROVED"` → `"loan"`), matching the schema's own comment (`sourceDomain`: *"Which actions.ts domain raised this event, e.g. `loan`"*).
- `dedupeKey` = `` `${eventType}:${sha256(stableStringify(payload)).slice(0, 32)}` ``. Deterministic and key-order-independent: two calls with the *exact same* `eventType`+`payload` (a double-click, a retried Server Action after a network blip — Design §17's own scenarios) collapse to the same event; two different business events sharing an `eventType` (different `payload`) get distinct keys. A caller that needs a stronger domain-specific identity (e.g. "one notification per `loanId` ever, regardless of amount") can still pass an explicit `dedupeKey` override — this is purely a convenience default, not a constraint.

Neither of these changes `NotificationEvent`'s schema (still exactly `eventType` + `payload`, plus the already-existing `dedupeKey`/`sourceDomain`/`triggeredByUserId` from Phase 1) or any previously-completed phase's frozen abstraction (`QueueEngine`, `WorkerRuntime`, `TemplateEngine`, `DeliveryManager`, SMTP are untouched).

## Orchestration Flow

1. `RaiseEventRequestValidator.validate(request)` — structural check: non-empty `eventType`, non-empty `recipients` array, each recipient has a valid `channel` and non-empty `recipientAddress`.
2. Derive (or accept an override for) `dedupeKey`/`sourceDomain`; re-validate the resulting event shape with the existing `NotificationEventValidator` (Phase 2, unmodified).
3. **Event-level dedup**: `notificationRepository.findByDedupeKey(dedupeKey)` — if found, return that event and its existing jobs (`jobRepository.findMany({ eventId })`) with `deduplicated: true`. No new insert, no new fan-out.
4. Otherwise, insert the `NotificationEvent`. A concurrent `raiseEvent` call racing on the same `dedupeKey` (two requests both missing the dedupe check at step 3) is detected by catching the resulting unique-constraint violation (Prisma `P2002` on `dedupeKey`, surfaced as a `RepositoryError` whose `.cause` carries the raw Prisma error — the same detection technique `IdempotencyGuard` already uses for `idempotencyKey`, applied locally rather than generalizing that Phase 3 file for one call site) and re-fetching by `dedupeKey` — the loser of the race gets exactly the same `deduplicated: true` result as if it had lost the check synchronously.
5. **Fan-out**: for each recipient, call `queueEngine.enqueue(...)` (Phase 3, unmodified) — one `NotificationJob` per recipient. Job-level idempotency (duplicate `(channel, recipientUserId)` pairs, whether from a genuinely duplicate `recipients` entry or a retried call) is `QueueEngine.enqueue`'s own existing behavior: it returns the existing job instead of erroring or inserting a duplicate.

## Scheduling

`scheduledAt` reuses the `IClock` seam `NotificationJobFactory` already reads `nextAttemptAt` from, via a new `FixedClock implements IClock` (returns a constant date) passed to `queueEngine.enqueue({ ..., clock })`. No new field was added to `BuildNotificationJobParams`, `NotificationJob`, or the queue engine's API — scheduling is entirely an application of an extension point Phase 2 already exposed for testability.

## Scope Boundary — What This Phase Deliberately Did Not Touch

- **`processJob()`/`resendJob()` remain stubs.** As of Phase 8, job processing (claim → render → dispatch → complete/retry) is `WorkerRuntime`'s responsibility, not `NotificationService`'s — implementing `processJob()` here would duplicate that pipeline. The stub's error message was updated to point at `WorkerRuntime`/`EngineIntegrationReport.md` instead of the pre-Phase-8 "not built yet" wording, since the underlying capability now exists (elsewhere).
- **`NotificationPreference` opt-outs are not checked.** The frozen design's §6 fan-out diagram includes a "check `NotificationPreference` per recipient/channel, skip if opted out" step. No repository exists yet for that model (it is not among the six repositories built in Phase 2, and building a new one was not in this phase's numbered IMPLEMENT list, which never mentions preferences). Adding one now would be a new architectural surface introduced without being asked for — left as a known limitation, for a phase that's explicitly asked to build it.
- **No cross-repository database transaction.** Every prior phase in this engine (Phases 2–8) relies on unique constraints (`dedupeKey`, `idempotencyKey`) for at-least-once correctness rather than `prisma.$transaction`, since `NotificationService`/`QueueEngine` depend only on repository *interfaces* and have no access to a shared Prisma transaction client across them. `raiseEvent` follows the same precedent: the event insert and each job enqueue are independent idempotent steps, not one atomic unit. See "Known Limitations" below.
- **No business module, no worker activation, no `instrumentation.ts` change** — confirmed via `git diff --stat -- src/instrumentation.ts` (empty) and a grep sweep for Loan/Payroll/Attendance/Leave/SMS/WhatsApp/Push/Google Drive/PDF/Notification Center — none appear outside this report's own prose and pre-existing enum values.

## Tests Executed

Clean rebuild, stable across 2 consecutive runs:

```
tests 431   suites 103   pass 431   fail 0
```

20 new tests in `notification.service.test.ts`, covering: orchestration flow (event+job creation, field mapping into `queueEngine.enqueue`, dedupeKey/sourceDomain derivation and override), deduplication (repeat call with the same key, auto-derived-key collapse, concurrent-insert race), idempotency (duplicate recipients within one call), scheduling (`scheduledAt` reaches `nextAttemptAt`; a `FixedClock` sanity check), validation (empty `eventType`, empty `recipients`, invalid channel, empty address, over-length `eventType`, explicit `null` payload), failure propagation (a generic repository failure surfaces unchanged; a mid-fan-out queue-engine failure surfaces after partially enqueuing), and the read-only passthroughs. All 411 pre-existing tests remain green, unmodified.

## Coverage

Every numbered IMPLEMENT item is covered by at least one test: `raiseEvent()` (orchestration-flow suite), event validation (validation suite), recipient resolution/validation (validation suite — structural checks on `recipients`), event creation (orchestration-flow suite), job creation (orchestration-flow + idempotency suites), deduplication (dedup suite), idempotency (idempotency suite), queue insertion (orchestration-flow suite, asserts exact `enqueue` call shape), scheduling support (scheduling suite), event persistence (dedup suite, via `findByDedupeKey` on a second call), and the public service methods (all suites, plus the passthrough suite for the read-only methods).

## Performance

`raiseEvent` performs exactly: 1 structural validation pass (in-memory, O(recipients)), 1 `findByDedupeKey` read, at most 1 `create` write, and exactly `recipients.length` calls to `queueEngine.enqueue` (each already-analyzed as O(1) relative to queue depth in prior phases' reports). No loops over unrelated data, no N+1 queries beyond the intentional one-enqueue-per-recipient fan-out the design itself requires.

## Memory

No new long-lived state. `NotificationService` holds only the constructor-injected repository/engine references it already held (plus one more: `queueEngine`) — no caches, no maps, no per-call state retained across invocations.

## Known Limitations

- **`NotificationPreference` opt-outs are not enforced** (see "Scope Boundary" above) — every supplied recipient always gets a job, regardless of any future preference the recipient might set.
- **No cross-repository transaction** between the `NotificationEvent` insert and its jobs' `NotificationJob` inserts — a crash between the two would leave an event with zero jobs. This mirrors the same at-least-once, no-`$transaction` posture every prior phase in this engine already carries (see Design §18's own acknowledged SMTP-duplicate-on-crash gap), not a new gap this phase introduces.
- **Recipients must be supplied by the caller** (see "Design Decisions" above) — there is no `eventType → recipient` mapping table yet; that remains for a future, business-module-aware phase.

## Technical Debt

None introduced. The two design decisions above are documented trade-offs required to keep business logic out of `NotificationService`, not shortcuts.

## Breaking Changes

**None** to any previously-completed phase's public API (`QueueEngine`, `WorkerRuntime`, `TemplateEngine`, `DeliveryManager`, SMTP provider registration are all untouched). `NotificationService`'s constructor gained one new required parameter (`queueEngine`) — the only existing caller, `container.ts`, is updated; `raiseEvent`/`processJob`/`resendJob` were never implemented before this phase (always throw-stubs), so there is no prior working behavior to break.

## Engineering Review Summary

- **Architecture**: `raiseEvent` is pure composition — `RaiseEventRequestValidator` and `NotificationEventValidator` for validation, `QueueEngine.enqueue` for fan-out + job-level idempotency, `notificationRepository` for event-level dedup. No new class beyond the two small, single-purpose additions (a DTO, a validator).
- **Backward compatibility**: Verified — all 411 pre-existing tests pass unmodified; the one constructor signature change is confined to `container.ts`, the only real caller.
- **SOLID**: `NotificationService` still depends only on interfaces (`INotificationRepository`, `INotificationJobRepository`, `IQueueEngine`, ...), never a concrete class — Dependency Inversion preserved. Single Responsibility: `raiseEvent` orchestrates; it does not validate business rules, render templates, or talk to a provider.
- **DRY**: Job-level idempotency logic is not duplicated — `QueueEngine.enqueue`'s existing `DuplicateJobError`-catch-and-return-existing behavior (Phase 3) is reused as-is. The event-level dedupe-conflict detection deliberately does **not** generalize `IdempotencyGuard` (a Phase 3, single-purpose, already-frozen file) for a single new call site — a local, near-identical check was judged simpler and lower-risk than modifying a passing phase's file for one caller.
- **Dependency Injection**: `queueEngine` is injected via the constructor like every other dependency; `container.ts` wires the real instance, tests inject a fake.
- **Performance/Memory**: See above — O(recipients) work per call, no new persistent state.
- **Error handling**: Validation failures raise the existing `ValidationError`; repository/queue failures propagate unchanged (no swallowing) except for the one deliberate case (a detected dedupe-key race), which is indistinguishable from a synchronous dedupe hit by design.
- **Maintainability**: The two disclosed design decisions are documented in this report and in the source's own doc comments, not left implicit.
- **Public API simplicity**: Five fields beyond `eventType`/`payload`, all optional except `recipients`; zero engine-internal types (channels are the only enum a caller touches, and channel is already meaningful to a business module — "send this by email").
- **Future extensibility**: A future phase adding real business modules can layer an internal `eventType → recipients` resolver *in front of* today's API (e.g., a new `raiseDomainEvent()` convenience wrapper that looks up recipients and calls `raiseEvent()`) without changing `raiseEvent`'s signature or any of its current callers.

## Design Review — Answers

1. **Is `NotificationService` still the correct public entry point?** Yes — it is the only class business modules will ever import from this engine, and every dependency (`QueueEngine`, repositories) stays behind it.
2. **Is the public API as small as possible?** `raiseEvent(request)` is the only orchestration method a caller needs; `getEventById`/`getJobById`/etc. are pre-existing read-only conveniences, not new surface. `recipients` is the one field beyond the phase's own illustrative example that could not be removed without either violating "no business logic in `NotificationService`" or leaving the method unable to create any jobs at all (see "Design Decisions").
3. **Can future business modules use the service without knowing anything about the notification engine?** Yes for delivery/queue/retry/template internals — a caller never sees `QueueEngine`, `WorkerRuntime`, `TemplateEngine`, `DeliveryManager`, providers, or retry state. A caller does need to know its own recipients and channels, which is domain knowledge it already has, not engine knowledge.
4. **Did this phase introduce any unnecessary abstraction?** No new class hierarchy, no new architectural layer. The two new files (a DTO, a validator) follow the exact one-per-shape convention every other DTO/validator in this module already uses — not a new pattern.
5. **Would anything change if starting again today?** The `dedupeKey` auto-derivation hash could instead be delegated to a small dedicated value object (mirroring `DedupeKey`/`IdempotencyKey`) if a second call site for it ever appears; with exactly one call site today, inlining it in `notification.service.ts` was judged simpler per this phase's own "did this introduce unnecessary abstraction?" check.

## Current Project Status

| Phase | Status |
|---|---|
| 0 — Design | Complete |
| 1 — Database Foundation | Complete |
| 1.5 — Migration Recovery | Complete |
| 2 — Core Infrastructure | Complete |
| 3 — Queue Engine | Complete |
| 4 — Worker Runtime | Complete |
| 5 — Template Engine | Complete |
| 6 — Delivery Framework | Complete |
| 7 — SMTP Delivery Provider | Complete |
| 8 — Engine Integration | Complete |
| **9 — Notification API & Orchestration** | **Complete** |
| 10+ — Business module integration, worker activation | Not started |

431/431 tests passing project-wide. `tsc --noEmit` and `eslint` both clean across the entire repository.

## Next Recommended Phase

`raiseEvent()` is now a real, tested orchestration entry point, but nothing in the live application calls it yet, and the worker it feeds is still never started. The next phase is deliberately still not this one's job: pick one real business event (e.g. loan approval), have that domain's `actions.ts` call `notificationService.raiseEvent(...)` with its own recipients, and decide how/where `workerRuntime.start()` is invoked in production (`instrumentation.ts` or otherwise) — both explicit STOP conditions here and still open for a future, explicitly-scoped phase.
