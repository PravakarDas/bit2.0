import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ProviderResults } from "./provider-result";

describe("ProviderResults factories", () => {
  it("success() is never retryable", () => {
    const result = ProviderResults.success("prov-1", 10);
    assert.equal(result.status, "SUCCESS");
    assert.equal(result.retryable, false);
  });

  it("temporaryFailure() is always retryable", () => {
    const result = ProviderResults.temporaryFailure("prov-1", 10, "TIMEOUT", "timed out");
    assert.equal(result.status, "TEMPORARY_FAILURE");
    assert.equal(result.retryable, true);
    assert.equal(result.errorCode, "TIMEOUT");
    assert.equal(result.errorMessage, "timed out");
  });

  it("permanentFailure() is never retryable", () => {
    const result = ProviderResults.permanentFailure("prov-1", 10, "INVALID_RECIPIENT");
    assert.equal(result.status, "PERMANENT_FAILURE");
    assert.equal(result.retryable, false);
    assert.equal(result.errorCode, "INVALID_RECIPIENT");
  });

  it("errorCode/errorMessage are optional", () => {
    const result = ProviderResults.temporaryFailure("prov-1", 10);
    assert.equal(result.errorCode, undefined);
    assert.equal(result.errorMessage, undefined);
  });
});
