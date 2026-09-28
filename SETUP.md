# SETUP.md

Step-by-step install/configure/deploy instructions, derived from `package.json`, `.env.example`, `Dockerfile`, `docker-compose.yml`, `docker/postgres/`, and `.github/workflows/deploy.yml`.

See also: [README.md](README.md), [DATABASE.md](DATABASE.md), [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Table of Contents

- [Prerequisites](#prerequisites)
- [Local Installation](#local-installation)
- [Environment Variables Reference](#environment-variables-reference)
- [Database Setup & Migrations](#database-setup--migrations)
- [Seed Data](#seed-data)
- [Running Locally](#running-locally)
- [Docker Setup](#docker-setup)
- [Docker Compose (Full Stack)](#docker-compose-full-stack)
- [Build Process](#build-process)
- [Production Deployment](#production-deployment)
- [Post-Deploy Configuration (System Control / Email)](#post-deploy-configuration-system-control--email)

## Prerequisites

- Node.js (version not pinned in `package.json`'s `engines` field — "Not found in current project"; `Dockerfile` uses `node:lts-slim`, so match your local Node to whatever the current LTS is at build time).
- **pnpm** — the project uses `pnpm-lock.yaml` and `pnpm-workspace.yaml`. Use pnpm, not npm/yarn, for all installs (per project convention).
- PostgreSQL 17 reachable via `DATABASE_URL` (a local install, a Docker container, or the bundled `docker/postgres` image).
- A Clerk account/application (for `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` / `CLERK_WEBHOOK_SECRET`).
- Optional: a reachable ZKTeco Bio Time device/API (`ZKTECO_BASE_URL`) if you need attendance sync — the app runs without it, ZKTeco-dependent features simply have no data to sync.

## Local Installation

```bash
git clone <repo-url>
cd bit2.0
pnpm install
cp .env.example .env   # then fill in real values — see below
pnpm prisma generate
pnpm prisma migrate dev
pnpm dev
```

## Environment Variables Reference

All variables from `.env.example`, plus two referenced in code but **missing from `.env.example`** (flagged below):

| Variable | Required | Default (if any) | Purpose |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | Postgres connection string, e.g. `postgresql://user:pass@host:5432/dbname` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | — | Clerk publishable key (client-side, safe to expose) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Yes | `/sign-in` | Clerk sign-in route |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Yes | `/sign-up` | Clerk sign-up route |
| `CLERK_SECRET_KEY` | Yes | — | Clerk server-side SDK key |
| `CLERK_WEBHOOK_SECRET` | Yes | — | Verifies `POST /api/webhooks/clerk` svix signatures — app **throws at request time** if unset (`src/app/api/webhooks/clerk/route.ts`) |
| `ZKTECO_BASE_URL` | No | `""` | Default ZKTeco device API base URL — seeds `SystemControlSettings.zktecoBaseUrl` on first creation; can be changed later from the admin System Control UI without redeploying |
| `ZKTECO_USERNAME` | No | `""` | ZKTeco API username (same seeding behavior) |
| `ZKTECO_PASSWORD` | No | `""` | ZKTeco API password (same seeding behavior) |
| `APP_TIMEZONE` | No | `Asia/Dhaka` | Seeds `SystemControlSettings.appTimezone`, used by all three cron loops for local-time calculation |
| `EMAIL_SECRET_KEY` | Yes (before configuring email) | — | AES-256-GCM key encrypting the stored SMTP app password (`src/lib/crypto.ts`). **Set once and never change** — changing it makes previously-saved SMTP credentials undecryptable, breaking email sending until re-entered in System Control |
| `CRON_TIMELINE_HOUR` / `CRON_TIMELINE_MINUTE` | No | `0` / `1` | Seeds `SystemControlSettings.timelineCronHour/Minute` |
| `CRON_ZKTECO_HOUR` / `CRON_ZKTECO_MINUTE` | No | `11` / `0` | Seeds `SystemControlSettings.zktecoCronHour/Minute` (DAILY mode) |
| `CRON_LEAVE_AUTOMATION_HOUR` / `CRON_LEAVE_AUTOMATION_MINUTE` | No | `23` / `43` | Seeds `SystemControlSettings.leaveAutomationCronHour/Minute` |
| `DOMAIN` | Docker only | — | Traefik `Host()` rule for the app router |
| `ACME_EMAIL` | Docker only | — | Let's Encrypt account email for Traefik's `certresolver` |
| `APP_UID` / `APP_GID` | Docker only | `1001` / `1001` | UID/GID for the non-root `nextjs` user inside the app container |
| `CRON_SECRET_TOKEN` | **Not in `.env.example`** | unset (endpoint stays open) | Optional bearer token guarding `POST /api/cron/generate-timeline` — see [API.md](API.md) |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` | **Not in `.env.example`**, referenced in `docker-compose.yml` | `hrm` / `hrm` / **required, no default** | Postgres container credentials — `docker-compose.yml` will fail to start (`DB_PASSWORD required`) if unset |

Backup-related variables also read by `docker-compose.yml` but not in `.env.example`: `BACKUP_S3_BUCKET`, `BACKUP_S3_PATH_PREFIX`, `BACKUP_S3_ENDPOINT_URL`, `BACKUP_AWS_ACCESS_KEY_ID`, `BACKUP_AWS_SECRET_ACCESS_KEY`, `BACKUP_AWS_REGION`, `BACKUP_SCHEDULE`, `BACKUP_RETENTION_DAYS`, `BACKUP_COMPRESSION` — all optional; omitting `BACKUP_S3_BUCKET` disables the barman-cloud backup job entirely (per the compose file's own comment).

## Database Setup & Migrations

```bash
pnpm prisma generate       # regenerate the Prisma Client from schema.prisma
pnpm prisma migrate dev    # dev: creates/applies a new migration if schema.prisma changed, applies pending ones
pnpm prisma migrate deploy # prod/CI: applies pending migrations only, no schema diffing/prompting
```

- **Never** run `prisma db push` or `prisma migrate reset` against a database with real data — this project has lost data to that exact mistake before. Always diff against the live schema and use versioned migrations. See [[feedback-prisma-db-push-safety]] and [CLAUDE.md](CLAUDE.md#what-should-not-be-changed).
- In Docker/production, migrations are applied automatically as part of container startup (`Dockerfile`'s `CMD`: `npx prisma migrate deploy && npm start`) — you do not need to run migrations manually after a `docker compose up`.
- If your local/staging database predates a given migration and Prisma complains about an out-of-sync schema, resolve it with `prisma migrate resolve` rather than `db push`/`reset` — consult Prisma's migration troubleshooting docs for the specific state.

## Seed Data

```bash
pnpm prisma db seed
```

Runs `prisma/seed.js`, which requires **at least one `User` row to already exist** (i.e. sign in through the app once first) and then creates two sample `PENDING` loans for that user. There is no seed data for branches, departments, designations, or leave types — create these manually via the admin UI (`/admin/organization`, `/admin/leave-types`, `/admin/holidays`) after your first SUPERADMIN login.

## Running Locally

```bash
pnpm dev            # next dev — hot reload, runs the instrumentation.ts cron loops too
pnpm dev:clean      # Windows-only: rmdir /s /q .next, then next dev (cmd.exe syntax — will not work in PowerShell/bash as-is)
pnpm build          # next build — production build
pnpm start          # next start — serve the production build
pnpm lint           # eslint
```

The first user to sign in with the hardcoded email `pravakar459@gmail.com` (see `src/actions/user.actions.ts`) is auto-provisioned as `SUPERADMIN`/`APPROVED` — this is the only way to bootstrap the first admin account. Every other sign-up becomes `EMPLOYEE`/`PENDING` and must be approved from the admin employees page.

## Docker Setup

```bash
docker build -t bitcode-hrm:latest .
```

`Dockerfile` is a two-stage build:
1. **builder** (`node:lts-slim`): copies the full repo, `corepack enable && pnpm install --frozen-lockfile`, `pnpm prisma generate`, `pnpm build` (both with `CI=true`).
2. **runner** (`node:lts-slim`): copies the entire `builder` output, creates a non-root `nextjs` user (configurable `UID`/`GID` build args, default `1001`/`1001`), sets `NODE_ENV=production`, `TZ=Asia/Dhaka`, `PORT=3000`, `HOSTNAME=0.0.0.0`, and starts with `npx prisma migrate deploy && npm start`.

Run standalone (without compose) if you already have an external Postgres:
```bash
docker run -p 3000:3000 --env-file .env bitcode-hrm:latest
```

## Docker Compose (Full Stack)

```bash
docker network create traefik-public   # only if it doesn't already exist
docker compose up -d --build
```

`docker-compose.yml` defines:
- **`app`**: built from the root `Dockerfile`; depends on `postgres` being `service_healthy`; joins both `traefik-public` (external) and `hrm-internal` networks; Traefik labels route `https://${DOMAIN}` to container port 3000 with automatic TLS via `certresolver: le`.
- **`postgres`**: built from `docker/postgres/` — Postgres 17 Alpine plus `barman-cloud` backup tooling supervised by `tini`; data persisted to `./.data/postgres`; healthcheck via `pg_isready`; optional scheduled S3 backups (cron-driven inside the container, `BACKUP_SCHEDULE` default `0 2 * * *`) — disabled unless `BACKUP_S3_BUCKET` is set.

This compose file assumes an **external Traefik reverse proxy already running** on the `traefik-public` network — it is not self-contained for local-only use unless you also stand up Traefik or strip the labels/network for local testing.

## Build Process

`next build` (via `pnpm build`) — standard Next.js production build. No custom webpack/turbopack config beyond the default (`next.config.ts` only configures `images.remotePatterns` for Clerk-hosted avatar images: `img.clerk.com`, `images.clerk.dev`). `pnpm prisma generate` **must** run before `next build` (the Dockerfile explicitly does this as a separate step) since the Prisma Client is generated code, not checked into version control.

## Production Deployment

Handled entirely by `.github/workflows/deploy.yml` on every push to `main` (no manual step required once secrets are configured):
1. Build both Docker images locally in the GitHub Actions runner (`bitcode-hrm:latest`, `bitcode-hrm-postgres:latest`).
2. `docker save | gzip` them into one tarball.
3. `rsync` the tarball to the target server over SSH.
4. SSH in, `docker load`, `docker compose down`, `docker compose up -d --no-build`, `docker image prune -f`.

**Required GitHub Actions secrets:** `SSH_PRIVATE_KEY`, `SSH_PASSPHRASE`, `SSH_HOST`, `SSH_PORT`, `SERVER_PROJECT_PATH`. The target server must already have `docker-compose.yml`, `.env`, and `docker/postgres/initdb/` in place at `SERVER_PROJECT_PATH` before the first deploy (this workflow does not push those files — only the images).

There is **no test run, lint check, or build-failure gate** in this workflow before deploying — a broken build on `main` will still attempt to deploy (the Docker build step would fail the job, but nothing prevents a logically-broken-but-compiling change from shipping). See [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Post-Deploy Configuration (System Control / Email)

Some configuration is **not** environment-variable-driven and must be set from the admin UI after first deploy (see [ARCHITECTURE.md](ARCHITECTURE.md#configuration-loading)):
- `/admin/system-control` — cron enable flags/times, ZKTeco base URL/credentials (overrides env-seeded defaults).
- Email/SMTP configuration (component: `src/components/system/EmailConfigCard.tsx`) — sender email + app password (encrypted at rest using `EMAIL_SECRET_KEY`); send a test email from this screen to verify before relying on it for real notifications.
- `/admin/organization` — branches, departments, designations (no seed data ships with the app).
- `/admin/leave-types`, `/admin/holidays` — leave types and public holidays (also no seed data).
