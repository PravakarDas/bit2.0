# Build stage
FROM node:lts-slim AS builder

WORKDIR /app

# node:lts-slim (Debian) has no OpenSSL by default; Prisma's engine needs it at generate-time
# to pick the right binary target, or it falls back with a "failed to detect libssl/openssl
# version" warning (harmless today, but Prisma's own docs list this as the standard fix).
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY . .
RUN corepack enable && pnpm install --frozen-lockfile

RUN env CI=true pnpm prisma generate
RUN env CI=true pnpm build

# Trim this stage's own node_modules down to production dependencies before anything is
# copied out of it — the runner stage below copies only this pruned tree, never the full
# (dependencies + devDependencies) one, so typescript/eslint/tailwind/@types/*/pdfjs-dist
# and the rest of the build-only tooling never reach the final image. Safe here because
# devDependencies were already used for prisma generate/build above; the app only needs
# `dependencies` to run (which now includes "prisma" itself — see package.json comment
# at its dependency entry — since this image's own CMD runs `prisma migrate deploy` at
# every container start, making the Prisma CLI a genuine runtime dependency, not just a
# build-time one).
RUN pnpm prune --prod

# Next's own build cache (Turbopack/webpack incremental-rebuild cache) — purely a
# build-speed optimization for subsequent `next build` runs, never read by `next start`.
# Can be the single largest thing in `.next` on a project this size; always safe to drop.
RUN rm -rf .next/cache

# Production stage
FROM node:lts-slim AS runner

WORKDIR /app

# Same reason as the builder stage: `npx prisma migrate deploy` in this image's CMD runs
# Prisma's engine here too, at container startup, not just at build time.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Baked into this image's own config, independent of any tag — still present even once this
# image loses its "bitcode-hrm:latest" tag and becomes dangling. The deploy pipeline's cleanup
# filters on this label so it can only ever consider images this project itself built, never
# another app's on the same shared VPS host. See deploy.yml's "Deploy with Docker Compose" step.
LABEL app=bitcode-hrm

ENV NODE_ENV=production
ENV TZ=Asia/Dhaka

ARG UID=1001
ARG GID=1001

RUN addgroup --system --gid ${GID} nodejs && \
  adduser --system --uid ${UID} nextjs

# Explicit allowlist instead of `COPY --from=builder /app .` — that previously copied
# EVERYTHING the builder stage had accumulated (full source tree, .git if present in the
# build context, devDependencies-included node_modules, the untrimmed .next including its
# build cache), which is exactly why this image was ~3.5GB. `next start` (this project uses
# the standard Next.js server, not `output: "standalone"`) needs: the compiled `.next`
# output, `public/`, `node_modules` (now production-only, from the prune above), the Next
# config it reads at startup, and `package.json`. `prisma/` is needed for this image's own
# `prisma migrate deploy` CMD (schema + migration SQL files).
#
# `src/lib/services/assets/fonts` is the one exception worth calling out: it's read via a
# raw `fs.readFileSync(path.join(process.cwd(), "src/lib/services/assets/fonts", ...))` in
# payslip-pdf.service.ts (the Bengali "৳" glyph for PDF generation) rather than through a
# Next.js-bundled import, so Next's own build never traces or copies it into `.next` the way
# it does for imported code — it has to be copied explicitly here, at the same relative path
# the code expects, or payslip PDF generation breaks in production. (Confirmed no other such
# raw filesystem path reads exist in src/ outside test files — this is the only one.)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/src/lib/services/assets/fonts ./src/lib/services/assets/fonts

# Everything above is root-owned and read-only for the runtime user. The one place `next start`
# itself writes is `.next/cache` (image-optimizer / fetch cache), dropped in the builder above,
# so recreate just that directory for nextjs — node_modules and the rest stay unwritable.
RUN mkdir -p .next/cache && chown nextjs:nodejs .next/cache

# Fail the image build, not the deploy, if anything `next start` / `prisma migrate deploy` need
# was pruned. `next start` transpiles next.config.ts with the `typescript` package at startup;
# when it can't resolve it, Next tries to `yarn add typescript` into the read-only node_modules
# (EACCES) and the server never comes up — the 502 this check now catches at build time.
# That is also why `typescript` is in package.json "dependencies", not "devDependencies".
RUN node -e "for (const m of ['typescript', 'next', '@prisma/client']) require.resolve(m, { paths: ['/app'] })" && \
  test -x node_modules/.bin/next && test -x node_modules/.bin/prisma

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Local binaries only: npx/npm can fall back to downloading a package at runtime if one is missing.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node_modules/.bin/next start"]
