# Notification Delivery Framework Report (Phase 6)

This phase implements the **abstraction layer responsible for delivering already-rendered notifications** — provider registration, resolution, selection, health tracking, metrics, and priority-based failover. It implements **zero real providers**: no SMTP, no Nodemailer, no SMS/WhatsApp/Push/Firebase/Twilio client of any kind exists anywhere in this module. Every provider used in this phase's own tests is an in-memory fake.

## Architecture Compliance

Matches `NotificationEngineDesign.md`'s SMTP-failover architecture (§9/§10) at the abstraction level the design describes, without implementing the SMTP client itself (explicitly out of scope, per this phase's STOP conditions). All 15 requested units exist, each with a single, distinct responsibility:

| # | Unit | Responsibility |
|---|------|-----------------|
| 1 | `DeliveryManager` | Public facade — the one entry point a future dispatch pipeline calls |
| 2 | `ProviderRegistry` | Holds every registered `DeliveryProvider`, multiple per channel, sorted by priority |
| 3 | `ProviderResolver` | Filters registered providers down to those active + healthy + capability-matching |
| 4 | `ProviderSelector` | Pluggable "which one do we try next" policy (today: priority order) |
| 5 | `ProviderCapabilities` | Value object — HTML email, attachments, inline images, bulk send, scheduling, tracking |
| 6 | `ProviderHealthMonitor` | Passive HEALTHY/DEGRADED/OFFLINE/MAINTENANCE/UNKNOWN tracking, no external polling |
| 7 | `ProviderPriority` | Value object wrapping `NotificationProvider.priority` ("lower = tried first") |
| 8 | `ProviderContext` | Passed into `DeliveryProvider.deliver()` — per-attempt provider identity/routing data |
| 9 | `ProviderResult` | Outcome of one provider call — SUCCESS / TEMPORARY_FAILURE / PERMANENT_FAILURE |
| 10 | `ProviderMetricsCollector` | Per-provider Requests/Success/Failure/Retry/Latency counters |
| 11 | `DeliveryPolicy` | Retry/timeout/rate-limit/max-size/max-recipients data — structural only, no enforcement |
| 12 | `DeliveryStrategy` | Pluggable outer failover/looping policy (today: `FailoverDeliveryStrategy`) |
| 13 | `DeliveryAttemptContext` | Per-delivery-request bookkeeping across however many providers get tried |
| 14 | `DeliveryExceptionMapper` | Normalizes a thrown error into a `ProviderResult` |
| 15 | `ProviderLifecycle` | Optional `initialize`/`shutdown`/`healthCheck`/`validateConfiguration` hooks |

This module is entirely additive and self-contained under `src/lib/services/notification-engine/delivery/`. It does not modify, replace, or bypass Phase 2's `ChannelAdapterFactory`/`NotificationChannelAdapter` (still the frozen contract `JobDispatcher` uses) or Phase 4's `WorkerRuntime`/`NotificationWorker` (unmodified, unchanged behavior — see "Worker Integration" below).

## Files Created

42 new files under `src/lib/services/notification-engine/delivery/` (28 source, 14 test):

**Types** (`types/`): `provider-health-state.ts` (+ `.test.ts`), `provider-result.ts` (+ `.test.ts`), `provider-descriptor.ts`, `registered-provider.ts`, `delivery-outcome.ts`, `delivery-options.ts`, `index.ts`

**Value objects** (`value-objects/`): `provider-priority.ts` (+ `.test.ts`), `provider-capabilities.ts` (+ `.test.ts`), `index.ts`

**Provider contracts** (`provider/`): `provider-lifecycle.interface.ts`, `delivery-provider.interface.ts`, `provider-context.ts`, `index.ts`

**Errors** (`errors/`): `provider-unavailable.error.ts`, `index.ts`

**Core** (`delivery/` root): `provider-registry.ts` (+ `.test.ts`), `provider-health-monitor.ts` (+ `.test.ts`), `provider-metrics.ts` (+ `.test.ts`), `provider-resolver.ts` (+ `.test.ts`), `provider-selector.ts` (+ `.test.ts`), `delivery-policy.ts` (+ `.test.ts`), `delivery-attempt-context.ts` (+ `.test.ts`), `delivery-exception-mapper.ts` (+ `.test.ts`), `delivery-strategy.ts` (+ `.test.ts`), `delivery-manager.ts` (+ `.test.ts`), `index.ts`

**Test fakes** (`test-fakes/`, never exported from the module barrel): `fake-delivery-provider.ts`, `fake-notification-provider.repository.ts`, `fake-job.ts`

## Files Modified (Cross-Phase Changes)

All additive — no existing line was deleted or behaviorally changed:

- `src/lib/services/notification-engine/container.ts` — added `ProviderRegistry`/`ProviderHealthMonitor`/`ProviderMetricsCollector`/`ProviderResolver`/`DeliveryManager` construction and returned them from `createNotificationEngineContainer()`. The registry is constructed empty — nothing registers a provider into it.
- `src/lib/services/notification-engine/index.ts` — added `export * from "./delivery";`.
- `src/lib/services/notification.service.ts` — added `export { DeliveryManager }` and `export const deliveryManager = notificationEngineContainer.deliveryManager;`, plus a doc comment explaining the phase.
- `tsconfig.test.json` — added `src/lib/services/notification-engine/delivery/**/*.ts` to `include`.
- `package.json` — extended the `test` script with three explicit globs (`delivery/*.test.js`, `delivery/types/*.test.js`, `delivery/value-objects/*.test.js` — `node --test` does not recurse through a bare `**` glob the way a shell with `globstar` would, so each test-bearing subdirectory is listed explicitly, consistent with this project's existing convention of never pointing `node --test` at a bare directory).

**Zero new repository methods.** `INotificationProviderRepository` (Phase 2) already exposed everything `providerDescriptorFromDTO()` needs (`id`, `name`, `channel`, `priority`, `isActive`) — the second phase in a row (after Phase 5) to need no repository changes at all.

## Tests Executed

`npm run test` (clean rebuild: `.test-build` and `tsconfig.test.tsbuildinfo` deleted first, then `tsc -p tsconfig.test.json && node --test ...`):

```
tests 344
suites 77
pass 344
fail 0
```

88 of those 344 tests (18 suites) belong to this phase's 14 new test files. All existing Phase 3/4/5 tests (256 total) remain green, unmodified, and unaffected. Verified stable across 2 consecutive clean runs.

Per this phase's explicit instruction, every test uses **mocked providers and a mocked repository — no database, no network**:
- `FakeDeliveryProvider` — configurable (`success` / `temporary-failure` / `permanent-failure` / `throw`), records every call for assertions, implements every `ProviderLifecycle` hook so `ProviderRegistry.initializeAll()/shutdownAll()` can be exercised.
- `FakeNotificationProviderRepository` — in-memory implementation of Phase 2's `INotificationProviderRepository`, used only to test `providerDescriptorFromDTO()`.

## Coverage

Every one of the 15 named units has its own dedicated test file (or a shared one for the two smallest, `ProviderResults`/`isProviderHealthUsable`, which are pure helper functions). Notable scenarios covered:
- Priority-ordered failover across 2+ providers (temporary failure → next candidate tried)
- Immediate stop on `PERMANENT_FAILURE` (no further candidates tried)
- `NO_PROVIDER_AVAILABLE` when nothing is registered / everything is filtered out
- Capability-based filtering (`requiredCapabilities`)
- A provider that **throws** is caught, mapped, and does not crash the delivery
- Health degrades DEGRADED → OFFLINE after the configured consecutive-failure threshold, and a subsequent delivery correctly skips the now-OFFLINE provider
- A `PERMANENT_FAILURE` does **not** penalize provider health (business failure ≠ infrastructure failure)
- `MAINTENANCE` is a sticky manual override that `recordSuccess`/`recordFailure` cannot clear
- `ProviderMetricsCollector`'s retry counter only increments from the 2nd attempt onward within one delivery
- `ProviderRegistry.initializeAll()/shutdownAll()` correctly no-op for providers implementing no lifecycle hooks

## Performance Notes

Every operation in this module is O(1) or O(n) in the number of *registered providers per channel* (expected to be single digits — "EMAIL: SMTP-A, SMTP-B, SMTP-C" is the phase's own example). `ProviderRegistry.register()` re-sorts one channel's list on every registration (O(n log n)), acceptable since registration happens at bootstrap/config-reload time, never per-delivery. No unbounded in-memory growth: `ProviderHealthMonitor`/`ProviderMetricsCollector` hold exactly one record per distinct `providerId` ever seen (bounded by the number of providers ever registered, not by delivery volume).

## Known Limitations

- **`DeliveryPolicy` is structural only.** `maxRetries`/`timeoutMs`/`rateLimit`/`maxSizeBytes`/`maxRecipients` are validated shapes, not enforced behavior — no timeout race, no token-bucket limiter, no payload-size check exists yet. Explicitly in scope for a future phase (this phase's own instruction: "No enforcement yet. Architecture only.").
- **`ProviderResult` and Phase 2's `ChannelDeliveryOutcome` are two separate shapes.** `ChannelDeliveryOutcome` (SUCCESS/FAILURE, backed by the `AttemptOutcome` DB enum) is what `JobDispatcher` already persists via `QueueEngine`; `ProviderResult` (SUCCESS/TEMPORARY_FAILURE/PERMANENT_FAILURE) is this framework's own richer internal type. A future integration phase will need to decide how (or whether) to reconcile them.
- **`ProviderHealthState`'s 5 values are richer than the DB's 3-value `NotificationProviderHealthStatus` enum.** `toDbHealthStatus()`/`fromDbHealthStatus()` exist for a lossy mapping (MAINTENANCE→DOWN, UNKNOWN→HEALTHY) but nothing in this phase persists runtime health back to the `NotificationProvider` row yet.
- **No rate limiting, no circuit-breaker cooldown timer.** `ProviderHealthMonitor` marks a provider OFFLINE after N consecutive failures, but nothing automatically re-tries it later to see if it recovered (no half-open state, no timed recovery) — a future phase's job.

## Technical Debt

None introduced knowingly. The module has no TODOs, no commented-out code, and no placeholder methods beyond what the phase explicitly asked to leave as "architecture only" (documented above, not hidden).

## Breaking Changes

**None.** Every change to a pre-existing file is a pure addition (new export, new constructor call, new test glob). `JobDispatcher`, `NotificationWorker`, `WorkerRuntime`, `ChannelAdapterFactory`, and every Phase 2–5 public API are byte-for-byte unchanged in behavior.

## Public API

```ts
class DeliveryManager {
  constructor(
    resolver: ProviderResolver,
    healthMonitor: ProviderHealthMonitor,
    metrics: ProviderMetricsCollector,
    strategy?: DeliveryStrategy,          // default: FailoverDeliveryStrategy
    defaultPolicy?: DeliveryPolicy,       // default: DeliveryPolicy.default()
    clock?: IClock,
    logger?: IQueueLogger
  );
  deliver(
    job: NotificationJobDTO,
    content: RenderedNotificationContent,
    options?: { requiredCapabilities?: RequiredProviderCapabilities; policy?: DeliveryPolicy; correlationId?: string }
  ): Promise<DeliveryOutcome>;
}

class ProviderRegistry {
  register(descriptor: ProviderDescriptor, provider: DeliveryProvider): void;
  unregister(providerId: string): void;
  getByChannel(channel: NotificationChannel): RegisteredProvider[];
  getById(providerId: string): RegisteredProvider | undefined;
  list(): RegisteredProvider[];
  initializeAll(): Promise<void>;
  shutdownAll(): Promise<void>;
}

interface DeliveryProvider {
  deliver(job: NotificationJobDTO, content: RenderedNotificationContent, context: ProviderContext): Promise<ProviderResult>;
  initialize?(): Promise<void>;
  shutdown?(): Promise<void>;
  healthCheck?(): Promise<ProviderHealthState>;
  validateConfiguration?(): Promise<ConfigValidationResult>;
}

function providerDescriptorFromDTO(dto: NotificationProviderDTO, capabilities?: ProviderCapabilities): ProviderDescriptor;
```

Also exported: `ProviderResolver`, `ProviderSelector` (+ `SelectionStrategy`, `PriorityHealthSelectionStrategy`), `ProviderHealthMonitor`, `ProviderMetricsCollector`, `DeliveryPolicy`, `DeliveryAttemptContext`, `DeliveryExceptionMapper`, `FailoverDeliveryStrategy` (+ `DeliveryStrategy`), `ProviderPriority`, `ProviderCapabilities`, `ProviderContext`, `ProviderResults`, `DeliveryOutcome`, `ProviderUnavailableError`.

## Worker Integration

**Deliberately not wired in this phase.** `JobDispatcher` still resolves a `NotificationChannelAdapter` via `ChannelAdapterFactory` exactly as it did after Phase 4 — `NotificationWorker`/`WorkerRuntime` are untouched, and their existing, frozen test suites (all 256 pre-existing tests) pass unmodified. This phase's own instruction permitted rewiring "if required," but not modifying `WorkerRuntime`'s *behavior* was the harder constraint, and there is no behavior this phase needs from the worker that `ChannelAdapterFactory` doesn't already provide (it still only registers `StubChannelAdapter`s). Rewiring the dispatch pipeline to go through `DeliveryManager` instead is better done as its own deliberate integration phase, once a real provider actually exists to make the extra failover/health/metrics machinery worth activating.

## Anything Intentionally Postponed

- Rate limiting, timeout enforcement, and payload-size/recipient-count enforcement (`DeliveryPolicy` fields exist, nothing reads them to act).
- Persisting `ProviderHealthState`/`ProviderMetricsSnapshot` back to the database (`NotificationProvider.healthStatus`/`consecutiveFailures`/`lastFailureAt` columns already exist from Phase 1 but nothing in this phase writes to them — `updateHealth()` on the repository is unused by this module).
- A half-open/automatic-recovery health state (an OFFLINE provider stays OFFLINE until a manual `setState` call).
- Any real provider implementation (SMTP, SMS, WhatsApp, Push, In-App) — explicitly forbidden this phase.
- Wiring `DeliveryManager` into `JobDispatcher`/`NotificationWorker` — explicitly deferred, see "Worker Integration" above.

## Engineering Review Summary

- **Architecture / SOLID**: Each of the 15 units has one responsibility (see the table above). Dependency Inversion throughout — `DeliveryManager` depends on `ProviderResolver`/`ProviderHealthMonitor`/`ProviderMetricsCollector`/`DeliveryStrategy` (all injected, all interfaces or swappable classes), never a concrete provider. Open/Closed: a new `SelectionStrategy` or `DeliveryStrategy` implementation plugs in without modifying `ProviderSelector`, `ProviderResolver`, or `DeliveryManager`.
- **DRY**: `ProviderSelector`'s own default (`PriorityHealthSelectionStrategy`) is defined in exactly one place; `FailoverDeliveryStrategy` relies on that default rather than re-specifying it. `ProviderPriority`/`ProviderCapabilities` follow the exact value-object style already established by Phase 2 (`value-objects/idempotency-key.ts`) instead of inventing a new convention.
- **KISS**: `DeliveryPolicy` deliberately does *nothing* beyond structural validation — no half-built rate limiter, no timer that's never armed. `ProviderHealthMonitor`'s transition rule is one `if` (below threshold → DEGRADED, at/above → OFFLINE), not a configurable state-machine framework.
- **Performance / Memory**: See "Performance Notes" — all operations scale with provider count, not delivery volume; no unbounded collections.
- **Thread safety**: Node.js is single-threaded; there is no true data race. The `Map`-based registries/counters are safe under Node's cooperative concurrency (no `await` occurs mid-mutation inside any single method), so two concurrent `deliver()` calls interleave only at `await` points, never mid-write.
- **Extensibility**: New channels/providers register via `ProviderRegistry.register()` with zero changes to this module. New selection or failover policies implement `SelectionStrategy`/`DeliveryStrategy` respectively.
- **Security**: `DeliveryExceptionMapper` never re-throws or logs a raw stack trace to a caller-facing result — only `.message`. No provider credential handling exists in this module (`configEncrypted` stays exactly where Phase 1/2 already keeps it, opaque to this framework). No `eval`, no dynamic `require`, no unvalidated dynamic property access.
- **Public API quality**: Exactly the 8-shape surface implied by the phase's own class list, re-exported once from `delivery/index.ts`; test-fakes are never exported from the module barrel (mirrors Phase 5's `test-fakes/` precedent).
- **Backward compatibility / Breaking changes**: None — see above.
- **Future maintainability**: A future SMTP phase needs to write exactly one class (`SmtpDeliveryProvider implements DeliveryProvider`) and one line (`providerRegistry.register(descriptor, new SmtpDeliveryProvider(...))`) in the container — nothing else in this module changes.

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
| **6 — Delivery Framework** | **Complete** |
| 7+ — Real SMTP Provider / Worker Integration | Not started |

344/344 tests passing project-wide. `tsc --noEmit` and `eslint` both clean across the entire repository, not just this module.

## Next Recommended Phase

A real **SMTP Provider** implementing `DeliveryProvider` (reusing `src/lib/services/email.service.ts`'s existing SMTP config resolution/transporter pattern per `EMAIL_SECRET_KEY`), registered into `ProviderRegistry` for the `EMAIL` channel — the first phase where this framework and `TemplateEngine` (Phase 5) would both get their first real consumer. Wiring `JobDispatcher`/`NotificationWorker` to call `DeliveryManager` instead of `ChannelAdapterFactory` directly would naturally follow once that first real provider exists.
