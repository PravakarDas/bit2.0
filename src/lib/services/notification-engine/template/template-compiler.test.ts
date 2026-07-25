import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TemplateCompiler } from "./template-compiler";
import { TemplateParseError } from "./errors";

describe("TemplateCompiler.compile", () => {
  it("compiles a simple part into literal + variable segments", () => {
    const compiler = new TemplateCompiler();
    const compiled = compiler.compile({ subjectTemplate: "Hello {{employee.name}}!" });
    assert.deepEqual(compiled.subject?.segments, [
      { type: "literal", value: "Hello " },
      { type: "variable", path: "employee.name" },
      { type: "literal", value: "!" },
    ]);
  });

  it("collects distinct variable paths in first-seen order, de-duplicated", () => {
    const compiler = new TemplateCompiler();
    const compiled = compiler.compile({ bodyTemplateText: "{{a}} {{b}} {{a}}" });
    assert.deepEqual(compiled.bodyText?.variablePaths, ["a", "b"]);
  });

  it("leaves absent parts as undefined", () => {
    const compiler = new TemplateCompiler();
    const compiled = compiler.compile({ subjectTemplate: "Hi" });
    assert.equal(compiled.bodyHtml, undefined);
    assert.equal(compiled.bodyText, undefined);
  });

  it("treats an empty string part the same as absent", () => {
    const compiler = new TemplateCompiler();
    const compiled = compiler.compile({ subjectTemplate: "" });
    assert.equal(compiled.subject, undefined);
  });

  it("compiles a part with no placeholders into a single literal segment", () => {
    const compiler = new TemplateCompiler();
    const compiled = compiler.compile({ bodyTemplateText: "Just plain text." });
    assert.deepEqual(compiled.bodyText?.segments, [{ type: "literal", value: "Just plain text." }]);
    assert.deepEqual(compiled.bodyText?.variablePaths, []);
  });

  it("compiles all three parts independently", () => {
    const compiler = new TemplateCompiler();
    const compiled = compiler.compile({
      subjectTemplate: "Subject {{a}}",
      bodyTemplateHtml: "<p>{{b}}</p>",
      bodyTemplateText: "Text {{c}}",
    });
    assert.equal(compiled.subject?.variablePaths[0], "a");
    assert.equal(compiled.bodyHtml?.variablePaths[0], "b");
    assert.equal(compiled.bodyText?.variablePaths[0], "c");
  });

  it("throws TemplateParseError when a part has malformed placeholder syntax", () => {
    const compiler = new TemplateCompiler();
    assert.throws(
      () => compiler.compile({ subjectTemplate: "Hello {{123bad}}" }),
      (err: unknown) => err instanceof TemplateParseError && err.issues.length === 1
    );
  });

  it("includes the templateKey in the thrown error for diagnostics", () => {
    const compiler = new TemplateCompiler();
    assert.throws(
      () => compiler.compile({ subjectTemplate: "{{}}" }, "LOAN_APPROVED"),
      (err: unknown) => err instanceof TemplateParseError && err.templateKey === "LOAN_APPROVED"
    );
  });

  it("does not compile later parts once an earlier part fails (fails fast)", () => {
    const compiler = new TemplateCompiler();
    assert.throws(() => compiler.compile({ subjectTemplate: "{{bad-name}}", bodyTemplateText: "fine" }));
  });
});
