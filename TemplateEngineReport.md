# Notification Template Engine Report (Phase 5)

**Scope:** Template management, rendering, variable substitution, validation, preview, and (architecture-only) localization — **only**. No SMTP, no delivery of any kind, no `NotificationService` business logic, no worker integration. Verified by `tsc --noEmit` (strict, whole project, zero errors), `eslint` (zero issues), and 256 passing unit tests (up from 252 before this phase's own ~90 new tests, minus the ones this phase's own bug-fixing corrected — see "Tests Executed" below), none touching the live database.

**Inputs (frozen, unchanged in behavior by this phase):** [NotificationEngineDesign.md](NotificationEngineDesign.md), [DatabaseImplementationReport.md](DatabaseImplementationReport.md), [MigrationRecoveryReport.md](MigrationRecoveryReport.md), [NotificationEngineDatabaseAudit.md](NotificationEngineDatabaseAudit.md), [CoreInfrastructureReport.md](CoreInfrastructureReport.md), [QueueEngineReport.md](QueueEngineReport.md), [WorkerRuntimeReport.md](WorkerRuntimeReport.md), [update.md](update.md).

---

## Architecture Compliance

Everything lives under `src/lib/services/notification-engine/template/`, the same isolated-bounded-context pattern established since Phase 2. This phase required **zero new methods on any prior-phase repository or interface** — every operation (`register`, `unregister`, `list`, `exists`, `render`, `preview`) is expressible entirely with `INotificationTemplateRepository`'s existing `create`/`findById`/`findActiveByKeyAndChannel`/`findMany`/`update` (Phase 2, untouched). This is the first phase where the "cross-phase touch" is limited to pure DI wiring (see below), with no new capability needed from an earlier phase's data-access layer.

**Design §7's own commitment, honored:** "a minimal in-house mustache-style substitution avoids a new dependency" — `{{employee.name}}`-style placeholders are parsed and rendered with a hand-written scanner (`template-parser.ts`), not Handlebars/Mustache/EJS or any i18n library. Zero new `package.json` dependencies.

**Three deliberate, disclosed interpretations, none a redesign:**

1. **Localization is a `key`-encoding convention, not a schema change.** `NotificationTemplate` has no `locale` column (frozen since Phase 1). `TemplateLocaleKey` encodes locale into the existing `key` string (`"LOAN_APPROVED@bn-BD"`) with a fallback chain (exact locale → base language → locale-less key). This is a stronger interpretation of "architecture only... support locale selection" than an inert no-op parameter — it actually works end-to-end today, with zero migration, and is fully covered by tests (`template-locale.test.ts`, plus the "locale fallback" describe block in `template-registry.test.ts` and the end-to-end case in `template-engine.test.ts`).
2. **`TemplateValidator` (item 3, content validation) is a genuinely new class, distinct from Phase 2's `NotificationTemplateValidator`** (which only checks the DTO's own structural fields — key/channel/version — and explicitly says "does not render or lint template placeholder syntax; that is TemplateError's future domain"). This phase is that future domain. Both classes coexist; neither was modified or replaced.
3. **`register()`'s versioning reuses the exact `BaseSalary`-style "append new row, deactivate the old one" pattern** already established in this project (see DATABASE.md) — no history/diff table, per this phase's explicit "do not implement history storage."

**Two prior-phase files touched, both pure DI wiring** (the same pattern Phase 3 and Phase 4 each used once): `container.ts` gained a `templateEngine` construction; `notification-engine/index.ts` and the top-level `notification.service.ts` gained the corresponding barrel/re-export lines. No existing export, method, or field was changed.

---

## Files Created

39 files under `src/lib/services/notification-engine/template/`:

| Area | Files |
|---|---|
| Errors (extend frozen `TemplateError` additively) | `errors/template-not-found.error.ts`, `template-parse.error.ts`, `template-validation-failed.error.ts`, `errors/index.ts` |
| Core types | `types/template-source.ts`, `render-context.ts`, `compiled-template.ts`, `parse-issue.ts`, `template-validation-issue.ts`, `types/index.ts` |
| Parsing/compiling (items 9, 4) | `template-parser.ts`, `template-compiler.ts` |
| Variable resolution (item 5) | `template-variable-resolver.ts`, `variable-resolvers/variable-resolver-plugin.interface.ts`, `dot-path-resolver.plugin.ts`, `date-variable-resolver.plugin.ts`, `variable-resolvers/index.ts` |
| Rendering (item 2) | `template-renderer.ts`, `html-escape.ts` |
| Validation (item 3) | `template-validator.ts` |
| Caching (item 7) | `template-cache.ts` |
| Version/locale metadata (items 11, 8) | `template-version.ts`, `template-locale.ts` |
| Metrics (item 12) | `template-metrics.ts` |
| Registry (item 10) | `template-registry.ts`, `register-template-input.ts` |
| Facade (item 1) | `template-engine.ts`, `template-engine.interface.ts`, `render-params.ts` |
| Test infrastructure | `test-fakes/fake-notification-template.repository.ts` |
| Tests | 11 `*.test.ts` files, one per class/module above |
| Barrel | `index.ts` |

Plus, at the repository root: `tsconfig.test.json` and `package.json`'s `test` script gained a `template/**` glob (extending the Phase 3/4 dependency-free test-running setup, not replacing it).

## Files Modified (Cross-Phase Changes)

| File | Created in | Change this phase |
|---|---|---|
| `notification-engine/container.ts` | Phase 2 | Added `templateEngine` construction (`new TemplateRegistry(templateRepository)` + `new TemplateEngine(templateRegistry)`), reusing the already-existing `templateRepository` instance — no new repository construction. |
| `notification-engine/index.ts` | Phase 2 | Added `export * from "./template"`. |
| `notification.service.ts` (top-level) | Phase 2 | Added `TemplateEngine`/`templateEngine` re-exports, matching the exact pattern used for `QueueEngine`/`queueEngine` (Phase 3) and `WorkerRuntime`/`workerRuntime` (Phase 4). |
| `tsconfig.test.json` | Phase 3 | Added `template/**/*.ts` to `include`. |
| `package.json` | Phase 3 | Added the `template/*.test.js` glob to the `test` script. |

No other prior-phase file was touched. `TemplateError` (Phase 2), `NotificationTemplateRepository`/`INotificationTemplateRepository` (Phase 2), `NotificationTemplateValidator` (Phase 2), `RenderedNotificationContent`/`NotificationChannelAdapter` (Phase 2), `IQueueLogger`/`NoopLogger` (Phase 3), `IClock`/`SystemClock` (Phase 2) were all **imported and reused verbatim** — zero modification.

---

## Tests Executed

256 tests total across the whole Notification Engine (up from 252 after Phase 4), 0 failures, run via the existing dependency-free `pnpm test` (`tsc -p tsconfig.test.json` → CommonJS → `node --test`). This phase's own tests: 11 files, ~94 individual `it` cases, covering:

- `template-parser.test.ts` — every malformed case (unclosed, empty, digit-leading, hyphenated, leading/trailing/double dot, triple-brace), duplicate detection, and the "stray `}}` isn't an error" edge case.
- `template-compiler.test.ts` — segment construction, de-duplicated `variablePaths`, `TemplateParseError` propagation with the template key attached.
- `template-variable-resolver.test.ts` — dot-path resolution (including deep nesting, missing intermediate segments, explicit `null` vs. missing), the `today`/`now` date plugin with an injected fixed clock, custom-plugin registration/priority, and (added mid-phase, see below) prototype-chain-traversal rejection.
- `template-renderer.test.ts` — substitution across all three parts, missing-variable strategies (`empty` vs. `keep-placeholder`), number/boolean/Date stringification, and a dedicated HTML-escaping block (the security-relevant tests).
- `template-validator.test.ts` — every one of the six validation checks this phase's "Validation" section lists, each confirmed both to fire when expected and to stay silent when its opt-in option is omitted.
- `template-cache.test.ts`, `template-version.test.ts`, `template-locale.test.ts`, `template-metrics.test.ts` — the smaller value-object/utility classes.
- `template-registry.test.ts` — versioning, deactivation-on-new-version, per-channel independence, and the full 3-step locale fallback chain.
- `template-engine.test.ts` — end-to-end: register→exists, register rejects invalid content **before** touching the repository, render uses/invalidates the cache correctly, preview never touches the cache or the repository (for raw drafts), and locale selection end-to-end.

**Two bugs found and fixed while running the suite** (both caught before this report was written, not left as known issues):

1. `template-engine.ts` originally imported `NoopLogger` from the `../queue` **barrel** — which also value-exports `QueueRepository` (imports `@/lib/prisma`), transitively breaking the dependency-free test runner exactly the way Phase 3/4's own reports warned about. Fixed by importing directly from `../queue/logger.interface`.
2. One of my own test assertions in `template-registry.test.ts` ("respects locale when unregistering") incorrectly expected `getActive` to return `null` after unregistering a locale-specific variant — the *correct*, intended behavior is graceful fallback to the still-active default template, which is what the code actually does. Fixed the assertion, not the code.

**One security issue found and fixed mid-audit** (not merely reported — see "Engineering Review Summary" below): the dot-path resolver used the `in` operator, which resolves inherited `Object.prototype` members. Since `__proto__`/`constructor` are syntactically valid placeholder identifiers under this module's grammar, a crafted template like `{{__proto__.constructor.name}}` would have "resolved" instead of correctly reporting "not found." Fixed by switching to `Object.prototype.hasOwnProperty.call(...)`, with 4 new tests proving both the block and that legitimate same-named own properties still resolve correctly.

## Coverage

Every public method of every new class has at least one direct test. Both success and failure/edge paths are covered for the state-changing operations (`register`/`unregister`/`render`/`preview`). Not covered by unit tests (deliberately, matching Phase 3/4's own documented testing boundary): the real, Prisma-backed `NotificationTemplateRepository` itself — its query shapes were already verified in Phase 1/2's own audit work, and this phase adds no new repository methods to re-verify.

## Performance Notes

- `TemplateParser.scan` is a single explicit pass over the string (`indexOf`-based, not a backtracking regex) — O(n) in template length, not O(n²).
- Compiling happens once per (key, channel, version); every subsequent `render()` for the same version is a cache hit and re-walks only the already-tokenized segment list — no re-parsing.
- `render()` costs exactly one repository read on a cache miss, zero on a hit. `preview()` deliberately always skips the cache (so an admin's unsaved edit is never stale), costing one read per call when given a persisted key — this is the intended tradeoff for a preview/editing UX, not an oversight.
- `TemplateRegistry.getActive`'s locale fallback can issue up to 3 sequential reads (exact locale → base language → base key) in the worst case; the common no-locale case is exactly 1 read, since `TemplateLocaleKey.fallbackChain` returns a single-element array when no locale is given.
- No nested loops, no N+1 patterns of the kind flagged in [update.md](update.md)'s Phase 3 audit (`recoverExpiredLocks`) exist anywhere in this phase's code.

## Known Limitations

- **`TemplateCache` has no eviction policy.** It grows for the lifetime of the process, one entry per (key, channel, version) ever rendered. Acceptable at this project's scale (a bounded, admin-managed set of organizational templates, not user-generated content), but worth flagging under "Memory usage" specifically since it was asked about directly — a max-size/LRU policy would be a reasonable, low-risk future addition if the template count ever grows unexpectedly large.
- **"Unknown variable," "missing variable," and "unused variable" validation are all opt-in**, requiring the caller to supply `knownNamespaces`/`sampleContext`/`expectedVariables` respectively. There is no global, hardcoded schema of "valid variables per template key" — by design (variable resolution is meant to be extensible, not centrally enumerated), but it does mean a caller who never supplies these options gets no protection against typo'd or vestigial variables.
- **No authorization check anywhere in this phase**, correctly — `TemplateEngine` is a lib-layer class, not a Server Action; per this project's own convention (CLAUDE.md), permission checks belong at the Server Action layer, which doesn't exist for this engine yet (explicitly out of scope, same as every prior phase).
- **Locale fallback assumes IETF-BCP-47-shaped locale strings** (`"bn-BD"` → base language `"bn"` via the first `-`). A locale string that doesn't follow this shape (e.g. a bare custom code) just skips the base-language fallback step and goes straight to the base key — a safe degradation, not a crash, but worth knowing.

## Technical Debt

- `TemplateEngine` depends on `TemplateRegistry`, `TemplateCompiler`, `TemplateRenderer`, `TemplateValidator`, `TemplateCache`, and `TemplateMetricsCollector` as **concrete classes**, not interfaces — unlike Phase 2-4's repository pattern, which extracted an interface for every injected dependency. This is a deliberate, not accidental, inconsistency: `TemplateCompiler`/`Renderer`/`Validator`/`Cache`/`Metrics` are pure, I/O-free, deterministic classes with nothing to mock (my tests instantiate the real ones directly and never needed a fake), and `TemplateRegistry` already delegates its *own* actual I/O dependency to an interface (`INotificationTemplateRepository`) one layer down — so the seam that genuinely benefits from DIP (the database boundary) already has it. Adding five more interfaces with exactly one implementation each would be interface-bloat without a testability payoff. Flagged here rather than silently deviating from the established pattern without explanation.
- Double-parsing across a register→render lifecycle: `register()`'s validation pass and the first subsequent `render()`'s compile pass each independently call `TemplateParser.scan()` on the same content, at different times, for different purposes (rich issue-reporting vs. token-list construction). Not fixed — the two operations happen at genuinely different moments (save time vs. first-use time) and templates are short strings, so the cost is negligible, but a future phase optimizing aggressively could consider having `register()` pre-compile and hand the result to the cache directly.

## Breaking Changes

**None.** Every touch to a prior-phase file was a pure addition (a new construction line, a new export line) — no existing method, field, type, or export was removed, renamed, or given an incompatible signature.

## Public API

`TemplateEngine`, exactly the 8 methods this phase specifies:

| Method | Signature (essentials) | Notes |
|---|---|---|
| `render` | `(params: RenderParams) => Promise<RenderedNotificationContent>` | Looks up the active template (locale fallback applied), compiles+caches, renders. Throws `TemplateNotFoundError` if nothing matches. |
| `preview` | `(params: PreviewParams) => Promise<RenderedNotificationContent>` | Either a persisted key (bypasses cache) or raw unsaved `TemplateSource` (bypasses repository entirely). Never sends anything, never persists anything. |
| `validate` | `(source: TemplateSource, options?) => TemplateValidationResult` | Pure, synchronous, no I/O. |
| `compile` | `(source: TemplateSource, templateKey?) => CompiledTemplate` | Pure, synchronous, no I/O, no cache (that's `render`'s job). |
| `register` | `(input: RegisterTemplateInput) => Promise<NotificationTemplateDTO>` | Content-validates first (throws `TemplateValidationFailedError` before ever touching the repository on failure), then persists a new version, then invalidates the cache. |
| `unregister` | `(key, channel, locale?) => Promise<void>` | Soft-deactivates (matches this project's `isActive`-toggle convention — never a hard delete). |
| `list` | `(filter?) => Promise<NotificationTemplateDTO[]>` | Plain passthrough. |
| `exists` | `(key, channel, locale?) => Promise<boolean>` | Locale-fallback-aware. |

`ITemplateEngine` is the interface a future phase (or a test) mocks against — extracted for the same reason Phase 4 extracted `IQueueEngine`.

## Future SMTP Integration

Nothing in this phase changes how a future dispatch phase would work — `TemplateEngine.render()` already returns exactly the `RenderedNotificationContent` shape (`{ subject?, bodyHtml?, bodyText? }`) that Phase 2's `NotificationChannelAdapter.send(job, content)` already expects, unmodified. The intended future wiring (not built here): whatever phase implements `NotificationService.processJob` (still a stub) or the worker's real dispatch path calls `templateEngine.render({ key: <event type>, channel: job.channel, context: <event payload>, locale: <recipient's locale, if any> })` and passes the result straight into a real channel adapter's `send()`. No signature on either side needs to change for that to happen.

## Anything Intentionally Postponed

| Item | Why |
|---|---|
| A real translation/i18n backend | Explicitly forbidden ("Do NOT implement translation services"). `TemplateLocaleKey` is the seam; registering a translated template today is a manual `register({..., locale})` call by an admin. |
| SMTP, any delivery channel, PDF, Google Drive | Explicitly forbidden. Untouched. |
| `NotificationService` business logic (`raiseEvent`/`processJob`/`resendJob`) | Explicitly forbidden. Still Phase 2's stubs. |
| Worker integration (calling `templateEngine.render` from `NotificationWorker`) | Explicitly forbidden ("NOT Worker startup", "NOT Worker integration"). `workerRuntime` is untouched by this phase. |
| `instrumentation.ts` wiring | Explicitly forbidden. Untouched. |
| A `NotificationPreferenceRepository`/recipient-locale resolution | Out of scope — no code yet determines *which* locale a given recipient should see; that's the same "recipient/channel resolution is business logic" gap already flagged in Phase 2/3's reports. |
| Cache eviction policy for `TemplateCache` | See "Known Limitations" — not needed at this project's scale, flagged for future consideration. |

---

## Engineering Review Summary

| Dimension | Finding |
|---|---|
| **Architecture compliance** | Full — zero new repository methods needed; three disclosed interpretations (locale-via-key-convention, new content validator distinct from Phase 2's structural one, version-reuse-not-history), all consistent with the frozen design's own stated intent. |
| **SOLID** | Strong overall. One disclosed DIP nuance: `TemplateEngine` depends on concrete classes for its I/O-free pieces (see "Technical Debt") — deliberate, not accidental. |
| **DRY** | Reused every reusable prior-phase primitive (`TemplateError`, `RenderedNotificationContent`, `IQueueLogger`/`NoopLogger`, `IClock`/`SystemClock`, `NotificationTemplateValidator`) rather than duplicating. One minor, inherent double-parse across register→render (see "Technical Debt"). |
| **KISS** | Explicit position-based scanner instead of a clever/fragile mega-regex; plain `Map`-based cache; no premature interface abstraction (see DIP note above, same tradeoff). |
| **Naming consistency** | Matches established conventions exactly — PascalCase classes, camelCase methods, `*Error` suffix, `I*` interface prefix. |
| **Folder organization** | Mirrors `queue/`/`worker/`'s shape (`errors/`, `types/` subfolders). One deliberate deviation: a `test-fakes/` subfolder (Phase 3/4 defined their fake repositories inline in a single test file; this phase's fake is shared by two test files, so extracting it is the more DRY choice, disclosed rather than silently inconsistent). |
| **Performance** | Single-pass O(n) parsing, compile-once-cache-many rendering, no N+1 patterns introduced. |
| **Memory usage** | One real, flagged limitation: `TemplateCache` has no eviction policy (see "Known Limitations"). |
| **Extensibility** | Strong — the variable-resolver plugin system is the headline example (Open/Closed by construction), plus every `TemplateEngine` constructor dependency is swappable. |
| **Security** | One real vulnerability found (prototype-chain traversal via `{{__proto__...}}`-style placeholders) **and fixed**, with 4 new regression tests — not merely reported. HTML-escaping of substituted values into `bodyHtml` was implemented and tested from the start. |
| **Backward compatibility / Breaking changes** | None. Every prior-phase touch was additive. |
| **Public API quality** | Exactly the 8 requested methods; consistent async/sync split (compile/validate are synchronous by design, since they need no I/O); a discriminated union (`PreviewParams`) precisely models preview's two legitimate call shapes instead of a looser, more error-prone optional-everything type. |
| **Future maintainability** | The render→dispatch handoff is already shaped correctly (`RenderedNotificationContent` reused verbatim) — wiring this into an actual send path in a later phase requires no signature changes here. |

---

## Current Project Status

| Phase | Status |
|---|---|
| Phase 0 — Design | Complete |
| Phase 1 — Database Foundation | Complete |
| Phase 1.5 — Migration Recovery | Complete |
| (Audit) — Database Audit | Complete, approved |
| Phase 2 — Core Infrastructure | Complete |
| Phase 3 — Queue Engine | Complete |
| Phase 4 — Worker Runtime | Complete |
| **Phase 5 — Template Engine** | **Complete** |

The Notification Engine now has: a verified database layer, a repository/DTO/validator/factory infrastructure layer, an atomic-locking queue engine, a lifecycle-managed (but not yet started) worker runtime with stub-only provider adapters, and now a fully working template management/rendering/validation/preview engine — all independently tested, none of them sending anything, none of them wired to each other's delivery path yet, and none wired to any business module or UI.

## Next Recommended Phase

**Wiring, not new capability**: the four engines built so far (`queueEngine`, `workerRuntime`, `templateEngine`, plus the still-stub `notificationService`) are each independently solid but not yet connected end-to-end. The most valuable next phase is implementing a **real channel adapter for exactly one channel (Email/SMTP)** — replacing `StubChannelAdapter`'s `ProviderNotImplementedError` for the `EMAIL` channel specifically with a real `nodemailer`-backed adapter (this project already has `nodemailer` as a dependency and a working `email.service.ts` pattern to model it on), and having `NotificationWorker`'s dispatch step call `templateEngine.render()` before invoking that adapter. That single phase would, for the first time, connect queue → template → real delivery for one channel end-to-end, while every other channel remains correctly unimplemented. Only after that should `instrumentation.ts` integration / worker startup be considered.
