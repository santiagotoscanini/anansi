# Multi-stage Next.js standalone build. Three stages keep the runtime image
# small (~150 MB) by leaving every dev dep, the source tree, and the build
# cache behind. Pairs with `output: "standalone"` in next.config.js — Next
# emits .next/standalone/server.js with only the runtime-needed node_modules.
#
# No build-time secrets — every Supabase credential (URL, publishable key,
# service-role key) is read by server-only code at runtime. The browser bundle
# carries no Supabase config at all (auth flows through server actions in
# src/app/auth/actions.ts), so the image is fully portable: rotate Supabase
# keys without rebuilding, deploy the same image against staging or prod by
# changing env vars at `docker run` time.

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

USER nextjs

ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

# Standalone output writes server.js at the WORKDIR root.
CMD ["node", "server.js"]
