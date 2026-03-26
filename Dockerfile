# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY . .

RUN pnpm prisma generate
RUN pnpm build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

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
CMD ["sh", "-c", "npx prisma migrate deploy && node test-scripts/clear-actual-time.js && npm start"]