import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DeliveryAttemptContext } from "./delivery-attempt-context";
import { DeliveryPolicy } from "./delivery-policy";
import { ProviderResults } from "./types/provider-result";
import { fakeJob } from "./test-fakes/fake-job";

function buildContext() {
  return new DeliveryAttemptContext({
    job: fakeJob(),
    content: { subject: "hi" },
    policy: DeliveryPolicy.default(),
    correlationId: "corr-1",
    startedAt: new Date("2026-01-01T00:00:00.000Z"),
  });
}

describe("DeliveryAttemptContext", () => {
  it("starts with no attempts tried and nextAttemptNumber() 1", () => {
    const context = buildContext();
    assert.deepEqual(context.attemptsTried, []);
    assert.equal(context.nextAttemptNumber(), 1);
  });

  it("recordAttempt appends and advances nextAttemptNumber", () => {
    const context = buildContext();
    context.recordAttempt(ProviderResults.temporaryFailure("prov-1", 10));
    assert.equal(context.attemptsTried.length, 1);
    assert.equal(context.nextAttemptNumber(), 2);

    context.recordAttempt(ProviderResults.success("prov-2", 5));
    assert.equal(context.attemptsTried.length, 2);
    assert.equal(context.nextAttemptNumber(), 3);
  });

  it("elapsedMs computes against the given startedAt", () => {
    const context = buildContext();
    const later = new Date("2026-01-01T00:00:02.500Z");
    assert.equal(context.elapsedMs(later), 2500);
  });

  it("exposes the job/content/policy/correlationId it was built with", () => {
    const context = buildContext();
    assert.equal(context.job.id, "job_1");
    assert.equal(context.content.subject, "hi");
    assert.equal(context.correlationId, "corr-1");
    assert.equal(context.policy.maxRetries, 3);
  });
});
