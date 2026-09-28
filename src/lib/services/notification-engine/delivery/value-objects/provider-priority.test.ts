import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ProviderPriority } from "./provider-priority";
import { ValidationError } from "../../errors";

describe("ProviderPriority", () => {
  it("wraps a non-negative integer", () => {
    assert.equal(ProviderPriority.of(2).value, 2);
    assert.equal(ProviderPriority.of(0).value, 0);
  });

  it("rejects negative numbers", () => {
    assert.throws(() => ProviderPriority.of(-1), ValidationError);
  });

  it("rejects non-integers", () => {
    assert.throws(() => ProviderPriority.of(1.5), ValidationError);
  });

  it("default() matches the shared NOTIFICATION_ENGINE_DEFAULTS.provider.defaultPriority constant", () => {
    assert.equal(ProviderPriority.default().value, 1);
  });

  it("compare() sorts lower values first (lower = tried first)", () => {
    const values = [ProviderPriority.of(3), ProviderPriority.of(1), ProviderPriority.of(2)];
    values.sort(ProviderPriority.compare);
    assert.deepEqual(values.map((p) => p.value), [1, 2, 3]);
  });

  it("toString renders the numeric value", () => {
    assert.equal(ProviderPriority.of(5).toString(), "5");
  });
});
