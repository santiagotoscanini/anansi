# Multi-stage Next.js standalone build. Three stages keep the runtime image
# small (~150 MB) by leaving every dev dep, the source tree, and the build
# cache behind. Pairs with `output: "standalone"` in next.config.js — Next
# emits .next/standalone/server.js with only the runtime-needed node_modules.
#
# Build args expose NEXT_PUBLIC_* env vars to the builder stage so they get
# inlined into the client bundle. These are "publishable" Supabase values
# (per the project's CLAUDE.md), safe to embed in the image. Server-only
# secrets (DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are passed at runtime.

# ───── Stage 1: deps ─────────────────────────────────────────────────────
# Resolve node_modules ONCE against an immutable lockfile. This layer is
# cached across builds and only invalidates when package*.json changes.
FROM node:20-alpine AS deps
WORKDIR /app
# libc6-compat is required by some npm packages that ship glibc-linked
# binaries (pg native bindings, etc.) and run under Alpine's musl.
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ───── Stage 2: builder ──────────────────────────────────────────────────
# Run the actual Next build. Inherits node_modules from stage 1.
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Public Supabase config — inlined into the client bundle at build time.
# Pass via --build-arg from the GHA workflow (sourced from repo Variables).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ───── Stage 3: runtime ──────────────────────────────────────────────────
# The standalone server + its trimmed node_modules. Static assets and
# /public are copied separately — Next's standalone output excludes them.
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Non-root runtime user. Matches the UID/GID convention from Vercel's
# official Dockerfile so any volume mounts behave predictably.
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

# Standalone output writes server.js at the WORKDIR root.
CMD ["node", "server.js"]
