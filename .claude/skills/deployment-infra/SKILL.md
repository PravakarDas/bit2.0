---
name: deployment-infra
description: Explains bit2.0's build/deploy pipeline — pnpm workspace, Docker multi-stage build, docker-compose with Traefik + self-hosted Postgres with Barman backups, and the GitHub Actions SSH-based deploy-on-push-to-main flow. Use when touching Dockerfile, docker-compose.yml, .github/workflows, or env var wiring.
---

# bit2.0 — Deployment & Infra

## Package manager: pnpm

[pnpm-workspace.yaml](pnpm-workspace.yaml) governs `allowBuilds` for packages with native
postinstall scripts (`@prisma/client`, `sharp`, etc.). `package.json` scripts still say
`npm run *` in places (leftover), but the Dockerfile and `pnpm-lock.yaml` confirm **pnpm is
the real package manager** — install/add dependencies with `pnpm`, not `npm`, to keep the
lockfile consistent (`.claude/settings.json` also allowlists `pnpm add *`).

## Docker build ([Dockerfile](Dockerfile))

Two-stage build, `node:lts-slim`:

1. **builder**: `corepack enable && pnpm install --frozen-lockfile`, then `pnpm prisma
   generate` and `pnpm build` (both with `CI=true`).
2. **runner**: copies the *entire* built `builder` stage (not a slim `output: standalone`
   copy — if bundle size ever becomes a problem, switching to Next's standalone output
   would be the fix, but don't assume it's already done). Runs as a non-root `nextjs` user
   (`UID`/`GID` build args, default 1001/1001, matched in compose via `APP_UID`/`APP_GID`).
   Container start command is `npx prisma migrate deploy && npm start` — **migrations run
   automatically on container start**, so any schema change merged to `main` applies itself
   on next deploy; there is no separate manual migration step in production.

## docker-compose ([docker-compose.yml](docker-compose.yml))

Two services on two networks:

- **`app`**: built from the root `Dockerfile`, joins both `traefik-public` (external
  network — Traefik must already be running on the host) and `hrm-internal`. Routing is
  declared entirely via Traefik **labels** (host rule from `${DOMAIN}`, TLS via `le`
  certresolver, forced HTTPS) — there's no separate reverse-proxy config file to edit;
  change routing by editing these labels.
- **`postgres`**: custom-built from [docker/postgres/Dockerfile](docker/postgres/Dockerfile)
  (not the stock Postgres image) because it bundles **Barman Cloud backups** — see
  `docker/postgres/entrypoint-wrapper.sh` and `barman-backup.sh`. Backup to S3-compatible
  storage is opt-in: it only activates if `BACKUP_S3_BUCKET` is set; schedule defaults to
  `0 2 * * *` (`BACKUP_SCHEDULE`), retention `14` days. Data persists to `./.data/postgres`
  on the host (bind mount, not a named volume, despite the unused `postgres_data` volume
  declaration at the bottom of the compose file). Only reachable on the internal network —
  never expose Postgres directly to `traefik-public`.

## Environment variables ([.env.example](.env.example))

- `DATABASE_URL` — Postgres connection string.
- Clerk: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`
  (verifies the `svix` webhook signature — required for user provisioning to work at all),
  `NEXT_PUBLIC_CLERK_SIGN_IN_URL`/`SIGN_UP_URL`.
- ZKTeco: `ZKTECO_BASE_URL`/`USERNAME`/`PASSWORD` — **only used as seed defaults** the first
  time `SystemControlSettings` is created; after that, the DB row (editable in
  `/admin/system-control`) is authoritative. Changing the env var after first boot has no
  effect until the settings row is reset — see `[[attendance-automation]]`.
- `APP_TIMEZONE`, `CRON_*_HOUR`/`MINUTE` — same "seed default only" caveat as above.
- Docker/Traefik: `DOMAIN`, `ACME_EMAIL`, `APP_UID`, `APP_GID`.
- `.env` is git-ignored; `.env.example` is the template to copy and fill in for a new
  environment. Never commit real secrets into `.env.example`.

## CI/CD ([.github/workflows/deploy.yml](.github/workflows/deploy.yml))

Push to `main` triggers a deploy — **there is no staging environment or PR preview in this
pipeline**, so treat `main` as production-deploying. Flow:

1. Build both Docker images locally in the GitHub Actions runner (`bitcode-hrm:latest`,
   `bitcode-hrm-postgres:latest`).
2. `docker save` both images to a single gzipped tarball.
3. `rsync` the tarball to the production server over SSH (key + passphrase from repo
   secrets: `SSH_PRIVATE_KEY`, `SSH_PASSPHRASE`, `SSH_HOST`, `SSH_PORT`,
   `SERVER_PROJECT_PATH`).
4. SSH in, `docker load`, `docker compose down` then `up -d --no-build` (compose only ever
   loads pre-built images on the server, it never builds there), then prune dangling images.

Because this always deploys straight to production with no rollback step defined here, a
bad merge to `main` reaches users on the next push — verify locally (`pnpm build`, and
ideally a local `docker compose up`) before merging to `main`, and treat any
schema-migration change with extra care since it auto-applies via `prisma migrate deploy` on
container start with no manual gate.

## Local dev

`pnpm dev` (or `npm run dev`) starts Next.js in dev mode; the three instrumentation cron
jobs still start (see `[[attendance-automation]]`), so local dev will also attempt ZKTeco
syncs/timeline generation against whatever `DATABASE_URL`/`ZKTECO_*` your local `.env`
points at — point at a dev database, not production, when running locally.
