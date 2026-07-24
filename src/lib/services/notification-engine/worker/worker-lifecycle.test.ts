import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorkerLifecycle } from "./worker-lifecycle";
import { QueueError } from "../errors";

describe("WorkerLifecycle", () => {
  it("starts in STOPPED", () => {
    const lifecycle = new WorkerLifecycle();
    assert.equal(lifecycle.state, "STOPPED");
  });

  it("applies a valid transition and updates `since`", () => {
    const lifecycle = new WorkerLifecycle();
    const before = lifecycle.since;
    const at = new Date(before.getTime() + 1000);
    lifecycle.transition("STARTING", at);
    assert.equal(lifecycle.state, "STARTING");
    assert.equal(lifecycle.since.getTime(), at.getTime());
  });

  it("throws QueueError on an invalid transition and does not mutate state", () => {
    const lifecycle = new WorkerLifecycle();
    assert.throws(() => lifecycle.transition("PROCESSING"), QueueError);
    assert.equal(lifecycle.state, "STOPPED");
  });

  it("canTransition is a non-throwing check matching the same rules as transition()", () => {
    const lifecycle = new WorkerLifecycle();
    assert.equal(lifecycle.canTransition("STARTING"), true);
    assert.equal(lifecycle.canTransition("PROCESSING"), false);
  });

  it("records transition history in order", () => {
    const lifecycle = new WorkerLifecycle();
    lifecycle.transition("STARTING");
    lifecycle.transition("IDLE");
    lifecycle.transition("CLAIM_JOB");
    const history = lifecycle.getHistory();
    assert.deepEqual(
      history.map((h) => `${h.from}->${h.to}`),
      ["STOPPED->STARTING", "STARTING->IDLE", "IDLE->CLAIM_JOB"]
    );
  });

  it("bounds history to the last 50 transitions", () => {
    const lifecycle = new WorkerLifecycle();
    lifecycle.transition("STARTING");
    lifecycle.transition("IDLE");
    // Oscillate IDLE <-> PAUSED enough times to exceed the 50-entry cap.
    for (let i = 0; i < 60; i++) {
      lifecycle.transition("PAUSED");
      lifecycle.transition("IDLE");
    }
    assert.ok(lifecycle.getHistory().length <= 50);
  });
});
