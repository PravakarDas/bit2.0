import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canApproveLeave, resolveApproverLabel } from "./leave-authorization";
import type { ApproverCandidate } from "./leave-authorization";

function candidate(overrides: Partial<ApproverCandidate> = {}): ApproverCandidate {
  return { role: "EMPLOYEE", isManager: false, firstName: null, lastName: null, ...overrides };
}

describe("canApproveLeave — Phase 16 authorization rule", () => {
  it("A/C. SUPERADMIN is authorized", () => {
    assert.equal(canApproveLeave(candidate({ role: "SUPERADMIN" })), true);
  });

  it("A/C. HR is authorized", () => {
    assert.equal(canApproveLeave(candidate({ role: "HR" })), true);
  });

  it("A/C. an EMPLOYEE with isManager:true is authorized", () => {
    assert.equal(canApproveLeave(candidate({ role: "EMPLOYEE", isManager: true })), true);
  });

  it("C/D. a plain EMPLOYEE (isManager:false) is not authorized", () => {
    assert.equal(canApproveLeave(candidate({ role: "EMPLOYEE", isManager: false })), false);
  });

  it("C/D. null/undefined (no signed-in user resolved) is not authorized", () => {
    assert.equal(canApproveLeave(null), false);
    assert.equal(canApproveLeave(undefined), false);
  });

  it("E. is driven entirely by role/isManager — no field on ApproverCandidate accepts an arbitrary client-supplied identity/role string, so there is no way to impersonate an authorized approver through this function's input", () => {
    // The only way to pass canApproveLeave is for the actual resolved
    // database user to have role SUPERADMIN/HR, or isManager:true — both
    // are read from the verified `getDbUser()` result in leave.actions.ts,
    // never from a caller-supplied argument. A plain employee cannot become
    // authorized by any value they could pass as `firstName`/`lastName`.
    assert.equal(canApproveLeave(candidate({ role: "EMPLOYEE", isManager: false, firstName: "SUPERADMIN", lastName: "HR" })), false);
  });
});

describe("resolveApproverLabel — Phase 16 (never derived from client input)", () => {
  it("prefers a real display name when the verified user has one", () => {
    assert.equal(resolveApproverLabel(candidate({ role: "SUPERADMIN", firstName: "Jane", lastName: "Doe" })), "Jane Doe");
  });

  it("falls back to a role label for SUPERADMIN with no name on file", () => {
    assert.equal(resolveApproverLabel(candidate({ role: "SUPERADMIN" })), "Admin");
  });

  it("falls back to a role label for HR with no name on file", () => {
    assert.equal(resolveApproverLabel(candidate({ role: "HR" })), "HR");
  });

  it("falls back to 'Manager' for an EMPLOYEE manager with no name on file", () => {
    assert.equal(resolveApproverLabel(candidate({ role: "EMPLOYEE", isManager: true })), "Manager");
  });

  it("trims and joins first/last name, ignoring a blank-but-present name in favor of the role fallback", () => {
    assert.equal(resolveApproverLabel(candidate({ role: "HR", firstName: "  ", lastName: "  " })), "HR");
  });
});
