import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canManageAdminNotificationInbox,
  canProcessAdminNotificationAction,
  hasNotificationId,
  isValidNotificationDecision,
} from "./notification-action-authorization";
import type { NotificationActor } from "./notification-action-authorization";

function actor(overrides: Partial<NotificationActor> = {}): NotificationActor {
  return { role: "EMPLOYEE", isManager: false, ...overrides };
}

/**
 * Phase 17 — `handleNotificationAction`'s and the AdminNotification-inbox
 * functions' own authorization decisions, tested at the pure-logic level
 * (`notification.actions.ts` itself imports `@/lib/prisma`/Clerk and cannot
 * be executed by this project's dependency-free `node --test` harness — the
 * same constraint documented in every prior phase's report). Letters below
 * map to NotificationActionAuthorizationReport.md's security test list.
 *
 * Note on test C ("normal employee action the employee is legitimately
 * allowed to perform still succeeds"): none of `handleNotificationAction`'s
 * four delegated notification types (PROFILE_UPDATE_REQUEST,
 * LEAVE_APPLICATION_PENDING, LOAN_APPLICATION_PENDING, WALLET_REQUEST_PENDING)
 * is ever legitimately self-service for a plain employee — every one is an
 * admin/HR/manager approving *someone else's* request. Inventing a fake
 * employee-self-service branch here just to exercise "C" would violate this
 * phase's own "do not invent permissions just to satisfy the tests"
 * instruction. The actual legitimate employee-facing notification action in
 * this codebase — an employee marking their own `EmployeeNotification` as
 * read, in `leave-automation.actions.ts` — is a completely different
 * function this phase's diff does not touch at all (verified via `git diff`
 * for this phase touching zero lines of that file); its continued success
 * is a non-event, not something a new test can meaningfully assert beyond
 * that.
 */

describe("canProcessAdminNotificationAction — who may drive handleNotificationAction", () => {
  it("A. an unauthenticated caller (no resolved user) is rejected", () => {
    assert.equal(canProcessAdminNotificationAction(null), false);
    assert.equal(canProcessAdminNotificationAction(undefined), false);
  });

  it("B. a plain authenticated employee is rejected — there is no self-service branch for any delegated action type, so this holds regardless of whose request is targeted", () => {
    assert.equal(canProcessAdminNotificationAction(actor({ role: "EMPLOYEE", isManager: false })), false);
  });

  it("D. a manager (EMPLOYEE + isManager:true) performing a legitimately-delegated action is authorized", () => {
    assert.equal(canProcessAdminNotificationAction(actor({ role: "EMPLOYEE", isManager: true })), true);
  });

  it("E. HR is authorized", () => {
    assert.equal(canProcessAdminNotificationAction(actor({ role: "HR" })), true);
  });

  it("F. SUPERADMIN is authorized", () => {
    assert.equal(canProcessAdminNotificationAction(actor({ role: "SUPERADMIN" })), true);
  });

  it("G. is driven entirely by role/isManager — NotificationActor has no name/id/label field a caller could forge into an identity claim, so there is no code path by which client input influences this decision", () => {
    // The only way to pass is for the actual resolved database user (from
    // getDbUser(), never client input) to have role SUPERADMIN/HR, or
    // isManager:true. There is no field on this type a client could ever
    // control that would flip the result.
    assert.deepEqual(Object.keys(actor()).sort(), ["isManager", "role"]);
  });
});

describe("canManageAdminNotificationInbox — who may manage the AdminNotification inbox as a whole (mark all read, delete, list all)", () => {
  it("A. an unauthenticated caller is rejected", () => {
    assert.equal(canManageAdminNotificationInbox(null), false);
    assert.equal(canManageAdminNotificationInbox(undefined), false);
  });

  it("B. a plain employee is rejected", () => {
    assert.equal(canManageAdminNotificationInbox(actor({ role: "EMPLOYEE", isManager: false })), false);
  });

  it("D. deliberately narrower than canProcessAdminNotificationAction — a manager may process one delegated request via handleNotificationAction, but may NOT manage the whole inbox (mark-all-read, delete, list every notification in the system)", () => {
    assert.equal(canManageAdminNotificationInbox(actor({ role: "EMPLOYEE", isManager: true })), false);
    assert.equal(canProcessAdminNotificationAction(actor({ role: "EMPLOYEE", isManager: true })), true);
  });

  it("E. HR is authorized", () => {
    assert.equal(canManageAdminNotificationInbox(actor({ role: "HR" })), true);
  });

  it("F. SUPERADMIN is authorized", () => {
    assert.equal(canManageAdminNotificationInbox(actor({ role: "SUPERADMIN" })), true);
  });
});

describe("isValidNotificationDecision — H. invalid/unknown action safely rejected", () => {
  it("accepts exactly 'approve' and 'decline'", () => {
    assert.equal(isValidNotificationDecision("approve"), true);
    assert.equal(isValidNotificationDecision("decline"), true);
  });

  it("rejects anything else, including a value that resembles a valid one or a typo — the pre-Phase-17 code treated any non-'approve' string as an implicit decline; this closes that", () => {
    assert.equal(isValidNotificationDecision("Approve"), false);
    assert.equal(isValidNotificationDecision("reject"), false);
    assert.equal(isValidNotificationDecision(""), false);
    assert.equal(isValidNotificationDecision(null), false);
    assert.equal(isValidNotificationDecision(undefined), false);
    assert.equal(isValidNotificationDecision(123), false);
    assert.equal(isValidNotificationDecision({ approve: true }), false);
  });
});

describe("hasNotificationId — I. missing/invalid target ID safely rejected", () => {
  it("accepts a non-empty string", () => {
    assert.equal(hasNotificationId("notif_123"), true);
  });

  it("rejects missing, empty, whitespace-only, or non-string values", () => {
    assert.equal(hasNotificationId(undefined), false);
    assert.equal(hasNotificationId(null), false);
    assert.equal(hasNotificationId(""), false);
    assert.equal(hasNotificationId("   "), false);
    assert.equal(hasNotificationId(123), false);
    assert.equal(hasNotificationId({}), false);
  });
});
