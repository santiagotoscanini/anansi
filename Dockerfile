# Multi-stage build for Next.js application
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the Next.js application
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# wget is in the base alpine image, but BusyBox's wget understands --spider so
# the HEALTHCHECK below works without curl. We do install one helper for the
# non-root setup.
# Create a dedicated unprivileged user. Container exploits then can't write
# anywhere outside /app (and /app/uploads, which we explicitly chown). uid 1001
# avoids collision with the alpine `node` user (uid 1000) so bind-mounted
# volumes from a host with a uid-1000 owner aren't accidentally claimed.
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app

# Install production dependencies needed for migrations
COPY package*.json ./
RUN npm ci --omit=dev && npm install drizzle-kit && npm cache clean --force

# Copy migration files, and config
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/src/lib/data/schema.ts ./src/lib/data/schema.ts
COPY --from=builder /app/src/lib/data/db/migrations ./src/lib/data/db/migrations

# Copy necessary files from builder
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# uploads/ is the persistent attachment dir; create it now so the volume mount
# inherits the right ownership when nothing exists yet on the host.
RUN mkdir -p /app/uploads && chown -R app:app /app

USER app

# Expose port
EXPOSE 80

ENV PORT=80
ENV HOSTNAME="0.0.0.0"
ENV NODE_ENV=production

# Liveness probe: hits the /api/healthz route which runs `SELECT 1` against
# Postgres. 503 (DB unreachable) and non-2xx both fail the check, so the
# orchestrator can restart on a wedged DB connection rather than serving 500s.
# `--no-verbose --tries=1 --spider` is the BusyBox-compatible "ping URL" idiom.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/api/healthz || exit 1

# Override the default node entrypoint completely
ENTRYPOINT []
CMD ["/bin/sh", "/app/entrypoint.sh"]
