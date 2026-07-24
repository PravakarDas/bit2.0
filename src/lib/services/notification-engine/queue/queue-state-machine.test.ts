import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { QueueStateMachine } from "./queue-state-machine";

describe("QueueStateMachine", () => {
  it("allows QUEUED -> PROCESSING (claiming)", () => {
    assert.equal(QueueStateMachine.canTransition("QUEUED", "PROCESSING"), true);
  });

  it("allows QUEUED -> DEAD_LETTER (cancel)", () => {
    assert.equal(QueueStateMachine.canTransition("QUEUED", "DEAD_LETTER"), true);
  });

  it("does not allow QUEUED -> SENT directly", () => {
    assert.equal(QueueStateMachine.canTransition("QUEUED", "SENT"), false);
  });

  it("does not allow QUEUED -> COMPLETED directly", () => {
    assert.equal(QueueStateMachine.canTransition("QUEUED", "COMPLETED"), false);
  });

  it("allows PROCESSING -> SENT, RETRY_SCHEDULED, DEAD_LETTER, and QUEUED", () => {
    assert.equal(QueueStateMachine.canTransition("PROCESSING", "SENT"), true);
    assert.equal(QueueStateMachine.canTransition("PROCESSING", "RETRY_SCHEDULED"), true);
    assert.equal(QueueStateMachine.canTransition("PROCESSING", "DEAD_LETTER"), true);
    assert.equal(QueueStateMachine.canTransition("PROCESSING", "QUEUED"), true);
  });

  it("does not allow PROCESSING -> COMPLETED directly (must go through SENT)", () => {
    assert.equal(QueueStateMachine.canTransition("PROCESSING", "COMPLETED"), false);
  });

  it("allows RETRY_SCHEDULED -> PROCESSING (claim-and-promote in one step) and -> DEAD_LETTER (cancel)", () => {
    assert.equal(QueueStateMachine.canTransition("RETRY_SCHEDULED", "PROCESSING"), true);
    assert.equal(QueueStateMachine.canTransition("RETRY_SCHEDULED", "DEAD_LETTER"), true);
  });

  it("does not allow RETRY_SCHEDULED -> QUEUED as a persisted intermediate step", () => {
    // Per this phase's documented interpretation, promotion happens atomically inside claim, not as its own transition.
    assert.equal(QueueStateMachine.canTransition("RETRY_SCHEDULED", "QUEUED"), false);
  });

  it("allows SENT -> COMPLETED only", () => {
    assert.equal(QueueStateMachine.canTransition("SENT", "COMPLETED"), true);
    assert.equal(QueueStateMachine.canTransition("SENT", "QUEUED"), false);
    assert.equal(QueueStateMachine.canTransition("SENT", "PROCESSING"), false);
  });

  it("allows FAILED -> DEAD_LETTER only (the unconditional cascade)", () => {
    assert.equal(QueueStateMachine.canTransition("FAILED", "DEAD_LETTER"), true);
    assert.equal(QueueStateMachine.canTransition("FAILED", "QUEUED"), false);
  });

  it("allows DEAD_LETTER -> QUEUED only (manual resend)", () => {
    assert.equal(QueueStateMachine.canTransition("DEAD_LETTER", "QUEUED"), true);
    assert.equal(QueueStateMachine.canTransition("DEAD_LETTER", "PROCESSING"), false);
  });

  it("treats COMPLETED as fully terminal — no outgoing transitions", () => {
    assert.deepEqual(QueueStateMachine.allowedTransitionsFrom("COMPLETED"), []);
    assert.equal(QueueStateMachine.isTerminal("COMPLETED"), true);
  });

  it("isTerminal is false for every non-terminal status", () => {
    assert.equal(QueueStateMachine.isTerminal("QUEUED"), false);
    assert.equal(QueueStateMachine.isTerminal("PROCESSING"), false);
    assert.equal(QueueStateMachine.isTerminal("RETRY_SCHEDULED"), false);
    assert.equal(QueueStateMachine.isTerminal("SENT"), false);
    assert.equal(QueueStateMachine.isTerminal("FAILED"), false);
    assert.equal(QueueStateMachine.isTerminal("DEAD_LETTER"), false);
  });

  it("allowedTransitionsFrom returns the exact allowed set for PROCESSING", () => {
    const allowed = QueueStateMachine.allowedTransitionsFrom("PROCESSING");
    assert.deepEqual([...allowed].sort(), ["DEAD_LETTER", "QUEUED", "RETRY_SCHEDULED", "SENT"].sort());
  });
});
