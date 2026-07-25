import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FailoverDeliveryStrategy } from "./delivery-strategy";
import { DeliveryAttemptContext } from "./delivery-attempt-context";
import { DeliveryPolicy } from "./delivery-policy";
import { ProviderResults } from "./types/provider-result";
import { ProviderContext } from "./provider";
import { createProviderDescriptor } from "./types/provider-descriptor";
import { ProviderPriority } from "./value-objects/provider-priority";
import { FakeDeliveryProvider } from "./test-fakes/fake-delivery-provider";
import { fakeJob } from "./test-fakes/fake-job";
import { NotificationChannel } from "../types/enums";
import type { RegisteredProvider } from "./types";

function candidate(id: string, priority: number): RegisteredProvider {
  return {
    descriptor: createProviderDescriptor({ id, name: id, channel: NotificationChannel.EMAIL, priority: ProviderPriority.of(priority) }),
    provider: new FakeDeliveryProvider(),
  };
}

function buildContext() {
  return new DeliveryAttemptContext({
    job: fakeJob(),
    content: {},
    policy: DeliveryPolicy.default(),
    correlationId: "corr-1",
    startedAt: new Date(),
  });
}

function buildProviderContext(candidate: RegisteredProvider, attemptNumber: number): ProviderContext {
  return new ProviderContext({
    providerId: candidate.descriptor.id,
    providerName: candidate.descriptor.name,
    channel: candidate.descriptor.channel,
    capabilities: candidate.descriptor.capabilities,
    attemptNumber,
    correlationId: "corr-1",
  });
}

describe("FailoverDeliveryStrategy", () => {
  it("stops at the first SUCCESS without trying later candidates", async () => {
    const calls: string[] = [];
    const strategy = new FailoverDeliveryStrategy();
    const candidates = [candidate("a", 1), candidate("b", 2)];

    const outcome = await strategy.execute(
      candidates,
      buildContext(),
      async (candidate) => {
        calls.push(candidate.descriptor.id);
        return ProviderResults.success(candidate.descriptor.id, 1);
      },
      buildProviderContext
    );

    assert.deepEqual(calls, ["a"]);
    assert.equal(outcome.kind, "SUCCESS");
    if (outcome.kind === "SUCCESS") assert.equal(outcome.providerId, "a");
  });

  it("fails over to the next candidate on TEMPORARY_FAILURE", async () => {
    const calls: string[] = [];
    const strategy = new FailoverDeliveryStrategy();
    const candidates = [candidate("a", 1), candidate("b", 2)];

    const outcome = await strategy.execute(
      candidates,
      buildContext(),
      async (candidate) => {
        calls.push(candidate.descriptor.id);
        return candidate.descriptor.id === "a"
          ? ProviderResults.temporaryFailure("a", 1)
          : ProviderResults.success("b", 1);
      },
      buildProviderContext
    );

    assert.deepEqual(calls, ["a", "b"]);
    assert.equal(outcome.kind, "SUCCESS");
  });

  it("stops immediately on PERMANENT_FAILURE without trying remaining candidates", async () => {
    const calls: string[] = [];
    const strategy = new FailoverDeliveryStrategy();
    const candidates = [candidate("a", 1), candidate("b", 2)];

    const outcome = await strategy.execute(
      candidates,
      buildContext(),
      async (candidate) => {
        calls.push(candidate.descriptor.id);
        return ProviderResults.permanentFailure("a", 1);
      },
      buildProviderContext
    );

    assert.deepEqual(calls, ["a"]);
    assert.equal(outcome.kind, "PERMANENT_FAILURE");
  });

  it("returns overall TEMPORARY_FAILURE once every candidate has failed transiently", async () => {
    const strategy = new FailoverDeliveryStrategy();
    const candidates = [candidate("a", 1), candidate("b", 2)];

    const outcome = await strategy.execute(
      candidates,
      buildContext(),
      async (candidate) => ProviderResults.temporaryFailure(candidate.descriptor.id, 1),
      buildProviderContext
    );

    assert.equal(outcome.kind, "TEMPORARY_FAILURE");
    assert.equal(outcome.attempts.length, 2);
  });

  it("returns TEMPORARY_FAILURE with zero attempts for an empty candidate list", async () => {
    const strategy = new FailoverDeliveryStrategy();
    const outcome = await strategy.execute([], buildContext(), async () => ProviderResults.success("x", 1), buildProviderContext);
    assert.equal(outcome.kind, "TEMPORARY_FAILURE");
    assert.deepEqual(outcome.attempts, []);
  });

  it("records every attempt onto the shared DeliveryAttemptContext", async () => {
    const strategy = new FailoverDeliveryStrategy();
    const candidates = [candidate("a", 1), candidate("b", 2)];
    const context = buildContext();

    await strategy.execute(
      candidates,
      context,
      async (candidate) =>
        candidate.descriptor.id === "a" ? ProviderResults.temporaryFailure("a", 1) : ProviderResults.success("b", 1),
      buildProviderContext
    );

    assert.equal(context.attemptsTried.length, 2);
  });
});
