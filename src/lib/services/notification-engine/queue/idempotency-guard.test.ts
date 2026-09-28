import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { IdempotencyGuard } from "./idempotency-guard";

describe("IdempotencyGuard.isIdempotencyKeyConflict", () => {
  it("returns true for a P2002 violation targeting idempotencyKey", () => {
    const error = { code: "P2002", meta: { target: ["idempotencyKey"] } };
    assert.equal(IdempotencyGuard.isIdempotencyKeyConflict(error), true);
  });

  it("returns true when idempotencyKey is one of several targeted columns", () => {
    const error = { code: "P2002", meta: { target: ["someOtherColumn", "idempotencyKey"] } };
    assert.equal(IdempotencyGuard.isIdempotencyKeyConflict(error), true);
  });

  it("returns false for a P2002 violation targeting a different column", () => {
    const error = { code: "P2002", meta: { target: ["dedupeKey"] } };
    assert.equal(IdempotencyGuard.isIdempotencyKeyConflict(error), false);
  });

  it("returns false for a different Prisma error code", () => {
    const error = { code: "P2025", meta: { target: ["idempotencyKey"] } };
    assert.equal(IdempotencyGuard.isIdempotencyKeyConflict(error), false);
  });

  it("returns false when meta is missing entirely", () => {
    const error = { code: "P2002" };
    assert.equal(IdempotencyGuard.isIdempotencyKeyConflict(error), false);
  });

  it("returns false for null, undefined, and non-object values", () => {
    assert.equal(IdempotencyGuard.isIdempotencyKeyConflict(null), false);
    assert.equal(IdempotencyGuard.isIdempotencyKeyConflict(undefined), false);
    assert.equal(IdempotencyGuard.isIdempotencyKeyConflict("some string error"), false);
    assert.equal(IdempotencyGuard.isIdempotencyKeyConflict(42), false);
  });

  it("returns false for a plain Error instance with no Prisma error code", () => {
    assert.equal(IdempotencyGuard.isIdempotencyKeyConflict(new Error("boom")), false);
  });
});
