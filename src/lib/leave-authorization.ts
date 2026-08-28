/**
 * Pure, dependency-free leave-approval authorization logic (Phase 16),
 * extracted out of `src/actions/leave.actions.ts` for the same reason
 * `smtp-shared.ts`/`crypto.ts` were: this file imports nothing from
 * `@/lib/prisma` or Clerk, so it can be unit-tested by this project's
 * dependency-free `node --test` harness — `leave.actions.ts` itself cannot
 * be imported by that harness at all (it transitively pulls in Prisma).
 *
 * `ApproverCandidate` is a plain shape, not `Awaited<ReturnType<typeof
 * getDbUser>>` — the caller (`leave.actions.ts`) passes its already-resolved
 * `getDbUser()` result in; this module never touches the database or Clerk
 * session itself, and is Prisma-free so it can be tested at all.
 */
export interface ApproverCandidate {
  role: "SUPERADMIN" | "HR" | "EMPLOYEE";
  isManager: boolean;
  firstName?: string | null;
  lastName?: string | null;
}

/**
 * Who may approve/reject a leave application. A three-way "admin-or-HR-or-manager"
 * check (SUPERADMIN | HR | manager), matching the same pattern already used
 * for other approval-style actions across this codebase (e.g.
 * `timeline.actions.ts`'s `canUpdateTimeline`, `loan.actions.ts`/
 * `overtime-request.actions.ts`/`medical.actions.ts`'s SUPERADMIN-or-HR
 * checks) — deliberately NOT `leave.actions.ts`'s own `canManageOrganization`,
 * which excludes HR and is scoped to org-configuration mutations (leave
 * types, entitlements), a different permission class from approving an
 * individual employee's leave request.
 *
 * "Manager" here is unscoped (any `isManager: true` user, not limited to
 * their own direct reports) — this application has no manager/direct-report
 * relation in its schema, so every other manager-gated action in this
 * codebase uses the same unscoped check.
 *
 * A type predicate (`user is ApproverCandidate`) so callers get TypeScript
 * narrowing for free after the check, instead of needing a second null
 * guard before reading `user.role`/`user.firstName`/etc.
 */
export function canApproveLeave(user: ApproverCandidate | null | undefined): user is ApproverCandidate {
  return !!user && (user.role === "SUPERADMIN" || user.role === "HR" || (user.role === "EMPLOYEE" && user.isManager));
}

/**
 * Real display name if available, otherwise a role-based label. Always
 * derived from a server-verified `ApproverCandidate` — never from any
 * client-supplied string. This is the fix for the pre-existing Phase 15
 * finding: `approveLeaveApplication`/`rejectLeaveApplication` used to accept
 * an `approvedBy` string directly from the caller (a client component
 * passing `"admin"`/`"manager"` literals, and a second call site that
 * accidentally passed a free-text admin note into the same slot) and both
 * store it verbatim and trust it as the "who approved" identity. That string
 * is no longer read for identity at all — this function replaces it.
 */
export function resolveApproverLabel(user: ApproverCandidate): string {
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  if (name) return name;
  if (user.role === "SUPERADMIN") return "Admin";
  if (user.role === "HR") return "HR";
  return "Manager";
}
