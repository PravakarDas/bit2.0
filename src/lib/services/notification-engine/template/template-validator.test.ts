import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TemplateValidator } from "./template-validator";

describe("TemplateValidator — malformed / invalid syntax (always checked, blocking)", () => {
  it("is valid for well-formed placeholders", () => {
    const result = new TemplateValidator().validate({ subjectTemplate: "Hi {{employee.name}}" });
    assert.equal(result.isValid, true);
    assert.equal(result.issues.length, 0);
  });

  it("flags malformed syntax as an ERROR and marks the result invalid", () => {
    const result = new TemplateValidator().validate({ subjectTemplate: "Hi {{123bad}}" });
    assert.equal(result.isValid, false);
    assert.equal(result.issues.some((i) => i.type === "MALFORMED_PLACEHOLDER" && i.severity === "ERROR"), true);
  });

  it("checks all three parts independently", () => {
    const result = new TemplateValidator().validate({
      subjectTemplate: "fine {{a}}",
      bodyTemplateHtml: "bad {{123}}",
      bodyTemplateText: "fine {{b}}",
    });
    assert.equal(result.isValid, false);
    const malformed = result.issues.filter((i) => i.type === "MALFORMED_PLACEHOLDER");
    assert.equal(malformed.length, 1);
    assert.equal(malformed[0].part, "bodyHtml");
  });
});

describe("TemplateValidator — duplicate placeholders (always checked, non-blocking INFO)", () => {
  it("reports a duplicate as INFO without invalidating the template", () => {
    const result = new TemplateValidator().validate({ subjectTemplate: "Hi {{name}}, bye {{name}}" });
    assert.equal(result.isValid, true);
    const duplicateIssue = result.issues.find((i) => i.type === "DUPLICATE_PLACEHOLDER");
    assert.ok(duplicateIssue);
    assert.equal(duplicateIssue?.severity, "INFO");
  });
});

describe("TemplateValidator — unknown variables (opt-in via knownNamespaces)", () => {
  it("does not check unknown variables when knownNamespaces is omitted", () => {
    const result = new TemplateValidator().validate({ subjectTemplate: "{{totally.madeup}}" });
    assert.equal(
      result.issues.some((i) => i.type === "UNKNOWN_VARIABLE"),
      false
    );
  });

  it("flags a root namespace not in the known list", () => {
    const result = new TemplateValidator().validate(
      { subjectTemplate: "{{totally.madeup}}" },
      { knownNamespaces: ["employee", "company"] }
    );
    const issue = result.issues.find((i) => i.type === "UNKNOWN_VARIABLE");
    assert.ok(issue);
    assert.equal(issue?.severity, "WARNING");
    assert.equal(result.isValid, true); // WARNING does not block
  });

  it("does not flag a namespace that IS in the known list", () => {
    const result = new TemplateValidator().validate(
      { subjectTemplate: "{{employee.name}}" },
      { knownNamespaces: ["employee", "company"] }
    );
    assert.equal(
      result.issues.some((i) => i.type === "UNKNOWN_VARIABLE"),
      false
    );
  });
});

describe("TemplateValidator — missing variables (opt-in via sampleContext)", () => {
  it("does not check missing variables when sampleContext is omitted", () => {
    const result = new TemplateValidator().validate({ subjectTemplate: "{{employee.name}}" });
    assert.equal(
      result.issues.some((i) => i.type === "MISSING_VARIABLE"),
      false
    );
  });

  it("flags a placeholder that does not resolve against the sample context", () => {
    const result = new TemplateValidator().validate(
      { subjectTemplate: "{{employee.middleName}}" },
      { sampleContext: { employee: { name: "Jane" } } }
    );
    const issue = result.issues.find((i) => i.type === "MISSING_VARIABLE");
    assert.ok(issue);
    assert.equal(issue?.severity, "WARNING");
  });

  it("does not flag a placeholder that resolves fine against the sample context", () => {
    const result = new TemplateValidator().validate(
      { subjectTemplate: "{{employee.name}}" },
      { sampleContext: { employee: { name: "Jane" } } }
    );
    assert.equal(
      result.issues.some((i) => i.type === "MISSING_VARIABLE"),
      false
    );
  });
});

describe("TemplateValidator — unused variables (opt-in via expectedVariables)", () => {
  it("flags an expected variable that's never referenced", () => {
    const result = new TemplateValidator().validate(
      { subjectTemplate: "Hi {{employee.name}}" },
      { expectedVariables: ["employee.name", "company.name"] }
    );
    const issue = result.issues.find((i) => i.type === "UNUSED_VARIABLE");
    assert.ok(issue);
    assert.equal(issue?.path, "company.name");
    assert.equal(issue?.severity, "WARNING");
  });

  it("does not flag anything when every expected variable is used", () => {
    const result = new TemplateValidator().validate(
      { subjectTemplate: "Hi {{employee.name}}" },
      { expectedVariables: ["employee.name"] }
    );
    assert.equal(
      result.issues.some((i) => i.type === "UNUSED_VARIABLE"),
      false
    );
  });

  it("checks unused variables across all three parts combined, not per-part", () => {
    const result = new TemplateValidator().validate(
      { subjectTemplate: "{{a}}", bodyTemplateText: "{{b}}" },
      { expectedVariables: ["a", "b"] }
    );
    assert.equal(
      result.issues.some((i) => i.type === "UNUSED_VARIABLE"),
      false
    );
  });
});

describe("TemplateValidator — overall isValid semantics", () => {
  it("is invalid if ANY part has an ERROR-severity issue, even if others are fine", () => {
    const result = new TemplateValidator().validate({
      subjectTemplate: "fine",
      bodyTemplateHtml: "{{bad-name}}",
    });
    assert.equal(result.isValid, false);
  });

  it("is valid when only WARNING/INFO issues are present", () => {
    const result = new TemplateValidator().validate(
      { subjectTemplate: "{{a}} {{a}} {{unknown}}" },
      { knownNamespaces: ["a"] }
    );
    assert.equal(result.isValid, true);
    assert.ok(result.issues.length > 0);
  });
});
