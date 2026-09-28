import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TemplateLocaleKey } from "./template-locale";

describe("TemplateLocaleKey.build", () => {
  it("returns the base key unchanged when no locale is given", () => {
    assert.equal(TemplateLocaleKey.build("LOAN_APPROVED"), "LOAN_APPROVED");
  });

  it("appends the locale with @ when given", () => {
    assert.equal(TemplateLocaleKey.build("LOAN_APPROVED", "bn-BD"), "LOAN_APPROVED@bn-BD");
  });
});

describe("TemplateLocaleKey.parse", () => {
  it("returns undefined locale for a plain key", () => {
    assert.deepEqual(TemplateLocaleKey.parse("LOAN_APPROVED"), { baseKey: "LOAN_APPROVED", locale: undefined });
  });

  it("splits a composite key", () => {
    assert.deepEqual(TemplateLocaleKey.parse("LOAN_APPROVED@bn-BD"), { baseKey: "LOAN_APPROVED", locale: "bn-BD" });
  });

  it("round-trips with build", () => {
    const built = TemplateLocaleKey.build("KEY", "fr");
    assert.deepEqual(TemplateLocaleKey.parse(built), { baseKey: "KEY", locale: "fr" });
  });
});

describe("TemplateLocaleKey.fallbackChain", () => {
  it("is just the base key when no locale is given", () => {
    assert.deepEqual(TemplateLocaleKey.fallbackChain("KEY"), ["KEY"]);
  });

  it("tries exact locale, then base language, then base key, for a region-qualified locale", () => {
    assert.deepEqual(TemplateLocaleKey.fallbackChain("KEY", "bn-BD"), ["KEY@bn-BD", "KEY@bn", "KEY"]);
  });

  it("tries exact locale then base key for a locale with no region", () => {
    assert.deepEqual(TemplateLocaleKey.fallbackChain("KEY", "fr"), ["KEY@fr", "KEY"]);
  });
});
