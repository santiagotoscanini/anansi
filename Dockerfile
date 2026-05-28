# Multi-stage Next.js standalone build. Three stages keep the runtime image
# small (~150 MB) by leaving every dev dep, the source tree, and the build
# cache behind. Pairs with `output: "standalone"` in next.config.js — Next
# emits .next/standalone/server.js with only the runtime-needed node_modules.
#
# No build-time secrets. The only runtime env vars the image needs are
# DATABASE_URL (Postgres) and AUTH_SECRET (Auth.js JWT signing). Set them at
# `docker run` time — the image stays portable across environments.

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
# This project has no `public/` directory — Next's icon conventions colocate
# apple-icon.png / icon.png / icon.svg under src/app/. Ensure the path exists
# so the runtime stage's COPY succeeds whether or not a public/ dir is later
# added (cheaper than making the COPY conditional with BuildKit tricks).
RUN mkdir -p public

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

# Migration runner + SQL files. The runner (start.mjs) lives at the WORKDIR
# root next to server.js; the SQL ledger lives under ./drizzle/migrations so
# the path matches what start.mjs passes to migrate().
#
# `drizzle-orm` and `postgres` are also copied from the deps stage because
# Next's webpack standalone tracing inlines runtime deps into .next chunks
# rather than emitting them as real node_modules. start.mjs is a sibling
# script that needs to `import` them through Node's resolution, so they have
# to exist on disk. drizzle-orm has zero hard runtime deps and postgres has
# none either, so this is just two flat dirs — no transitive dep walking.
COPY --from=builder --chown=nextjs:nodejs /app/start.mjs ./start.mjs
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/data/db/migrations ./drizzle/migrations
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/postgres ./node_modules/postgres

USER nextjs

ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

# start.mjs applies migrations then imports server.js. Single Node process —
# signals from the container runtime hit the server cleanly. Pass MIGRATE_ONLY=1
# to short-circuit after migrations (clean fit for a NixOS ExecStartPre that
# gates the app service on a successful migration run).
CMD ["node", "start.mjs"]
