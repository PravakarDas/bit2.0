import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TemplateCache, buildTemplateCacheKey } from "./template-cache";
import type { CompiledTemplate } from "./types";

const SAMPLE: CompiledTemplate = { subject: { segments: [{ type: "literal", value: "hi" }], variablePaths: [] } };

describe("buildTemplateCacheKey", () => {
  it("produces a stable, distinguishing key", () => {
    assert.equal(buildTemplateCacheKey("LOAN_APPROVED", "EMAIL", 1), "LOAN_APPROVED::EMAIL::v1");
  });

  it("produces different keys for different versions", () => {
    assert.notEqual(buildTemplateCacheKey("K", "EMAIL", 1), buildTemplateCacheKey("K", "EMAIL", 2));
  });
});

describe("TemplateCache", () => {
  it("returns undefined for a key that was never set", () => {
    const cache = new TemplateCache();
    assert.equal(cache.get("missing"), undefined);
  });

  it("returns what was set", () => {
    const cache = new TemplateCache();
    cache.set("k1", SAMPLE);
    assert.equal(cache.get("k1"), SAMPLE);
  });

  it("tracks size", () => {
    const cache = new TemplateCache();
    cache.set("k1", SAMPLE);
    cache.set("k2", SAMPLE);
    assert.equal(cache.size, 2);
  });

  it("invalidate removes every version of one key+channel", () => {
    const cache = new TemplateCache();
    cache.set(buildTemplateCacheKey("K", "EMAIL", 1), SAMPLE);
    cache.set(buildTemplateCacheKey("K", "EMAIL", 2), SAMPLE);
    cache.set(buildTemplateCacheKey("K", "SMS", 1), SAMPLE);

    cache.invalidate("K", "EMAIL");

    assert.equal(cache.get(buildTemplateCacheKey("K", "EMAIL", 1)), undefined);
    assert.equal(cache.get(buildTemplateCacheKey("K", "EMAIL", 2)), undefined);
    assert.equal(cache.get(buildTemplateCacheKey("K", "SMS", 1)), SAMPLE); // different channel untouched
  });

  it("invalidate does not affect a different locale-composite key with a similar prefix", () => {
    const cache = new TemplateCache();
    cache.set(buildTemplateCacheKey("K@bn-BD", "EMAIL", 1), SAMPLE);
    cache.invalidate("K", "EMAIL"); // base key, not the locale-composite one
    assert.equal(cache.get(buildTemplateCacheKey("K@bn-BD", "EMAIL", 1)), SAMPLE);
  });

  it("invalidateAll clears everything", () => {
    const cache = new TemplateCache();
    cache.set("k1", SAMPLE);
    cache.set("k2", SAMPLE);
    cache.invalidateAll();
    assert.equal(cache.size, 0);
  });
});
