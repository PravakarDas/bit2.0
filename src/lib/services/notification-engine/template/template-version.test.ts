import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TemplateVersion } from "./template-version";
import { ValidationError } from "../errors";

describe("TemplateVersion.from", () => {
  it("accepts a positive integer", () => {
    assert.equal(TemplateVersion.from(3).value, 3);
  });

  it("rejects zero", () => {
    assert.throws(() => TemplateVersion.from(0), ValidationError);
  });

  it("rejects a negative number", () => {
    assert.throws(() => TemplateVersion.from(-1), ValidationError);
  });

  it("rejects a non-integer", () => {
    assert.throws(() => TemplateVersion.from(1.5), ValidationError);
  });
});

describe("TemplateVersion.next", () => {
  it("starts at the configured initial version when no versions exist yet", () => {
    const version = TemplateVersion.next([]);
    assert.equal(version.value, 1);
  });

  it("is one greater than the highest existing version", () => {
    assert.equal(TemplateVersion.next([1, 2, 5]).value, 6);
  });

  it("handles a single existing version", () => {
    assert.equal(TemplateVersion.next([1]).value, 2);
  });
});

describe("TemplateVersion.isNewerThan / toString", () => {
  it("compares correctly", () => {
    assert.equal(TemplateVersion.from(2).isNewerThan(TemplateVersion.from(1)), true);
    assert.equal(TemplateVersion.from(1).isNewerThan(TemplateVersion.from(2)), false);
    assert.equal(TemplateVersion.from(1).isNewerThan(TemplateVersion.from(1)), false);
  });

  it("formats as vN", () => {
    assert.equal(TemplateVersion.from(4).toString(), "v4");
  });
});
