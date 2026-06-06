# Build stage
FROM node:lts-slim AS builder

WORKDIR /app

COPY . .
RUN corepack enable && pnpm install --frozen-lockfile

RUN env CI=true pnpm prisma generate
RUN env CI=true pnpm build

# Production stage
FROM node:lts-slim AS runner

WORKDIR /app

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