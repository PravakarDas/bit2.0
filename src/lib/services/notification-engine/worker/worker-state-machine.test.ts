import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorkerStateMachine } from "./worker-state-machine";

describe("WorkerStateMachine", () => {
  it("allows STOPPED -> STARTING only", () => {
    assert.equal(WorkerStateMachine.canTransition("STOPPED", "STARTING"), true);
    assert.equal(WorkerStateMachine.canTransition("STOPPED", "IDLE"), false);
  });

  it("allows STARTING -> IDLE and STOPPING", () => {
    assert.equal(WorkerStateMachine.canTransition("STARTING", "IDLE"), true);
    assert.equal(WorkerStateMachine.canTransition("STARTING", "STOPPING"), true);
    assert.equal(WorkerStateMachine.canTransition("STARTING", "PROCESSING"), false);
  });

  it("allows IDLE -> CLAIM_JOB, PAUSED, STOPPING", () => {
    assert.equal(WorkerStateMachine.canTransition("IDLE", "CLAIM_JOB"), true);
    assert.equal(WorkerStateMachine.canTransition("IDLE", "PAUSED"), true);
    assert.equal(WorkerStateMachine.canTransition("IDLE", "STOPPING"), true);
    assert.equal(WorkerStateMachine.canTransition("IDLE", "PROCESSING"), false);
  });

  it("allows CLAIM_JOB -> PROCESSING, IDLE, RECOVERING, STOPPING", () => {
    assert.equal(WorkerStateMachine.canTransition("CLAIM_JOB", "PROCESSING"), true);
    assert.equal(WorkerStateMachine.canTransition("CLAIM_JOB", "IDLE"), true);
    assert.equal(WorkerStateMachine.canTransition("CLAIM_JOB", "RECOVERING"), true);
    assert.equal(WorkerStateMachine.canTransition("CLAIM_JOB", "STOPPING"), true);
    assert.equal(WorkerStateMachine.canTransition("CLAIM_JOB", "COMPLETE"), false);
  });

  it("allows PROCESSING -> COMPLETE, RECOVERING, STOPPING", () => {
    assert.equal(WorkerStateMachine.canTransition("PROCESSING", "COMPLETE"), true);
    assert.equal(WorkerStateMachine.canTransition("PROCESSING", "RECOVERING"), true);
    assert.equal(WorkerStateMachine.canTransition("PROCESSING", "STOPPING"), true);
    assert.equal(WorkerStateMachine.canTransition("PROCESSING", "IDLE"), false);
  });

  it("COMPLETE always returns to IDLE, nowhere else", () => {
    assert.equal(WorkerStateMachine.canTransition("COMPLETE", "IDLE"), true);
    assert.deepEqual(WorkerStateMachine.allowedTransitionsFrom("COMPLETE"), ["IDLE"]);
  });

  it("RECOVERING can return to IDLE or give up to STOPPING", () => {
    assert.equal(WorkerStateMachine.canTransition("RECOVERING", "IDLE"), true);
    assert.equal(WorkerStateMachine.canTransition("RECOVERING", "STOPPING"), true);
    assert.equal(WorkerStateMachine.canTransition("RECOVERING", "PROCESSING"), false);
  });

  it("PAUSED can resume to IDLE or stop", () => {
    assert.equal(WorkerStateMachine.canTransition("PAUSED", "IDLE"), true);
    assert.equal(WorkerStateMachine.canTransition("PAUSED", "STOPPING"), true);
  });

  it("STOPPING always finishes at STOPPED, nowhere else", () => {
    assert.deepEqual(WorkerStateMachine.allowedTransitionsFrom("STOPPING"), ["STOPPED"]);
  });

  it("every state has at least one outgoing edge — no dead ends, unlike QueueStateMachine's COMPLETED", () => {
    const states: Array<Parameters<typeof WorkerStateMachine.allowedTransitionsFrom>[0]> = [
      "STOPPED", "STARTING", "IDLE", "CLAIM_JOB", "PROCESSING", "COMPLETE", "RECOVERING", "PAUSED", "STOPPING",
    ];
    for (const state of states) {
      assert.ok(WorkerStateMachine.allowedTransitionsFrom(state).length > 0, `${state} should have at least one outgoing transition`);
    }
  });
});
