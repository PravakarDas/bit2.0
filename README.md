# Bit HR (bit2.0)

> Custom HRM (Human Resource Management) and payroll web application built for a Bangladesh-based organization ("Bit").

## Table of Contents

- [Overview](#overview)
- [Main Features](#main-features)
- [Tech Stack](#tech-stack)
- [Folder Structure](#folder-structure)
- [Running Locally](#running-locally)
- [Running with Docker](#running-with-docker)
- [Production Deployment](#production-deployment)
- [Environment Variables](#environment-variables)
- [High-Level Architecture](#high-level-architecture)
- [Main Dependencies](#main-dependencies)
- [Development Workflow](#development-workflow)
- [Related Documentation](#related-documentation)

## Overview

Bit HR is a single Next.js application that manages the full employee lifecycle for a multi-branch organization: onboarding/approval, attendance & biometric timeline sync, leave, overtime, loans/EMI, medical claims, wallet, payroll, and admin/manager notifications and audit trails. There is no separate backend service — all business logic runs as Next.js Server Actions and a small set of API Route Handlers inside the same app.

The application name in `package.json` is `bit2.0`. The product-facing name shown in the UI (`src/app/layout.tsx` title and `src/assets/Bit HR*.svg`) is **Bit HR**.

"Not found in current project": no product requirements document, issue tracker export, or design brief was found in the repository — the feature list below is reverse-engineered strictly from routes, Prisma models, and server actions.

## Main Features

Reverse-engineered from `src/app/(admin)`, `src/app/(manager)`, `src/app/(employee)`, and `src/actions/*.ts`:

| Domain | What it does | Key files |
|---|---|---|
| Auth & onboarding | Clerk sign-in/sign-up, auto-provision a `User` row on first login (`PENDING` until approved), role-based landing redirect | `src/app/api/webhooks/clerk/route.ts`, `src/actions/user.actions.ts` |
| Employee directory & organization | Branches, Departments (hierarchical), Designations, employee profiles, archive/reactivate lifecycle | `src/actions/employee.actions.ts`, `branch.actions.ts`, `department.actions.ts`, `designation.actions.ts` |
| Attendance / Timeline | Daily present/absent/leave/weekly-off record generation, ZKTeco biometric device sync, manual edits & modification requests | `src/actions/timeline.actions.ts`, `zkteco-sync.actions.ts`, `timeline-modification-request.actions.ts` |
| Leave management | Leave types, per-employee entitlements, leave applications, public holidays, nightly automation (auto-leave / auto-absence penalty) | `src/actions/leave.actions.ts`, `leave-automation.actions.ts`, `leave-board.actions.ts` |
| Overtime | Employee overtime requests, manager verification, admin approval, year-end OT/UT-to-wallet payout | `src/actions/overtime-request.actions.ts`, `overtime.actions.ts`, `manager-verification.actions.ts` |
| Loans / EMI | Loan application, eligibility rules, manager verification, admin approval, EMI schedule & waterfall payment logic | `src/actions/loan.actions.ts`, `manual-loan.actions.ts`, `src/lib/services/loan.service.ts` |
| Medical claims | Annual entitlement tracking and claim approval against a configurable limit | `src/actions/medical.actions.ts`, `src/lib/services/medical.service.ts` |
| Payroll & Wallet | Monthly payroll run (salary + allowances + bonuses − loan EMI + medical), wallet ledger, employee reimbursement requests | `src/actions/payroll.actions.ts`, `salary.actions.ts`, `wallet.actions.ts` |
| Notifications & Breaking Notices | Admin notification center, employee notifications, org-wide/branch/individual announcements | `src/actions/notification.actions.ts`, `breaking-notice.actions.ts` |
| System Control | DB-backed cron scheduling config and ZKTeco credentials, SMTP email configuration | `src/actions/system-control.actions.ts`, `email-config.actions.ts` |
| Role management | SUPERADMIN-only role/manager-flag/archive administration | `src/actions/role-management.actions.ts` |

See [ARCHITECTURE.md](ARCHITECTURE.md) for request flow and [DATABASE.md](DATABASE.md) for the full data model.

## Tech Stack

| Layer | Technology | Version (from `package.json`) |
|---|---|---|
| Framework | Next.js (App Router) | 16.1.4 |
| UI library | React | 19.2.3 |
| Language | TypeScript | ^5 |
| Styling | Tailwind CSS | ^4 |
| Component library | shadcn/ui ("new-york" style) on Radix UI primitives | see `components.json` |
| ORM | Prisma | ^6.2.1 |
| Database | PostgreSQL | 17 (Docker image `postgres:17-alpine`) |
| Auth | Clerk (`@clerk/nextjs`) | ^7.0.0 |
| Email | Nodemailer (SMTP, DB-configured) | ^9.0.3 |
| Charts | Recharts | ^3.7.0 |
| Forms | react-hook-form + zod + @hookform/resolvers | — |
| Package manager | pnpm (see [[user-prefers-pnpm]] preference) | workspace config in `pnpm-workspace.yaml` |
| Containerization | Docker, Docker Compose, Traefik (reverse proxy/TLS) | `Dockerfile`, `docker-compose.yml` |
| CI/CD | GitHub Actions (build images, rsync + `docker compose up` over SSH) | `.github/workflows/deploy.yml` |

`node-cron` is listed in `package.json` dependencies but no import of it was found anywhere in `src/`. Actual scheduling is a hand-rolled `setInterval`-based scheduler in `src/instrumentation.ts` — see [DECISIONS.md](DECISIONS.md).

## Folder Structure

```
bit2.0/
├── prisma/
│   ├── schema.prisma          # Single Prisma schema — all models/enums
│   ├── migrations/            # 45 timestamped migrations (see DATABASE.md)
│   └── seed.js                # Minimal seed script (creates 2 sample loans for the first user)
├── src/
│   ├── actions/                # Server Actions — the entire business logic / data-access layer (34 files)
│   ├── app/                     # Next.js App Router
│   │   ├── (admin)/admin/...    # SUPERADMIN-only route group
│   │   ├── (manager)/manager/...# EMPLOYEE-with-isManager route group
│   │   ├── (employee)/...       # Any approved employee route group
│   │   ├── api/                 # Route Handlers: webhooks, cron triggers, small REST-style endpoints
│   │   ├── sign-in/, sign-up/   # Clerk catch-all auth pages
│   │   ├── pending/, unauthorized/ # Status/gating pages
│   │   └── layout.tsx, page.tsx # Root layout (ClerkProvider) and role-based landing redirect
│   ├── components/
│   │   ├── admin/               # Admin-only feature components
│   │   ├── employee/             # Employee-facing feature components (incl. employee/charts, employee/wallet)
│   │   ├── manager/              # Manager-facing feature components
│   │   ├── shared/               # Cross-role feature components
│   │   ├── system/               # System Control / Email Config UI
│   │   ├── late-checkin/, timeline-modification/
│   │   └── ui/                   # shadcn/ui primitives (button, dialog, table, ...)
│   ├── hooks/                    # `use-mobile` (the only custom hook found)
│   ├── lib/
│   │   ├── services/              # email.service.ts, loan.service.ts, medical.service.ts, zkteco.service.ts
│   │   ├── prisma.ts               # Prisma client singleton
│   │   ├── roles.ts, crypto.ts, currency.ts, duration.ts, employee-status.ts, email-config.ts, system-control.ts, timeline-status.ts, utils.ts
│   ├── types/clerk.d.ts          # Augments Clerk's CustomJwtSessionClaims with our Role
│   ├── instrumentation.ts        # Next.js instrumentation hook — starts the 3 background cron loops
│   └── proxy.ts                  # Next.js 16 middleware file (Clerk route protection) — see ARCHITECTURE.md
├── docker/postgres/               # Custom Postgres image (barman-cloud backup tooling + tini)
├── docker-compose.yml              # app + postgres services, Traefik labels, backup env vars
├── Dockerfile                      # Multi-stage Next.js build
└── .github/workflows/deploy.yml    # Build images → rsync to server → docker compose up
```

Full architectural reasoning is in [ARCHITECTURE.md](ARCHITECTURE.md).

## Running Locally

```bash
pnpm install
pnpm prisma generate
pnpm prisma migrate dev      # applies prisma/migrations/ to your local DATABASE_URL
pnpm dev                     # next dev
```

Requires a `.env` file — copy `.env.example` and fill in real values (see [Environment Variables](#environment-variables) and [SETUP.md](SETUP.md)). A running PostgreSQL instance reachable at `DATABASE_URL` is required before `migrate dev`.

`package.json` scripts:

| Script | Command | Purpose |
|---|---|---|
| `dev` | `next dev` | Local dev server |
| `dev:clean` / `dev:fresh` | removes `.next` then `next dev` | Windows-only clean rebuild (`cmd.exe` syntax: `if exist .next rmdir /s /q .next`) |
| `build` | `next build` | Production build |
| `start` | `next start` | Run the production build |
| `lint` | `eslint` | Lint the codebase |

## Running with Docker

```bash
docker compose build
docker compose up -d
```

`docker-compose.yml` defines two services:
- **`app`** — built from the root `Dockerfile` (multi-stage: `pnpm install` → `pnpm prisma generate` → `pnpm build`, then a slim runner stage running as a non-root `nextjs` user). Exposes port 3000, fronted by **Traefik** labels for automatic HTTPS (`certresolver=le`) at `Host(${DOMAIN})`.
- **`postgres`** — built from `docker/postgres/` (Postgres 17 Alpine + `barman-cloud` for S3-based backups, supervised by `tini`). Data persisted at `./.data/postgres`. Healthcheck via `pg_isready`.

The container's start command runs migrations before serving: `npx prisma migrate deploy && npm start` (see `Dockerfile` last line).

Both services join an internal `hrm-internal` bridge network; `app` additionally joins an external `traefik-public` network (must already exist: `docker network create traefik-public`).

Full setup steps are in [SETUP.md](SETUP.md).

## Production Deployment

`.github/workflows/deploy.yml` runs on every push to `main`:
1. Checks out the repo.
2. Builds the `bitcode-hrm:latest` app image and the `bitcode-hrm-postgres:latest` image.
3. Saves both images to a gzip tarball and `rsync`s it to the target server over SSH (secrets: `SSH_HOST`, `SSH_PORT`, `SSH_PRIVATE_KEY`, `SSH_PASSPHRASE`, `SERVER_PROJECT_PATH`).
4. SSHes in, `docker load`s the images, `docker compose down` then `docker compose up -d --no-build`, then prunes dangling images.

There is no staging environment, no automated test run, and no build/lint gate in this workflow — "Unable to determine from current codebase" whether tests are run before deploy elsewhere (no test files or test runner config were found in the repo).

## Environment Variables

Summarized from `.env.example` (see [SETUP.md](SETUP.md) for full descriptions):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Prisma) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Clerk client-side config |
| `CLERK_SECRET_KEY` | Clerk server-side SDK key |
| `CLERK_WEBHOOK_SECRET` | Verifies `POST /api/webhooks/clerk` (svix signature) |
| `ZKTECO_BASE_URL`, `ZKTECO_USERNAME`, `ZKTECO_PASSWORD` | Fallback biometric device API credentials (DB-configurable at runtime via System Control — see `src/lib/system-control.ts`) |
| `APP_TIMEZONE` | Default timezone for cron scheduling (`Asia/Dhaka`), DB-overridable |
| `EMAIL_SECRET_KEY` | AES-256-GCM key used to encrypt/decrypt the stored SMTP app password — **never change once credentials are saved** |
| `CRON_TIMELINE_HOUR/MINUTE`, `CRON_ZKTECO_HOUR/MINUTE`, `CRON_LEAVE_AUTOMATION_HOUR/MINUTE` | Default cron times (also DB-overridable) |
| `DOMAIN`, `ACME_EMAIL`, `APP_UID`, `APP_GID` | Docker/Traefik deployment settings |

Also referenced in code but **absent from `.env.example`**: `CRON_SECRET_TOKEN` (optional bearer-token guard for `POST /api/cron/generate-timeline`, see `src/app/api/cron/generate-timeline/route.ts`). See [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## High-Level Architecture

Next.js App Router monolith:

```
Browser ──> Clerk (hosted auth UI) ──> proxy.ts (clerkMiddleware, route protection)
                                              │
                                              ▼
                            Route Group Layout (admin/manager/employee)
                            └─ getDbUser() loads the Prisma User row for the Clerk session
                            └─ redirects to /sign-in, /pending, or /unauthorized as needed
                                              │
                                              ▼
                     Server Components (page.tsx) ──calls──> src/actions/*.ts (Server Actions)
                                              │                        │
                     Client Components ("use client") ──calls─────────┘
                                              │
                                              ▼
                                     Prisma Client ──> PostgreSQL
```

Background work (no queue/worker process): `src/instrumentation.ts` starts three in-process interval loops on server boot (daily timeline generation, ZKTeco sync, leave automation), each gated by DB-stored `SystemControlSettings`. Full detail in [ARCHITECTURE.md](ARCHITECTURE.md).

## Main Dependencies

See `package.json` for exact versions. Notable choices:
- **Clerk** for authentication — no custom password/session handling in this codebase.
- **Prisma** as the only data-access layer — no raw `pg`/query builder usage except a couple of `$queryRaw` calls in `dashboard.actions.ts`.
- **shadcn/ui + Radix UI + Tailwind CSS 4** for the entire UI component layer.
- **Svix** to verify Clerk webhook signatures.
- **date-fns** for date formatting/arithmetic across the app.
- **Recharts** for the employee dashboard charts (`src/components/employee/charts/*`).
- **Zod** + **react-hook-form** + **@hookform/resolvers** for form validation (used inconsistently — see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Development Workflow

Reverse-engineered from `git log` and branch naming (no `CONTRIBUTING`-style workflow doc previously existed):
- Feature branches merged to `main` via Pull Requests (see recent commits referencing PR numbers, e.g. "Merge pull request #26 from PravakarDas/timelinepage_redesign").
- No test suite, no CI test gate, no pre-commit hook configuration was found in the repository ("Unable to determine from current codebase" whether one exists outside version control).
- `.gitignore` excludes all `*.md` files from version control — meaning this documentation set is **not tracked by git by default**. If you want these files versioned, add explicit exceptions (e.g. `!README.md`) to `.gitignore`.

## Related Documentation

- [CLAUDE.md](CLAUDE.md) — primary context file for AI coding agents (conventions, what not to change)
- [ARCHITECTURE.md](ARCHITECTURE.md) — layers, request flow, sequence diagrams
- [DATABASE.md](DATABASE.md) — full Prisma schema reference
- [API.md](API.md) — every HTTP API route
- [SETUP.md](SETUP.md) — install, configure, Docker, migrations
- [CONTRIBUTING.md](CONTRIBUTING.md) — coding standards reverse-engineered from the codebase
- [DECISIONS.md](DECISIONS.md) — architectural decisions inferred from the code
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — common issues and fixes
- [CHANGELOG.md](CHANGELOG.md) — module/version summary
