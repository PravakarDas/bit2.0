import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TemplateParser } from "./template-parser";

describe("TemplateParser.scan", () => {
  it("finds a single valid placeholder", () => {
    const { placeholders, issues } = TemplateParser.scan("Hello {{employee.name}}!");
    assert.equal(issues.length, 0);
    assert.equal(placeholders.length, 1);
    assert.equal(placeholders[0].path, "employee.name");
    assert.equal(placeholders[0].raw, "{{employee.name}}");
  });

  it("trims whitespace inside a placeholder", () => {
    const { placeholders, issues } = TemplateParser.scan("{{  employee.name  }}");
    assert.equal(issues.length, 0);
    assert.equal(placeholders[0].path, "employee.name");
  });

  it("finds multiple placeholders in order", () => {
    const { placeholders } = TemplateParser.scan("{{a}} and {{b}} and {{c}}");
    assert.deepEqual(
      placeholders.map((p) => p.path),
      ["a", "b", "c"]
    );
  });

  it("supports single-segment paths like today/now", () => {
    const { placeholders, issues } = TemplateParser.scan("Date: {{today}}, time: {{now}}");
    assert.equal(issues.length, 0);
    assert.deepEqual(
      placeholders.map((p) => p.path),
      ["today", "now"]
    );
  });

  it("returns no placeholders and no issues for plain text", () => {
    const { placeholders, issues } = TemplateParser.scan("Just plain text, no braces.");
    assert.equal(placeholders.length, 0);
    assert.equal(issues.length, 0);
  });

  it("flags an unclosed placeholder", () => {
    const { issues, placeholders } = TemplateParser.scan("Hello {{employee.name");
    assert.equal(placeholders.length, 0);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].type, "UNCLOSED_PLACEHOLDER");
  });

  it("flags an empty placeholder", () => {
    const { issues } = TemplateParser.scan("{{}}");
    assert.equal(issues.length, 1);
    assert.equal(issues[0].type, "EMPTY_PLACEHOLDER");
  });

  it("flags a whitespace-only placeholder as empty", () => {
    const { issues } = TemplateParser.scan("{{   }}");
    assert.equal(issues.length, 1);
    assert.equal(issues[0].type, "EMPTY_PLACEHOLDER");
  });

  it("flags a digit-leading segment as invalid syntax", () => {
    const { issues } = TemplateParser.scan("{{123abc}}");
    assert.equal(issues.length, 1);
    assert.equal(issues[0].type, "INVALID_SYNTAX");
  });

  it("flags hyphenated names as invalid syntax", () => {
    const { issues } = TemplateParser.scan("{{employee-name}}");
    assert.equal(issues.length, 1);
    assert.equal(issues[0].type, "INVALID_SYNTAX");
  });

  it("flags a leading dot as invalid syntax", () => {
    const { issues } = TemplateParser.scan("{{.employee}}");
    assert.equal(issues[0].type, "INVALID_SYNTAX");
  });

  it("flags a trailing dot as invalid syntax", () => {
    const { issues } = TemplateParser.scan("{{employee.}}");
    assert.equal(issues[0].type, "INVALID_SYNTAX");
  });

  it("flags consecutive dots as invalid syntax", () => {
    const { issues } = TemplateParser.scan("{{employee..name}}");
    assert.equal(issues[0].type, "INVALID_SYNTAX");
  });

  it("flags triple-brace opening as invalid syntax (extra brace becomes part of the path)", () => {
    const { issues } = TemplateParser.scan("{{{employee.name}}");
    assert.equal(issues.length, 1);
    assert.equal(issues[0].type, "INVALID_SYNTAX");
  });

  it("does not flag a stray closing }} with no matching {{ as an error (it's just literal text)", () => {
    const { issues, placeholders } = TemplateParser.scan("See the docs}} for more info");
    assert.equal(issues.length, 0);
    assert.equal(placeholders.length, 0);
  });

  it("continues scanning after a valid placeholder even if a later one is malformed", () => {
    const { placeholders, issues } = TemplateParser.scan("{{employee.name}} then {{123bad}}");
    assert.equal(placeholders.length, 1);
    assert.equal(placeholders[0].path, "employee.name");
    assert.equal(issues.length, 1);
    assert.equal(issues[0].type, "INVALID_SYNTAX");
  });
});

describe("TemplateParser.findDuplicates", () => {
  it("returns an empty map when no path repeats", () => {
    const { placeholders } = TemplateParser.scan("{{a}} {{b}} {{c}}");
    const duplicates = TemplateParser.findDuplicates(placeholders);
    assert.equal(duplicates.size, 0);
  });

  it("finds a path referenced twice", () => {
    const { placeholders } = TemplateParser.scan("Hi {{employee.name}}, bye {{employee.name}}!");
    const duplicates = TemplateParser.findDuplicates(placeholders);
    assert.equal(duplicates.size, 1);
    assert.equal(duplicates.get("employee.name")?.length, 2);
  });

  it("does not flag a path that only appears once among several", () => {
    const { placeholders } = TemplateParser.scan("{{a}} {{a}} {{b}}");
    const duplicates = TemplateParser.findDuplicates(placeholders);
    assert.equal(duplicates.has("a"), true);
    assert.equal(duplicates.has("b"), false);
  });
});
