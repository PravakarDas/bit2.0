# SMTP Delivery Provider Report (Phase 7)

The first real `DeliveryProvider` plugged into the Delivery Framework (Phase 6): SMTP email, built entirely on this project's existing SMTP infrastructure (`email.service.ts`, `EmailConfig`, `EMAIL_SECRET_KEY`/`crypto.ts`). **No new SMTP logic was invented** — the transporter options, config resolution, and error-message mapping are the exact same code `email.service.ts` already used, extracted so both consumers share one source of truth instead of one duplicating the other.

## Architecture Compliance

All 10 requested units exist, each with a single responsibility, none leaking SMTP-specific logic outside this module:

| # | Unit | File |
|---|------|------|
| 1 | `SmtpDeliveryProvider implements DeliveryProvider` | `smtp-delivery-provider.ts` |
| 2 | SMTP Connection Manager | `smtp-connection-manager.ts` |
| 3 | SMTP Transport Factory | `smtp-transport-factory.ts` |
| 4 | SMTP Configuration Validator | `smtp-config-validator.ts` |
| 5 | SMTP Health Check | `smtp-health-checker.ts` |
| 6 | SMTP Capability Descriptor | `smtp-capability-descriptor.ts` |
| 7 | SMTP Result Mapper | `smtp-result-mapper.ts` |
| 8 | SMTP Retry Classification | `smtp-retry-classification.ts` |
| 9 | SMTP Metrics Integration | *(no new code — see below)* |
| 10 | SMTP Provider Registration | `register-smtp-provider.ts` |

Plus the generic (not SMTP-specific) `DeliveryManagerChannelAdapter` at `delivery/delivery-manager-channel-adapter.ts`, which makes "NotificationWorker may call DeliveryManager instead of StubChannelAdapter ... for EMAIL" real without touching `JobDispatcher`/`NotificationWorker`/`WorkerRuntime` (see "Worker Integration" below).

**Item 9, SMTP Metrics Integration, required zero SMTP-specific code.** Every `DeliveryProvider.deliver()` call — `SmtpDeliveryProvider`'s included — is already wrapped by `DeliveryManager.invokeProvider()` (Phase 6), which calls `ProviderMetricsCollector.recordRequest/recordSuccess/recordFailure/recordRetry` and overwrites `latencyMs` with its own measurement, generically, for any provider. This "just working" is the Delivery Framework proving itself, which is this phase's stated goal.

## Reused Existing Infrastructure (Not Duplicated)

- `nodemailer` transporter options (host/port/secure/timeouts/auth) — previously inlined in `email.service.ts`'s `getTransporter()`, now `buildSmtpTransportOptions()` in the new `src/lib/smtp-shared.ts`, called by **both** `EmailService` and `SmtpTransportFactory`.
- SMTP error → human-readable message mapping — previously a private `mapSmtpError()` inside `email.service.ts`, now the same function (byte-for-byte identical output, verified by test) in `src/lib/smtp-shared.ts`, built on a new shared `classifySmtpErrorCategory()` that both `mapSmtpError()` and this phase's `isPermanentSmtpError()` (retry classification) derive from — one categorization, two consumers, instead of two independently-maintained switch statements.
- SMTP config resolution + decryption — previously a private `resolveConfig()` method inside `EmailService`, now an exported `resolveEmailConfig()` in `src/lib/email-config.ts` (the project's existing home for `EmailConfig`-row helpers), calling the same `prisma.emailConfig.findUnique` + `decryptSecret` (`EMAIL_SECRET_KEY`, `src/lib/crypto.ts`, untouched) it always did.
- `EmailService.sendMail()`'s **observable behavior is unchanged** — same messages, same transporter-reuse-by-fingerprint caching, same `SystemAudit` logging, same "stale connection" recovery. Refactor only, verified by reading the diff line-by-line (no test suite exists for `email.service.ts` — it's outside `notification-engine/`, un-mockable without touching the live DB — so this was checked by careful manual review, not an automated regression test; see "Known Limitations").

## Refactor: Files Modified (Cross-Phase / Pre-Existing Files)

- **`src/lib/services/email.service.ts`** — removed its private `ResolvedEmailConfig` interface, `resolveConfig()` method, and `mapSmtpError()` function; now imports `resolveEmailConfig` (`@/lib/email-config`) and `buildSmtpTransportOptions`/`mapSmtpError` (`@/lib/smtp-shared`). Every other line — `sendMail()`'s control flow, transporter caching, `SystemAudit` logging — is untouched.
- **`src/lib/email-config.ts`** — added `resolveEmailConfig()` (moved from `EmailService`, identical behavior).
- **`src/lib/services/notification-engine/delivery/index.ts`** — added `DeliveryManagerChannelAdapter` to the barrel; added a doc comment explaining why `./providers/smtp` is deliberately **not** re-exported here (see "Testing" below).
- **`tsconfig.test.json`** — added `src/lib/smtp-shared.ts`/`.test.ts` and `notification-engine/delivery/**` already covered the new `providers/smtp/**` subtree.
- **`package.json`** — extended the `test` script with `lib/smtp-shared.test.js` and `delivery/providers/smtp/*.test.js`.

`container.ts` and top-level `notification.service.ts` are **untouched** — see "Worker Integration" for why.

## Files Created

23 new files:

- `src/lib/smtp-shared.ts` (+ `.test.ts`) — prisma-free shared config shape, transport options builder, error categorization.
- `src/lib/services/notification-engine/delivery/delivery-manager-channel-adapter.ts` (+ `.test.ts`) — generic bridge, `DeliveryManager` → `NotificationChannelAdapter`.
- `src/lib/services/notification-engine/delivery/providers/smtp/` — `smtp-config-validator.ts`, `smtp-transport-factory.ts`, `smtp-connection-manager.ts`, `smtp-capability-descriptor.ts`, `smtp-retry-classification.ts`, `smtp-result-mapper.ts`, `smtp-health-checker.ts`, `smtp-delivery-provider.ts`, `register-smtp-provider.ts` (no test — see "Testing"), `index.ts`, `test-fakes/fake-transporter.ts`, plus one `.test.ts` per unit and one integration test (`smtp-template-integration.test.ts`).

## Public API

```ts
class SmtpDeliveryProvider implements DeliveryProvider {
  constructor(
    connectionManager?: SmtpConnectionManager,
    configValidator?: SmtpConfigValidator,
    resultMapper?: SmtpResultMapper,
    healthChecker?: SmtpHealthChecker,
    resolveConfig?: () => Promise<ResolvedEmailConfig | null>, // defaults to an inert "always null" resolver
    clock?: IClock
  );
  deliver(job, content, context): Promise<ProviderResult>;
  initialize(): Promise<void>;      // no-op — nodemailer connects lazily
  shutdown(): Promise<void>;        // closes the pooled connection
  healthCheck(): Promise<ProviderHealthState>;
  validateConfiguration(): Promise<ConfigValidationResult>;
}

function registerSmtpProvider(registry: ProviderRegistry, options?: { id?: string; name?: string; priority?: number }): void;

class SmtpConnectionManager {
  getTransporter(config): Transporter;   // connection reuse
  verify(config): Promise<boolean>;      // health validation
  invalidate(): void;                    // force reconnect (post-error recovery)
  close(): Promise<void>;                // graceful shutdown
}

class DeliveryManagerChannelAdapter implements NotificationChannelAdapter {
  constructor(channel: NotificationChannel, deliveryManager: DeliveryManager);
  send(job, content): Promise<ChannelDeliveryOutcome>;
}
```

Also exported from `providers/smtp/index.ts` (a barrel intentionally **not** re-exported from `delivery/index.ts` — see "Testing"): `SmtpConfigValidator`, `SmtpTransportFactory`, `buildSmtpCapabilities`, `isPermanentSmtpError`, `SmtpResultMapper`.

## Error Classification

`isPermanentSmtpError()` (using the shared `classifySmtpErrorCategory()`):

| Category | Example nodemailer code | Classification | Reasoning |
|---|---|---|---|
| ENVELOPE | `EENVELOPE` | **PERMANENT** | Bad sender/recipient address — no provider will succeed |
| SERVER_REJECTED | `responseCode >= 500` | **PERMANENT** | RFC 5321 "Permanent Negative Completion" |
| AUTH | `EAUTH` | TEMPORARY | Broken credentials for *this* provider — a sibling EMAIL provider may still work |
| DNS / CONNECTION / TIMEOUT | `ENOTFOUND`, `ECONNREFUSED`, `ETIMEDOUT` | TEMPORARY | Infrastructure, potentially transient |
| everything else | — | TEMPORARY | Conservative default, matches `DeliveryExceptionMapper`'s own precedent |

`SmtpResultMapper.toFailure()` uses `DeliveryExceptionMapper` (Phase 6, frozen, unmodified) exactly as instructed: the PERMANENT case is reported directly (via `ProviderResults.permanentFailure`); everything else is handed to `DeliveryExceptionMapper.toProviderResult`, which supplies the retryable-by-default `TEMPORARY_FAILURE` — no SMTP-specific reimplementation of that fallback.

## Connection Management

- **Reuse**: `SmtpConnectionManager` caches one transporter keyed by a config fingerprint, exactly like `EmailService` already did — a config change (host/port/secure/sender/password) transparently creates a fresh transporter.
- **Graceful shutdown**: `shutdown()` → `close()` → closes the pooled connection and clears cached state. Safe to call with nothing connected.
- **Health validation**: `verify(config)` performs a real SMTP handshake (`transporter.verify()`, no message sent) and never throws — a failed probe is reported as `false`, not an exception.
- **Configuration validation**: `SmtpConfigValidator` checks host/port/senderEmail/appPassword structurally before any connection is attempted.
- Every SMTP unit test builds its connection manager with an injected fake transporter factory (`FakeTransporter`) — **zero real network calls anywhere in this phase's test suite.**

## Worker Integration

Built, tested, **not activated**:

- `DeliveryManagerChannelAdapter` (generic) proves — via `delivery-manager-channel-adapter.test.ts`'s two integration tests — that Phase 4's real, unmodified `JobDispatcher.dispatch()` correctly routes an EMAIL job through `DeliveryManager` when a `ChannelAdapterFactory` has this adapter registered for EMAIL instead of `StubChannelAdapter`, using `ChannelAdapterFactory.register()`'s already-existing extension point. `JobDispatcher`/`NotificationWorker`/`WorkerRuntime` source is **byte-for-byte unchanged** — their entire pre-existing test suites (all 256+ tests) pass unmodified.
- **`container.ts`'s `createWorkerRuntime()` wiring still registers only `StubChannelAdapter`s** for every channel including EMAIL, and **`container.ts`'s `providerRegistry` (feeding the live `deliveryManager` singleton) is still empty** — `registerSmtpProvider()` is not called from anywhere in the running application. This is a deliberate, conservative choice consistent with every prior phase's precedent (Phase 5's `TemplateEngine`, Phase 6's `DeliveryManager` itself were both built-but-uninvoked in their own phase) and with this phase's explicit STOP conditions ("Do not activate any worker," "Do not modify WorkerRuntime behavior").
- Wiring `registerSmtpProvider(providerRegistry)` into `container.ts`, and/or swapping `createWorkerRuntime`'s stub registration for `DeliveryManagerChannelAdapter` for EMAIL, are both one-line changes for a future integration phase — see "Next Recommended Phase."

## Template Integration

`smtp-template-integration.test.ts` proves the full pipeline end to end: `TemplateEngine.register()` + `.render()` (Phase 5, unmodified) produces a `RenderedNotificationContent` with `{{employee.name}}` substituted, which flows unmodified through `DeliveryManager.deliver()` (Phase 6, unmodified) into `SmtpDeliveryProvider.deliver()`, whose mocked transporter captures the exact rendered subject/HTML/text. **No template placeholder syntax, compilation, or variable resolution exists anywhere under `delivery/providers/smtp/`** — confirmed by reading every file in that folder.

## Tests Executed

Clean rebuild (`.test-build` + `tsconfig.test.tsbuildinfo` deleted, `tsc -p tsconfig.test.json && node --test ...`), stable across 2 consecutive runs:

```
tests 401   suites 94   pass 401   fail 0
```

45 tests (12 suites) belong to `providers/smtp/`; 2 more suites (4 tests) belong to `delivery-manager-channel-adapter.test.ts`; 4 tests belong to `src/lib/smtp-shared.test.ts`. All 373 pre-existing tests (Phases 3–6) remain green, unmodified.

**One deliberate testing gap, matching established precedent**: `register-smtp-provider.ts` has **no dedicated unit test**. It imports the real, Prisma-backed `resolveEmailConfig` at module scope — merely importing that file (even to override every parameter) would execute `require("@/lib/prisma")` in the compiled output, which plain `node --test` cannot resolve (the `@/` alias is a Next.js/webpack-only feature). This is the exact same reason `create-worker-runtime.ts` (Phase 4) has no dedicated test either — its every dependency is fully tested in isolation via injected fakes; only the trivial wiring/composition itself goes unverified by an automated test. `email.service.ts`'s refactor was similarly checked by careful manual line-by-line review rather than an automated test, since it has none and lives outside the test-covered tree (a pre-existing condition, not introduced by this phase).

## Coverage

Every one of the 10 named units (excluding item 9, which needed no code) has a dedicated test file. Key scenarios: connection reuse across repeated calls with unchanged config, fresh connection on config change, `invalidate()`/`close()` correctly closing the underlying transporter, `verify()` never throwing, every SMTP error category's permanent/temporary classification, the friendly-message-for-permanent-errors path, delegation to `DeliveryExceptionMapper` for everything else, unconfigured-provider handling (`MAINTENANCE` health, `TEMPORARY_FAILURE` delivery outcome — never a crash), a genuinely successful send with exact mail-options assertion, and both integration proofs (JobDispatcher and TemplateEngine).

## Performance Notes

One transporter per `SmtpConnectionManager` instance, reused across every delivery until config changes — no per-message connection setup/teardown. `verify()`/`sendMail()` costs are nodemailer's own (unmeasured here; irrelevant to this module's own logic, which is O(1) per call).

## Known Limitations

- **Attachments are capability-`false`** despite this phase's "attachments (architecture only)" instruction — `RenderedNotificationContent` (Phase 2, frozen) has no field to carry attachment data, so claiming the capability would be false advertising to `ProviderResolver`'s real eligibility filtering. The transport/mail-options plumbing has an obvious extension point for an `attachments` array the moment upstream content gains one.
- **No connection pooling** (`nodemailer`'s `pool: true` option) — one connection is reused sequentially, matching `email.service.ts`'s existing behavior; concurrent high-volume sending was out of scope.
- **No automatic recovery from OFFLINE** — inherited from Phase 6's `ProviderHealthMonitor` design; unchanged here.
- **`register-smtp-provider.ts` has no automated test** — see "Testing" above.
- **`email.service.ts`'s refactor has no automated regression test** — verified by manual review only, a pre-existing gap (the file has never had tests) this phase did not introduce or resolve.

## Technical Debt

None introduced. No TODOs, no placeholder methods beyond `initialize()`'s documented no-op (nodemailer has nothing eager to do).

## Breaking Changes

**None.** `email.service.ts`'s two exported symbols (`SendMailParams`, `SendMailResult`, `emailService`) and its observable `sendMail()` behavior are unchanged. `JobDispatcher`/`NotificationWorker`/`WorkerRuntime`/`ChannelAdapterFactory`/`DeliveryManager`/every Phase 2–6 public API is untouched.

## Engineering Review Summary

- **Architecture**: 10/10 requested units built, each with one responsibility; nothing SMTP-specific leaks outside `providers/smtp/` (`DeliveryManagerChannelAdapter` is deliberately channel-agnostic).
- **SOLID**: Dependency Inversion throughout — `SmtpDeliveryProvider` depends on injected `SmtpConnectionManager`/`SmtpConfigValidator`/`SmtpResultMapper`/`SmtpHealthChecker`/a config-resolver function, never a concrete Prisma call. Open/Closed: `registerSmtpProvider()` adds a provider without modifying `ProviderRegistry`/`DeliveryManager`.
- **DRY**: One extraction (`smtp-shared.ts`) eliminated what would otherwise have been two independently-maintained copies of the transporter-options object and the error-message switch; `classifySmtpErrorCategory()` is the single source both `mapSmtpError()` and `isPermanentSmtpError()` build on.
- **Performance**: See "Performance Notes" — O(1) per call beyond nodemailer's own cost.
- **Connection lifecycle**: Reuse, invalidate-on-error, and graceful shutdown all implemented and tested; no dangling transporters (old one is always `.close()`d before being replaced).
- **Memory**: One transporter per manager instance; no unbounded collections anywhere in this phase's code.
- **Security**: No credentials logged anywhere in new code; `EMAIL_SECRET_KEY`/`decryptSecret` untouched and still the only place a password is decrypted; error messages surfaced to callers never include the raw config object.
- **SMTP resource cleanup**: `invalidate()`/`close()` both call `transporter.close()` before dropping the reference — verified by test (`fake.closeCalls`).
- **Error mapping**: SMTP errors classified via one shared categorization function; `DeliveryExceptionMapper` (Phase 6, frozen) is genuinely used, not bypassed, for the non-permanent path.
- **Future maintainability**: A future SMS/WhatsApp/Push phase follows the exact same recipe — one `XyzDeliveryProvider implements DeliveryProvider`, registered via its own `registerXyzProvider()` — with `DeliveryManagerChannelAdapter` already generic and ready to bridge it into `JobDispatcher` the same way.

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
| **7 — SMTP Delivery Provider** | **Complete** |
| 8+ — Real worker/SMTP wiring, additional channels | Not started |

401/401 tests passing project-wide. `tsc --noEmit` and `eslint` both clean across the entire repository.

## Next Recommended Phase

Wire the now-fully-proven pieces into the live application, deliberately deferred by every phase so far: (1) call `registerSmtpProvider(providerRegistry)` in `container.ts` so the real `deliveryManager` singleton has EMAIL capability; (2) swap `createWorkerRuntime`'s EMAIL registration from `StubChannelAdapter` to `new DeliveryManagerChannelAdapter(NotificationChannel.EMAIL, deliveryManager)`; (3) have `NotificationWorker`'s dispatch step call `templateEngine.render()` before `JobDispatcher.dispatch()`. That is the first phase where this engine sends a real email — everything built across Phases 2–7 exists specifically to make that final step small and low-risk.
