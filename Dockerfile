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

# Install production dependencies needed for migrations
COPY package*.json ./
RUN npm ci --omit=dev && npm install drizzle-kit

# Copy migration files, and config
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/src/lib/data/schema.ts ./src/lib/data/schema.ts
COPY --from=builder /app/src/lib/data/db/migrations ./src/lib/data/db/migrations

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy entrypoint script
COPY entrypoint.sh /app/entrypoint.sh

# Expose port
EXPOSE 80

ENV PORT=80
ENV HOSTNAME="0.0.0.0"
ENV NODE_ENV=production

# Override the default node entrypoint completely
ENTRYPOINT []
CMD ["/bin/sh", "/app/entrypoint.sh"]