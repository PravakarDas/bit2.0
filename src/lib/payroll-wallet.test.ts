import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { walletClearingDescription, withoutPreviousPayrollClearing } from "./payroll-wallet";

const entry = (description: string, amount: number) => ({ description, amount });

describe("walletClearingDescription", () => {
  it("matches the description payroll writes when it clears a wallet", () => {
    assert.equal(walletClearingDescription("2026-07"), "Adjusted in July-2026 salary");
    assert.equal(walletClearingDescription("2026-01"), "Adjusted in January-2026 salary");
    assert.equal(walletClearingDescription("2025-12"), "Adjusted in December-2025 salary");
  });
});

describe("withoutPreviousPayrollClearing", () => {
  const previous = { month: "2026-07", walletAdjustment: 1264 };

  it("drops the previous payroll's own clearing entry", () => {
    const rows = [entry("Adjusted in July-2026 salary", -1264), entry("Turf bill", 500), entry("Penalty", -200)];
    assert.deepEqual(withoutPreviousPayrollClearing(rows, previous), [entry("Turf bill", 500), entry("Penalty", -200)]);
  });

  it("keeps every real entry, in order", () => {
    const rows = [entry("A", 1), entry("B", 2), entry("Adjusted in July-2026 salary", -1264), entry("C", 3)];
    assert.deepEqual(withoutPreviousPayrollClearing(rows, previous).map((r) => r.description), ["A", "B", "C"]);
  });

  it("keeps an admin-typed entry that only looks like a clearing entry (different amount)", () => {
    const rows = [entry("Adjusted in July-2026 salary", -65000), entry("Adjusted in July-2026 salary", -1264)];
    const result = withoutPreviousPayrollClearing(rows, previous);
    assert.deepEqual(result, [entry("Adjusted in July-2026 salary", -65000)]);
  });

  it("keeps an entry for another month's clearing description", () => {
    const rows = [entry("Adjusted in June-2026 salary", -1264)];
    assert.deepEqual(withoutPreviousPayrollClearing(rows, previous), rows);
  });

  it("removes only one matching entry", () => {
    const rows = [entry("Adjusted in July-2026 salary", -1264), entry("Adjusted in July-2026 salary", -1264)];
    assert.equal(withoutPreviousPayrollClearing(rows, previous).length, 1);
  });

  it("changes nothing when there is no previous payroll or nothing matches", () => {
    const rows = [entry("Turf bill", 500)];
    assert.deepEqual(withoutPreviousPayrollClearing(rows, null), rows);
    assert.deepEqual(withoutPreviousPayrollClearing(rows, previous), rows);
  });

  it("tolerates a rounding difference in the amount", () => {
    const rows = [entry("Adjusted in July-2026 salary", -1264.004)];
    assert.deepEqual(withoutPreviousPayrollClearing(rows, previous), []);
  });

  it("does nothing for a previous payroll that had a zero wallet (it wrote no clearing entry)", () => {
    const rows = [entry("Turf bill", 500)];
    assert.deepEqual(withoutPreviousPayrollClearing(rows, { month: "2026-06", walletAdjustment: 0 }), rows);
  });
});
