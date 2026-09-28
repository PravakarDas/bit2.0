import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TemplateEngine } from "./template-engine";
import { TemplateRegistry } from "./template-registry";
import { TemplateCompiler } from "./template-compiler";
import { TemplateRenderer } from "./template-renderer";
import { TemplateValidator } from "./template-validator";
import { TemplateCache } from "./template-cache";
import { TemplateMetricsCollector } from "./template-metrics";
import { TemplateNotFoundError, TemplateValidationFailedError } from "./errors";
import { FakeNotificationTemplateRepository } from "./test-fakes/fake-notification-template.repository";

function buildEngine() {
  const repository = new FakeNotificationTemplateRepository();
  const registry = new TemplateRegistry(repository);
  const cache = new TemplateCache();
  const metrics = new TemplateMetricsCollector();
  const engine = new TemplateEngine(registry, new TemplateCompiler(), new TemplateRenderer(), new TemplateValidator(), cache, metrics);
  return { repository, registry, cache, metrics, engine };
}

describe("TemplateEngine — compile / validate (pure, no repository involved)", () => {
  it("compile compiles raw source directly", () => {
    const { engine } = buildEngine();
    const compiled = engine.compile({ subjectTemplate: "Hi {{name}}" });
    assert.equal(compiled.subject?.variablePaths[0], "name");
  });

  it("validate reports issues without needing a persisted template", () => {
    const { engine } = buildEngine();
    const result = engine.validate({ subjectTemplate: "{{bad-name}}" });
    assert.equal(result.isValid, false);
  });
});

describe("TemplateEngine — register / unregister / list / exists", () => {
  it("register persists and makes the template findable", async () => {
    const { engine } = buildEngine();
    const created = await engine.register({ key: "LOAN_APPROVED", channel: "EMAIL", subjectTemplate: "Hi {{employee.name}}" });
    assert.equal(created.version, 1);
    assert.equal(await engine.exists("LOAN_APPROVED", "EMAIL"), true);
  });

  it("register rejects malformed placeholder content before ever touching the repository", async () => {
    const { engine, repository } = buildEngine();
    await assert.rejects(
      () => engine.register({ key: "K", channel: "EMAIL", subjectTemplate: "{{bad-name}}" }),
      TemplateValidationFailedError
    );
    assert.equal(repository.rows.size, 0);
  });

  it("unregister deactivates, and exists then reports false", async () => {
    const { engine } = buildEngine();
    await engine.register({ key: "K", channel: "EMAIL", subjectTemplate: "hi" });
    await engine.unregister("K", "EMAIL");
    assert.equal(await engine.exists("K", "EMAIL"), false);
  });

  it("list reflects every registered version", async () => {
    const { engine } = buildEngine();
    await engine.register({ key: "K", channel: "EMAIL", subjectTemplate: "v1" });
    await engine.register({ key: "K", channel: "EMAIL", subjectTemplate: "v2" });
    const all = await engine.list({ key: "K", channel: "EMAIL" });
    assert.equal(all.length, 2);
  });
});

describe("TemplateEngine.render", () => {
  it("looks up, compiles, caches, and renders a persisted template", async () => {
    const { engine } = buildEngine();
    await engine.register({ key: "K", channel: "EMAIL", subjectTemplate: "Hi {{employee.name}}" });

    const rendered = await engine.render({ key: "K", channel: "EMAIL", context: { employee: { name: "Jane" } } });
    assert.equal(rendered.subject, "Hi Jane");
  });

  it("throws TemplateNotFoundError for a key that was never registered", async () => {
    const { engine } = buildEngine();
    await assert.rejects(
      () => engine.render({ key: "NOPE", channel: "EMAIL", context: {} }),
      TemplateNotFoundError
    );
  });

  it("caches the compiled template across renders (cache hit on the second call)", async () => {
    const { engine, metrics } = buildEngine();
    await engine.register({ key: "K", channel: "EMAIL", subjectTemplate: "Hi {{name}}" });

    await engine.render({ key: "K", channel: "EMAIL", context: { name: "A" } });
    await engine.render({ key: "K", channel: "EMAIL", context: { name: "B" } });

    const snapshot = metrics.getSnapshot();
    assert.equal(snapshot.cacheMisses, 1);
    assert.equal(snapshot.cacheHits, 1);
    assert.equal(snapshot.renderCount, 2);
  });

  it("invalidates the cache when a new version is registered, so the next render uses the new content", async () => {
    const { engine } = buildEngine();
    await engine.register({ key: "K", channel: "EMAIL", subjectTemplate: "v1: {{name}}" });
    await engine.render({ key: "K", channel: "EMAIL", context: { name: "A" } }); // warms the cache

    await engine.register({ key: "K", channel: "EMAIL", subjectTemplate: "v2: {{name}}" });
    const rendered = await engine.render({ key: "K", channel: "EMAIL", context: { name: "A" } });

    assert.equal(rendered.subject, "v2: A");
  });

  it("respects locale selection end-to-end", async () => {
    const { engine } = buildEngine();
    await engine.register({ key: "K", channel: "EMAIL", subjectTemplate: "Default" });
    await engine.register({ key: "K", channel: "EMAIL", locale: "bn-BD", subjectTemplate: "Bengali" });

    const defaultRendered = await engine.render({ key: "K", channel: "EMAIL", context: {} });
    const localizedRendered = await engine.render({ key: "K", channel: "EMAIL", context: {}, locale: "bn-BD" });

    assert.equal(defaultRendered.subject, "Default");
    assert.equal(localizedRendered.subject, "Bengali");
  });
});

describe("TemplateEngine.preview", () => {
  it("renders raw draft source without ever persisting or touching the repository", async () => {
    const { engine, repository } = buildEngine();
    const rendered = await engine.preview({
      source: { subjectTemplate: "Draft {{name}}" },
      context: { name: "Jane" },
    });
    assert.equal(rendered.subject, "Draft Jane");
    assert.equal(repository.rows.size, 0);
  });

  it("previews a persisted template without populating the render cache", async () => {
    const { engine, metrics } = buildEngine();
    await engine.register({ key: "K", channel: "EMAIL", subjectTemplate: "Hi {{name}}" });

    await engine.preview({ key: "K", channel: "EMAIL", context: { name: "Jane" } });

    // preview should not count as a cache hit/miss (it always skips the cache)
    const snapshot = metrics.getSnapshot();
    assert.equal(snapshot.cacheHits, 0);
    assert.equal(snapshot.cacheMisses, 0);
    assert.equal(snapshot.previewCount, 1);
  });

  it("reflects an unsaved edit immediately (never serves a stale cached version)", async () => {
    const { engine } = buildEngine();
    await engine.register({ key: "K", channel: "EMAIL", subjectTemplate: "Saved: {{name}}" });
    await engine.render({ key: "K", channel: "EMAIL", context: { name: "A" } }); // warms cache with "Saved:"

    // Admin is drafting a change but hasn't clicked save yet:
    const draftPreview = await engine.preview({
      source: { subjectTemplate: "Draft: {{name}}" },
      context: { name: "A" },
    });
    assert.equal(draftPreview.subject, "Draft: A");
  });
});
