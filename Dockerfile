# syntax=docker/dockerfile:1.7
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache libc6-compat

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_OPTIONS=--max-old-space-size=2048

COPY package.json pnpm-lock.yaml ./

RUN corepack enable \
  && pnpm config set store-dir /pnpm/store \
  && pnpm config set ignore-scripts false

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch --frozen-lockfile
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --offline

COPY . .

RUN pnpm prisma generate
RUN pnpm exec next build --webpack

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache tzdata

ENV NODE_ENV=production
ENV TZ=Asia/Dhaka
ENV NODE_OPTIONS=--max-old-space-size=1024

ARG UID=1001
ARG GID=1001

RUN addgroup --system --gid ${GID} nodejs && \
  adduser --system --uid ${UID} nextjs

# Copy only the minimal set of files needed for runtime
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["npm", "start"]