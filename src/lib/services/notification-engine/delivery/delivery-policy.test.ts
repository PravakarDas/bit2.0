import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DeliveryPolicy } from "./delivery-policy";
import { ValidationError } from "../errors";

describe("DeliveryPolicy", () => {
  it("default() returns sane, structural defaults", () => {
    const policy = DeliveryPolicy.default();
    assert.equal(policy.maxRetries, 3);
    assert.equal(policy.timeoutMs, 30_000);
    assert.equal(policy.maxSizeBytes, null);
    assert.equal(policy.maxRecipients, null);
    assert.equal(policy.rateLimit, null);
  });

  it("create() accepts a full override", () => {
    const policy = DeliveryPolicy.create({
      maxRetries: 5,
      timeoutMs: 10_000,
      maxSizeBytes: 1_000_000,
      maxRecipients: 50,
      rateLimit: { maxPerInterval: 10, intervalMs: 1000 },
    });
    assert.equal(policy.maxRetries, 5);
    assert.equal(policy.maxSizeBytes, 1_000_000);
    assert.deepEqual(policy.rateLimit, { maxPerInterval: 10, intervalMs: 1000 });
  });

  it("rejects a negative maxRetries", () => {
    assert.throws(() => DeliveryPolicy.create({ maxRetries: -1 }), ValidationError);
  });

  it("rejects a non-integer maxRetries", () => {
    assert.throws(() => DeliveryPolicy.create({ maxRetries: 1.5 }), ValidationError);
  });

  it("rejects a non-positive timeoutMs", () => {
    assert.throws(() => DeliveryPolicy.create({ timeoutMs: 0 }), ValidationError);
  });

  it("rejects a non-positive maxSizeBytes when provided", () => {
    assert.throws(() => DeliveryPolicy.create({ maxSizeBytes: -5 }), ValidationError);
  });

  it("rejects a non-positive maxRecipients when provided", () => {
    assert.throws(() => DeliveryPolicy.create({ maxRecipients: 0 }), ValidationError);
  });

  it("allows maxSizeBytes/maxRecipients to be omitted (stays null)", () => {
    const policy = DeliveryPolicy.create({});
    assert.equal(policy.maxSizeBytes, null);
    assert.equal(policy.maxRecipients, null);
  });
});
