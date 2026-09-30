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

COPY --from=builder /app .

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# CMD ["npm", "start"]
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]