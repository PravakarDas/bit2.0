import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ChannelAdapterFactory, type ChannelDeliveryOutcome, type NotificationChannelAdapter, type RenderedNotificationContent } from "../factories";
import type { NotificationJobDTO } from "../dto";
import { JobDispatcher } from "./job-dispatcher";
import { ExecutionContext } from "./execution-context";
import { ProviderNotImplementedError } from "./errors";
import { registerStubChannelAdapters } from "./channel-adapters";

function fakeJob(overrides: Partial<NotificationJobDTO> = {}): NotificationJobDTO {
  const now = new Date();
  return {
    id: "job_1",
    eventId: "evt_1",
    channel: "EMAIL",
    recipientUserId: null,
    recipientAddress: "jane@example.com",
    idempotencyKey: "key_1",
    status: "PROCESSING",
    attemptCount: 0,
    maxAttempts: 5,
    nextAttemptAt: now,
    lockedAt: now,
    lockedBy: "worker-1",
    documentId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Mock Provider Adapter — controllable success/failure/hang, per this phase's explicit testing instruction. */
class MockAdapter implements NotificationChannelAdapter {
  readonly channel = "EMAIL" as const;
  constructor(
    private readonly behavior:
      | { kind: "succeed"; result: ChannelDeliveryOutcome }
      | { kind: "throw"; error: unknown }
      | { kind: "hang" }
  ) {}

  async send(_job: NotificationJobDTO, _content: RenderedNotificationContent): Promise<ChannelDeliveryOutcome> {
    if (this.behavior.kind === "succeed") return this.behavior.result;
    if (this.behavior.kind === "throw") throw this.behavior.error;
    return new Promise(() => {}); // never resolves — for cancellation tests
  }
}

describe("JobDispatcher.dispatch", () => {
  it("returns SUCCESS when the adapter resolves", async () => {
    const factory = new ChannelAdapterFactory();
    factory.register(new MockAdapter({ kind: "succeed", result: { outcome: "SUCCESS" } }));
    const dispatcher = new JobDispatcher(factory);
    const job = fakeJob();
    const context = new ExecutionContext(job, "worker-1");

    const outcome = await dispatcher.dispatch(job, context);
    assert.equal(outcome.kind, "SUCCESS");
  });

  it("returns PROVIDER_NOT_IMPLEMENTED when no real adapter is registered (empty factory)", async () => {
    const factory = new ChannelAdapterFactory(); // nothing registered
    const dispatcher = new JobDispatcher(factory);
    const job = fakeJob();
    const context = new ExecutionContext(job, "worker-1");

    const outcome = await dispatcher.dispatch(job, context);
    assert.equal(outcome.kind, "PROVIDER_NOT_IMPLEMENTED");
  });

  it("returns PROVIDER_NOT_IMPLEMENTED for every channel once stub adapters are registered (registerStubChannelAdapters)", async () => {
    const factory = new ChannelAdapterFactory();
    registerStubChannelAdapters(factory);
    const dispatcher = new JobDispatcher(factory);
    const job = fakeJob({ channel: "SMS" });
    const context = new ExecutionContext(job, "worker-1");

    const outcome = await dispatcher.dispatch(job, context);
    assert.equal(outcome.kind, "PROVIDER_NOT_IMPLEMENTED");
    if (outcome.kind === "PROVIDER_NOT_IMPLEMENTED") {
      assert.ok(outcome.error instanceof ProviderNotImplementedError);
      assert.equal(outcome.error.channel, "SMS");
    }
  });

  it("returns FAILURE when the adapter throws a generic error", async () => {
    const factory = new ChannelAdapterFactory();
    factory.register(new MockAdapter({ kind: "throw", error: new Error("network blip") }));
    const dispatcher = new JobDispatcher(factory);
    const job = fakeJob();
    const context = new ExecutionContext(job, "worker-1");

    const outcome = await dispatcher.dispatch(job, context);
    assert.equal(outcome.kind, "FAILURE");
  });

  it("returns CANCELLED when the execution context is cancelled before dispatch begins", async () => {
    const factory = new ChannelAdapterFactory();
    factory.register(new MockAdapter({ kind: "hang" }));
    const dispatcher = new JobDispatcher(factory);
    const job = fakeJob();
    const context = new ExecutionContext(job, "worker-1");
    context.cancel("test cancellation");

    const outcome = await dispatcher.dispatch(job, context);
    assert.equal(outcome.kind, "CANCELLED");
  });

  it("returns CANCELLED when the context is cancelled while the adapter call is in flight", async () => {
    const factory = new ChannelAdapterFactory();
    factory.register(new MockAdapter({ kind: "hang" }));
    const dispatcher = new JobDispatcher(factory);
    const job = fakeJob();
    const context = new ExecutionContext(job, "worker-1");

    const dispatchPromise = dispatcher.dispatch(job, context);
    context.cancel("mid-flight cancellation");
    const outcome = await dispatchPromise;
    assert.equal(outcome.kind, "CANCELLED");
  });
});
