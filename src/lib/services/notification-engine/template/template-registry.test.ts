import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TemplateRegistry } from "./template-registry";
import { TemplateNotFoundError } from "./errors";
import { FakeNotificationTemplateRepository } from "./test-fakes/fake-notification-template.repository";

function buildRegistry() {
  const repository = new FakeNotificationTemplateRepository();
  return { repository, registry: new TemplateRegistry(repository) };
}

describe("TemplateRegistry.register", () => {
  it("creates a new template at version 1", async () => {
    const { registry } = buildRegistry();
    const created = await registry.register({ key: "LOAN_APPROVED", channel: "EMAIL", subjectTemplate: "Hi" });
    assert.equal(created.version, 1);
    assert.equal(created.isActive, true);
    assert.equal(created.key, "LOAN_APPROVED");
  });

  it("increments the version on a second register for the same key+channel", async () => {
    const { registry } = buildRegistry();
    await registry.register({ key: "K", channel: "EMAIL", subjectTemplate: "v1" });
    const second = await registry.register({ key: "K", channel: "EMAIL", subjectTemplate: "v2" });
    assert.equal(second.version, 2);
  });

  it("deactivates the previously active version when registering a new one", async () => {
    const { registry, repository } = buildRegistry();
    const first = await registry.register({ key: "K", channel: "EMAIL", subjectTemplate: "v1" });
    await registry.register({ key: "K", channel: "EMAIL", subjectTemplate: "v2" });

    const firstReloaded = await repository.findById(first.id);
    assert.equal(firstReloaded?.isActive, false);
  });

  it("keeps different channels for the same key fully independent", async () => {
    const { registry } = buildRegistry();
    const email = await registry.register({ key: "K", channel: "EMAIL", subjectTemplate: "e" });
    const sms = await registry.register({ key: "K", channel: "SMS", bodyTemplateText: "s" });
    assert.equal(email.version, 1);
    assert.equal(sms.version, 1);
  });

  it("folds the given locale into the persisted key", async () => {
    const { registry } = buildRegistry();
    const created = await registry.register({ key: "K", channel: "EMAIL", locale: "bn-BD", subjectTemplate: "hi" });
    assert.equal(created.key, "K@bn-BD");
  });

  it("rejects structurally invalid input via the reused Phase 2 validator", async () => {
    const { registry } = buildRegistry();
    await assert.rejects(() => registry.register({ key: "", channel: "EMAIL" }));
  });
});

describe("TemplateRegistry.unregister", () => {
  it("deactivates the active version", async () => {
    const { registry, repository } = buildRegistry();
    const created = await registry.register({ key: "K", channel: "EMAIL", subjectTemplate: "hi" });
    await registry.unregister("K", "EMAIL");
    const reloaded = await repository.findById(created.id);
    assert.equal(reloaded?.isActive, false);
  });

  it("throws TemplateNotFoundError when nothing is registered", async () => {
    const { registry } = buildRegistry();
    await assert.rejects(() => registry.unregister("NOPE", "EMAIL"), TemplateNotFoundError);
  });

  it("respects locale when unregistering — only the bn-BD row is deactivated, the default (en) row is untouched", async () => {
    const { registry } = buildRegistry();
    const defaultTemplate = await registry.register({ key: "K", channel: "EMAIL", subjectTemplate: "en" });
    await registry.register({ key: "K", channel: "EMAIL", locale: "bn-BD", subjectTemplate: "bn" });

    await registry.unregister("K", "EMAIL", "bn-BD");

    assert.equal(await registry.exists("K", "EMAIL"), true); // default still active
    // Asking for bn-BD now correctly falls back to the still-active default
    // per the fallback chain (K@bn-BD [inactive] -> K@bn [never existed] ->
    // K [active]) — this is the intended graceful-degradation behavior,
    // exercised in full in the "locale fallback" describe block below.
    const found = await registry.getActive("K", "EMAIL", "bn-BD");
    assert.equal(found?.id, defaultTemplate.id);
  });
});

describe("TemplateRegistry.exists / list", () => {
  it("exists is false before registering, true after", async () => {
    const { registry } = buildRegistry();
    assert.equal(await registry.exists("K", "EMAIL"), false);
    await registry.register({ key: "K", channel: "EMAIL", subjectTemplate: "hi" });
    assert.equal(await registry.exists("K", "EMAIL"), true);
  });

  it("list returns every version, not just the active one", async () => {
    const { registry } = buildRegistry();
    await registry.register({ key: "K", channel: "EMAIL", subjectTemplate: "v1" });
    await registry.register({ key: "K", channel: "EMAIL", subjectTemplate: "v2" });
    const all = await registry.list({ key: "K", channel: "EMAIL" });
    assert.equal(all.length, 2);
  });

  it("list with no filter returns everything", async () => {
    const { registry } = buildRegistry();
    await registry.register({ key: "A", channel: "EMAIL", subjectTemplate: "a" });
    await registry.register({ key: "B", channel: "SMS", bodyTemplateText: "b" });
    const all = await registry.list();
    assert.equal(all.length, 2);
  });
});

describe("TemplateRegistry.getActive — locale fallback", () => {
  it("falls back to the base key when the exact locale isn't registered", async () => {
    const { registry } = buildRegistry();
    const base = await registry.register({ key: "K", channel: "EMAIL", subjectTemplate: "default" });
    const found = await registry.getActive("K", "EMAIL", "fr-FR");
    assert.equal(found?.id, base.id);
  });

  it("prefers the exact locale over the base key when both exist", async () => {
    const { registry } = buildRegistry();
    await registry.register({ key: "K", channel: "EMAIL", subjectTemplate: "default" });
    const localized = await registry.register({ key: "K", channel: "EMAIL", locale: "bn-BD", subjectTemplate: "bn" });
    const found = await registry.getActive("K", "EMAIL", "bn-BD");
    assert.equal(found?.id, localized.id);
  });

  it("falls back to the base language when the region-specific locale is missing", async () => {
    const { registry } = buildRegistry();
    const baseLang = await registry.register({ key: "K", channel: "EMAIL", locale: "bn", subjectTemplate: "bn generic" });
    const found = await registry.getActive("K", "EMAIL", "bn-BD"); // no bn-BD registered, but bn is
    assert.equal(found?.id, baseLang.id);
  });

  it("returns null when nothing matches the fallback chain at all", async () => {
    const { registry } = buildRegistry();
    const found = await registry.getActive("NOPE", "EMAIL", "fr-FR");
    assert.equal(found, null);
  });
});
