import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SmtpResultMapper } from "./smtp-result-mapper";

describe("SmtpResultMapper", () => {
  it("toSuccess() returns a non-retryable SUCCESS", () => {
    const result = new SmtpResultMapper().toSuccess("prov-1", 42);
    assert.equal(result.status, "SUCCESS");
    assert.equal(result.retryable, false);
    assert.equal(result.latencyMs, 42);
  });

  describe("toFailure()", () => {
    it("maps a permanent SMTP error (EENVELOPE) to PERMANENT_FAILURE with the friendly message", () => {
      const result = new SmtpResultMapper().toFailure({ code: "EENVELOPE" }, "prov-1", 10);
      assert.equal(result.status, "PERMANENT_FAILURE");
      assert.equal(result.retryable, false);
      assert.equal(result.errorMessage, "Invalid sender or recipient email address.");
    });

    it("maps a 5xx server rejection to PERMANENT_FAILURE", () => {
      const result = new SmtpResultMapper().toFailure({ responseCode: 550 }, "prov-1", 10);
      assert.equal(result.status, "PERMANENT_FAILURE");
    });

    it("delegates a non-permanent SMTP error to DeliveryExceptionMapper, producing a retryable TEMPORARY_FAILURE", () => {
      const result = new SmtpResultMapper().toFailure({ code: "ECONNREFUSED" }, "prov-1", 10);
      assert.equal(result.status, "TEMPORARY_FAILURE");
      assert.equal(result.retryable, true);
    });

    it("delegates a completely unrecognized thrown error to DeliveryExceptionMapper as TEMPORARY_FAILURE", () => {
      const result = new SmtpResultMapper().toFailure(new Error("mystery"), "prov-1", 10);
      assert.equal(result.status, "TEMPORARY_FAILURE");
    });
  });
});
