/**
 * Pure, dependency-free authorization logic for `src/actions/notification.actions.ts`
 * (Phase 17), extracted for the same reason `leave-authorization.ts` (Phase 16) and
 * `smtp-shared.ts`/`crypto.ts` were: no `@/lib/prisma`/Clerk import, so it can be
 * unit-tested by this project's dependency-free `node --test` harness —
 * `notification.actions.ts` itself cannot be imported by that harness at all.
 *
 * Deliberately NOT shared with `leave-authorization.ts` even though the first
 * rule below has identical boolean logic to `canApproveLeave` — this
 * codebase's own convention (see CLAUDE.md's "Permission checks are
 * per-function, not centralized... copy the pattern from a sibling function")
 * is to keep each action file's authorization local to that file's own
 * domain rather than importing a shared cross-domain permission helper, even
 * when the underlying rule happens to coincide.
 */
export interface NotificationActor {
  role: "SUPERADMIN" | "HR" | "EMPLOYEE";
  isManager: boolean;
}

/**
 * Who may drive `handleNotificationAction` — approve/decline a request via
 * the admin notification bell. A three-way "admin-or-HR-or-manager" check,
 * matching the *loosest* requirement among everything this function can
 * delegate to (`approveProfileUpdateRequest`/`rejectProfileUpdateRequest`
 * and `approveLeaveApplication`/`rejectLeaveApplication` both already allow
 * SUPERADMIN, HR, or a manager) — `handleNotificationAction` must not be
 * more restrictive than the actions it forwards to, or it would incorrectly
 * block a manager who is genuinely entitled to approve a leave/profile
 * request through this surface. The delegated actions still separately
 * enforce their own precise rule underneath (defense in depth, and the
 * reason `handleNotificationAction`'s own gate does not need to be
 * type-specific) — see `NotificationActionAuthorizationReport.md`.
 */
export function canProcessAdminNotificationAction(user: NotificationActor | null | undefined): user is NotificationActor {
  return !!user && (user.role === "SUPERADMIN" || user.role === "HR" || (user.role === "EMPLOYEE" && user.isManager));
}

/**
 * Who may manage the shared `AdminNotification` inbox as a whole — read the
 * full feed/count, mark items read/unread, delete items. Narrower than
 * `canProcessAdminNotificationAction`: SUPERADMIN or HR only, matching this
 * file's own pre-existing precedent (`getUnreadNotifications`'s
 * `['SUPERADMIN', 'HR'].includes(user.role)` check, unchanged by this
 * phase) rather than inventing a new rule. A manager approving one specific
 * delegated request through `handleNotificationAction` is a different
 * permission class from general inbox administration (viewing every
 * notification in the system, bulk-marking, deleting audit records) — this
 * codebase gives no evidence managers were ever meant to have the latter.
 */
export function canManageAdminNotificationInbox(user: NotificationActor | null | undefined): boolean {
  return !!user && (user.role === "SUPERADMIN" || user.role === "HR");
}

/** The only two values `handleNotificationAction`'s `action` parameter may legitimately carry — anything else (a malformed/forged raw call) is rejected rather than silently falling into the `decline` branch (the pre-Phase-17 behavior: the code only ever checked `=== 'approve'`, so any other string — including a typo or a deliberately crafted value — was treated as `decline`). */
export function isValidNotificationDecision(action: unknown): action is "approve" | "decline" {
  return action === "approve" || action === "decline";
}

/** A minimal non-empty-string guard for `handleNotificationAction`'s `notificationId` — rejects `undefined`/`null`/`""` before any database lookup is attempted. */
export function hasNotificationId(notificationId: unknown): notificationId is string {
  return typeof notificationId === "string" && notificationId.trim().length > 0;
}
