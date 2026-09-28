import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isPermanentSmtpError } from "./smtp-retry-classification";

describe("isPermanentSmtpError", () => {
  it("is permanent for an invalid envelope (bad sender/recipient address)", () => {
    assert.equal(isPermanentSmtpError({ code: "EENVELOPE" }), true);
  });

  it("is permanent for a 5xx SMTP response code", () => {
    assert.equal(isPermanentSmtpError({ responseCode: 550 }), true);
  });

  it("is NOT permanent for auth failures (retrying via a sibling provider with different credentials might succeed)", () => {
    assert.equal(isPermanentSmtpError({ code: "EAUTH" }), false);
  });

  it("is NOT permanent for DNS/connection/timeout errors (infra, potentially transient)", () => {
    assert.equal(isPermanentSmtpError({ code: "ENOTFOUND" }), false);
    assert.equal(isPermanentSmtpError({ code: "ECONNREFUSED" }), false);
    assert.equal(isPermanentSmtpError({ code: "ETIMEDOUT" }), false);
  });

  it("is NOT permanent for a 4xx SMTP response code (transient negative completion per RFC 5321)", () => {
    assert.equal(isPermanentSmtpError({ responseCode: 421 }), false);
  });

  it("is NOT permanent (conservative default) for an unrecognized error", () => {
    assert.equal(isPermanentSmtpError(new Error("mystery failure")), false);
    assert.equal(isPermanentSmtpError({}), false);
  });
});
