import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DeliveryExceptionMapper } from "./delivery-exception-mapper";
import { ProviderError } from "../errors";
import { ProviderNotImplementedError } from "../worker/errors";
import { NotificationChannel } from "../types/enums";

describe("DeliveryExceptionMapper", () => {
  it("maps a ProviderNotImplementedError to a retryable TEMPORARY_FAILURE (infra not ready, not a permanent business failure)", () => {
    const result = DeliveryExceptionMapper.toProviderResult(
      new ProviderNotImplementedError(NotificationChannel.EMAIL),
      "prov-1",
      42
    );
    assert.equal(result.status, "TEMPORARY_FAILURE");
    assert.equal(result.retryable, true);
    assert.equal(result.providerId, "prov-1");
    assert.equal(result.latencyMs, 42);
    assert.equal(result.errorCode, "PROVIDER_ERROR");
  });

  it("maps any NotificationError subclass using its own code and message", () => {
    const result = DeliveryExceptionMapper.toProviderResult(new ProviderError("boom", "prov-1"), "prov-1", 5);
    assert.equal(result.status, "TEMPORARY_FAILURE");
    assert.equal(result.errorCode, "PROVIDER_ERROR");
    assert.equal(result.errorMessage, "boom");
  });

  it("maps a plain Error to TEMPORARY_FAILURE with UNKNOWN_ERROR", () => {
    const result = DeliveryExceptionMapper.toProviderResult(new Error("network reset"), "prov-1", 5);
    assert.equal(result.status, "TEMPORARY_FAILURE");
    assert.equal(result.errorCode, "UNKNOWN_ERROR");
    assert.equal(result.errorMessage, "network reset");
  });

  it("maps a non-Error thrown value (e.g. a string) without crashing", () => {
    const result = DeliveryExceptionMapper.toProviderResult("just a string", "prov-1", 5);
    assert.equal(result.status, "TEMPORARY_FAILURE");
    assert.equal(result.errorMessage, "just a string");
  });
});
