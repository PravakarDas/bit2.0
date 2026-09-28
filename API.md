# API.md

This app is a Next.js Server Actions-first application (see [ARCHITECTURE.md](ARCHITECTURE.md)) — the vast majority of "backend calls" are Server Actions in `src/actions/*.ts`, invoked directly from React components, **not** HTTP endpoints. This file documents only the actual HTTP surface: the 9 Route Handler files under `src/app/api/`.

For the Server Actions themselves (the real business-logic API), see [CLAUDE.md](CLAUDE.md#backend-patterns-server-actions) and [ARCHITECTURE.md](ARCHITECTURE.md#business-logic-organization) — there is no separate REST/RPC contract for them beyond their TypeScript function signatures.

## Table of Contents

- [Authentication Model for These Routes](#authentication-model-for-these-routes)
- [POST /api/webhooks/clerk](#post-apiwebhooksclerk)
- [POST/GET /api/admin/generate-timeline](#postget-apiadmingenerate-timeline)
- [POST/GET /api/cron/generate-timeline](#postget-apicrongenerate-timeline)
- [GET/POST /api/cron/daily-notifications](#getpost-apicrondaily-notifications)
- [POST/GET /api/leave-automation](#postget-apileave-automation)
- [GET/POST/DELETE /api/employee-notes](#getpostdelete-apiemployee-notes)
- [GET /api/employees/[id]/name](#get-apiemployeesidname)
- [GET /api/holidays/check](#get-apiholidayscheck)
- [GET /api/test-increments](#get-apitest-increments)
- [Endpoint Summary Table](#endpoint-summary-table)

## Authentication Model for These Routes

- `src/proxy.ts` (Clerk middleware) protects **all** `/api/*` routes by default (its matcher config explicitly always runs for `/(api|trpc)(.*)`) — an unauthenticated request is rejected by Clerk before it reaches the route handler, **except** where the handler itself doesn't require a signed-in *application* user (e.g. the Clerk webhook, which is authenticated via svix signature instead, and the cron endpoints, which rely on their own bearer-token/dev-only checks).
- Within a route handler, authorization (which *user* may call it) is enforced ad hoc per file — some call `getDbUser()` and check `role`, others have no additional check beyond Clerk's "is signed in." See each route below.

## POST /api/webhooks/clerk

**File:** `src/app/api/webhooks/clerk/route.ts`
**Authentication:** None from Clerk's app-session middleware (this route must be reachable by Clerk's servers, not a browser session) — instead verified via **svix webhook signature** using `CLERK_WEBHOOK_SECRET`.
**Purpose:** Keeps the local `User` table in sync with Clerk's user database.

**Request headers (required):** `svix-id`, `svix-timestamp`, `svix-signature`.
**Request body:** Clerk `WebhookEvent` JSON payload (`evt.type` + `evt.data`).

**Behavior by `evt.type`:**
| Event | Effect |
|---|---|
| `user.created` | `prisma.user.create({ clerkId, email, role: "EMPLOYEE", status: "PENDING" })` |
| `user.updated` | `prisma.user.update({ where: { clerkId }, data: { email } })` |
| `user.deleted` | `prisma.user.delete({ where: { clerkId } })` |

**Responses:**
| Status | Body | Condition |
|---|---|---|
| 200 | `""` (empty) | Always, on successful processing (or if `evt.type` matches none of the three handled cases) |
| 400 | `"Error occured -- no svix headers"` | Missing one or more svix headers |
| 400 | `"Error occured"` | Signature verification failed |

**Validation:** Delegated entirely to `svix`'s `Webhook.verify()` — no manual body schema validation.
**Related action:** None — this route writes to `prisma` directly rather than calling `src/actions/user.actions.ts`. This is a **separate, parallel path** to `syncUserWithDb()` (which runs when the user actually visits the app) — see [ARCHITECTURE.md](ARCHITECTURE.md#authentication-flow-sequence).

**Example request** (simplified `user.created`):
```json
{
  "type": "user.created",
  "data": {
    "id": "user_2abc...",
    "email_addresses": [{ "email_address": "employee@example.com" }]
  }
}
```

## POST/GET /api/admin/generate-timeline

**File:** `src/app/api/admin/generate-timeline/route.ts`
**Authentication:** Only Clerk's app-level middleware (any signed-in user can call this — **no role check inside the handler**). Intended as a manual/admin trigger; treat as a gap if stricter access is required (see [TROUBLESHOOTING.md](TROUBLESHOOTING.md)).
**Purpose:** Manually trigger today's daily-attendance-record generation (same underlying logic the nightly cron loop runs).
**Related action:** `checkAndGenerateToday()` in `src/actions/timeline.actions.ts`.
**Request body / query params:** None.

**Response (200, success):**
```json
{
  "success": true,
  "message": "<result.message>",
  "recordsCreated": 0,
  "timestamp": "2026-07-19T00:00:00.000Z",
  "manual": true
}
```

**Response (500, failure):**
```json
{ "success": false, "error": "<result.error>", "timestamp": "...", "manual": true }
```

`GET` is supported purely for "easy browser testing" (per the file's own comment) and just calls `POST()`.

## POST/GET /api/cron/generate-timeline

**File:** `src/app/api/cron/generate-timeline/route.ts`
**Authentication:** Optional bearer-token check — if `process.env.CRON_SECRET_TOKEN` is set, the request must send header `Authorization: Bearer <CRON_SECRET_TOKEN>` or receive `401`. If the env var is unset, the endpoint is open to any authenticated (Clerk) request. **`CRON_SECRET_TOKEN` is referenced here but absent from `.env.example`** — see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
**Purpose:** External-cron-friendly trigger for daily timeline generation ("should be called daily at 00:01" per the file's comment) — an HTTP alternative to the in-process `instrumentation.ts` loop (see [ARCHITECTURE.md](ARCHITECTURE.md#background-jobs--cron-architecture)).
**Related actions:** `checkAndGenerateToday()` (`timeline.actions.ts`), `createAdminNotification()` (`notification.actions.ts`) — fired on failure only.

**Request headers (optional):** `Authorization: Bearer <token>`.

**Responses:**
| Status | Condition |
|---|---|
| 200 | `result.success === true` |
| 401 | `CRON_SECRET_TOKEN` set and header missing/mismatched |
| 500 | `result.success === false` (also creates an `AdminNotification` of type `TIMELINE_GENERATION_FAILED`) or an unhandled exception |

**Response body shape:**
```json
{ "success": true, "message": "...", "recordsCreated": 3, "timestamp": "..." }
```

`GET` is available **only when `NODE_ENV !== "production"`** (returns 404 in production) and simply forwards to `POST(request)` — a dev-only convenience, not a production-safe alias.

## GET/POST /api/cron/daily-notifications

**File:** `src/app/api/cron/daily-notifications/route.ts`
**Authentication:** None beyond Clerk app middleware — no bearer-token guard on this route (inconsistent with `/api/cron/generate-timeline`; see [TROUBLESHOOTING.md](TROUBLESHOOTING.md)/[DECISIONS.md](DECISIONS.md)).
**Purpose:** Creates `INCREMENT_REMINDER` admin notifications for employees whose service anniversary is exactly 7 days away. Comment in the file notes it's intended to be called by "Vercel Cron, GitHub Actions, or external cron" — this app is not deployed on Vercel (see [SETUP.md](SETUP.md)), so this is effectively dead/unused unless wired to an external scheduler manually.
**Related action:** `checkAndCreateIncrementReminders()` (`notification.actions.ts`).
**Request body / query params:** None.

**Response (200, success):**
```json
{ "success": true, "message": "Created 2 increment reminders", "reminders": [ /* array of created reminders */ ] }
```
**Response (500, failure):** `{ "success": false, "error": "..." }`.

`POST` is an alias for `GET` ("Optional: Allow POST for manual triggering").

## POST/GET /api/leave-automation

**File:** `src/app/api/leave-automation/route.ts`
**Authentication:** None beyond Clerk app middleware — no role check inside the handler.
**Purpose:** External trigger for the nightly leave/attendance-finalization automation pipeline, with optional backfill support.
**Related actions:** `runLeaveAutomationPipeline()`, `processBackfillLeaveAutomation()` (`leave-automation.actions.ts`).

**Query parameters (POST):**
| Param | Type | Effect |
|---|---|---|
| `backfill` | `"all"` \| number-string | If `"all"`: runs `mode: "ALL_DATES"` from Jan 1 of the current year through today. If a number `N`: runs `processBackfillLeaveAutomation` starting `N` days ago. If absent: runs `mode: "UNPROCESSED"` (all unprocessed dates, excluding today). |
| `employeeId` | string | Restricts processing to a single employee (all modes). |

**Responses:**
| Status | Condition |
|---|---|
| 200 | `{ success: true, message: "Leave automation processing completed", data: result }` |
| 503 | `result.success === false` (e.g. ZKTeco sync failed) — body includes `error` (the sync failure message if available) and `data: result` |
| 500 | Unhandled exception — `{ success: false, error: "Failed to process leave automation" }` |

`GET` returns a static status payload for health-checking: `{ success: true, message: "Leave automation system is running", timestamp }` — it does **not** trigger processing.

## GET/POST/DELETE /api/employee-notes

**File:** `src/app/api/employee-notes/route.ts`
**Authentication:** `getDbUser()` + `assertCanAccessEmployeeNotes()` — requires `role === "SUPERADMIN"` or (`role === "EMPLOYEE" && isManager`); throws `"Unauthorized"` otherwise (caught and returned as a 500 with that message — see [Error Handling Conventions](CLAUDE.md#error-handling-conventions), this is one of the "throw vs. return success:false" inconsistencies).
**Purpose:** CRUD for free-text HR notes attached to an employee (`EmployeeNote` model), visible only to admin/manager.
**Related model:** `EmployeeNote` (queried directly via `prisma`, no dedicated action file — the only domain whose full CRUD lives entirely in a Route Handler rather than `src/actions/`).

### GET
**Query parameters:** `employeeId` (required).
**Response (200):** `{ "notes": [ { id, note, createdAt, createdByUser: { id, firstName, lastName, email }, ... } ] }` — ordered `createdAt desc`, excludes soft-deleted (`deletedAt: null`).
**Response (400):** `{ "error": "employeeId required" }`.

### POST
**Request body:** `{ "employeeId": string, "note": string }`.
**Response (200):** `{ "note": { ...created row, createdByUser: {...} } }`.
**Response (400):** `{ "error": "employeeId and note required" }` if either is missing/wrong type.

### DELETE
**Request body:** `{ "id": string }` (soft delete — sets `deletedAt`, does not remove the row).
**Response (200):** `{ "success": true }`.
**Response (400):** `{ "error": "id required" }`. **Response (404):** `{ "error": "Note not found" }`.

**Common error response (all methods, 500):** `{ "error": error?.message || "Server error" }`.

## GET /api/employees/[id]/name

**File:** `src/app/api/employees/[id]/name/route.ts`
**Authentication:** None beyond Clerk app middleware — no role check.
**Purpose:** Lightweight lookup of a single employee's display name by ID (used where fetching the full `User` object would be excessive).
**Related action:** `getUserById()` (`user.actions.ts`).
**Path parameter:** `id` (Next.js 16 dynamic route — `params` is a `Promise`, awaited inside the handler).

**Response (200):** `{ "name": "First Last" }` (falls back to `user.email` if either name part is missing).
**Response (404):** `{ "error": "Employee not found" }`.
**Response (500):** `{ "error": "Internal server error" }`.

## GET /api/holidays/check

**File:** `src/app/api/holidays/check/route.ts`
**Authentication:** None beyond Clerk app middleware.
**Purpose:** Checks whether a given date is a public holiday and/or a weekly-off day for a given user's branch.
**Related action:** `checkAllHolidays(userId, date)` (`leave.actions.ts`).

**Query parameters (both required):** `date` (string, expected `YYYY-MM-DD`), `userId` (string).
**Response (200):** shape of `checkAllHolidays()`'s return value — includes both public-holiday and weekly-off determination (see `leave.actions.ts` for the exact fields; not independently re-validated by this route).
**Response (400):** `{ "error": "Both date and userId parameters are required" }`.
**Response (500):** `{ "error": "Internal server error" }`.

## GET /api/test-increments

**File:** `src/app/api/test-increments/route.ts`
**Authentication:** None beyond Clerk app middleware.
**Purpose:** Debug/diagnostic endpoint — recomputes, for every active employee with a join date, whether their service anniversary is exactly 7 days away, and cross-references existing `INCREMENT_REMINDER` notifications created today. Explicitly documented in its own header comment as a manual test script: *"Run this by visiting /api/test-increments in your browser."* This route has no production purpose and duplicates logic that lives in `notification.actions.ts`'s `checkAndCreateIncrementReminders` — candidate for removal or gating behind a dev-only check (see [TROUBLESHOOTING.md](TROUBLESHOOTING.md), [DECISIONS.md](DECISIONS.md)). It performs **no writes**.

**Response (200):**
```json
{
  "success": true,
  "debug": {
    "today": "...",
    "oneWeekFromToday": "...",
    "totalEmployees": 12,
    "eligibleEmployees": [ { "name", "joiningDate", "anniversaryDate", "daysDifference", "eligible" } ],
    "existingNotificationsToday": 1,
    "existingNotifications": [ { "id", "title", "metadata" } ]
  }
}
```
**Response (500):** `{ "success": false, "error": "..." }`.

## Endpoint Summary Table

| Method(s) | Route | Auth beyond Clerk session | Role check? | Idempotent |
|---|---|---|---|---|
| POST | `/api/webhooks/clerk` | svix signature | N/A (Clerk-only) | No (creates/updates/deletes on each event) |
| GET, POST | `/api/admin/generate-timeline` | None | No | Yes (skips already-generated days) |
| GET*, POST | `/api/cron/generate-timeline` | Optional bearer token (`CRON_SECRET_TOKEN`) | No | Yes |
| GET, POST | `/api/cron/daily-notifications` | None | No | Partial (dedup by day, per employee) |
| GET, POST | `/api/leave-automation` | None | No | Yes (per-date `isProcessed` guard) |
| GET, POST, DELETE | `/api/employee-notes` | `getDbUser()` | Yes — SUPERADMIN or manager | POST no / DELETE yes (soft delete) |
| GET | `/api/employees/[id]/name` | None | No | Yes (read-only) |
| GET | `/api/holidays/check` | None | No | Yes (read-only) |
| GET | `/api/test-increments` | None | No | Yes (read-only, debug) |

\* `/api/cron/generate-timeline`'s `GET` is dev-only (404 in production).

**Cross-cutting observation:** most `/api/cron/*` and admin-trigger routes have **no role/permission check**, relying solely on Clerk session validity. This is a notable inconsistency versus the strict per-action permission checks documented in [CLAUDE.md](CLAUDE.md#authorization-flow) — flagged in [TROUBLESHOOTING.md](TROUBLESHOOTING.md) and [DECISIONS.md](DECISIONS.md) as worth a deliberate look, not silently "fixed."
