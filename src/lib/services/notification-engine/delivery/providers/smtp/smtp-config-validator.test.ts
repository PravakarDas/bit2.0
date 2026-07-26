import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SmtpConfigValidator } from "./smtp-config-validator";
import type { ResolvedEmailConfig } from "../../../../../smtp-shared";

const validConfig: ResolvedEmailConfig = {
  smtpHost: "smtp.gmail.com",
  smtpPort: 587,
  secure: false,
  senderEmail: "sender@example.com",
  appPassword: "app-password",
};

describe("SmtpConfigValidator", () => {
  it("is invalid with a single issue when config is null", () => {
    const result = new SmtpConfigValidator().validate(null);
    assert.equal(result.valid, false);
    assert.equal(result.issues.length, 1);
  });

  it("is valid for a well-formed config", () => {
    const result = new SmtpConfigValidator().validate(validConfig);
    assert.deepEqual(result, { valid: true, issues: [] });
  });

  it("flags an empty smtpHost", () => {
    const result = new SmtpConfigValidator().validate({ ...validConfig, smtpHost: "" });
    assert.equal(result.valid, false);
    assert.match(result.issues[0], /smtpHost/);
  });

  it("flags an out-of-range smtpPort", () => {
    assert.equal(new SmtpConfigValidator().validate({ ...validConfig, smtpPort: 0 }).valid, false);
    assert.equal(new SmtpConfigValidator().validate({ ...validConfig, smtpPort: 70000 }).valid, false);
    assert.equal(new SmtpConfigValidator().validate({ ...validConfig, smtpPort: 1.5 }).valid, false);
  });

  it("flags a senderEmail without an @", () => {
    const result = new SmtpConfigValidator().validate({ ...validConfig, senderEmail: "not-an-email" });
    assert.equal(result.valid, false);
    assert.match(result.issues[0], /senderEmail/);
  });

  it("flags an empty appPassword", () => {
    const result = new SmtpConfigValidator().validate({ ...validConfig, appPassword: "" });
    assert.equal(result.valid, false);
    assert.match(result.issues[0], /appPassword/);
  });

  it("reports every violated rule, not just the first", () => {
    const result = new SmtpConfigValidator().validate({ smtpHost: "", smtpPort: -1, secure: false, senderEmail: "", appPassword: "" });
    assert.equal(result.issues.length, 4);
  });
});
