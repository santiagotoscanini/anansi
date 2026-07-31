# Two-stage TanStack Start build. `vite build` (with the Nitro adapter) emits
# `.output/` — a self-contained server bundle plus the hashed client assets —
# so the runtime stage needs almost nothing else. Two stages rather than three
# because pnpm's content-addressed store makes a separate deps stage cheap to
# fold into the builder; the runtime image never sees node_modules at all
# except for the two dirs start.mjs imports directly.
#
# No build-time secrets. The only runtime env vars the image needs are
# DATABASE_URL (Postgres) and AUTH_SECRET (Auth.js JWT signing). Set them at
# `docker run` time — the image stays portable across environments.
#
# One build ARG, NPM_REGISTRY — a hostname, not a credential. It defaults to
# npmjs so `docker build .` works on any machine; release.yml overrides it with
# the box's own Verdaccio so the server's builds resolve through the local
# proxy. See the note above the install step.

# ───── Stage 1: builder ──────────────────────────────────────────────────
FROM node:24 AS builder
WORKDIR /app
RUN corepack enable

# node-linker=hoisted produces a flat, npm-style node_modules instead of
# pnpm's default symlinks into .pnpm/. That is load-bearing here: the runtime
# stage copies node_modules/drizzle-orm and node_modules/postgres as standalone
# directories, and a symlink into a .pnpm store that is never copied would
# arrive dangling — start.mjs would then fail to import them at boot.
#
# --frozen-lockfile does NOT exempt the build from the supply-chain cooldown in
# pnpm-workspace.yaml. pnpm re-verifies every lockfile entry against the policy
# on each install and fails with ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION if any
# is too young — resolution is not the only gate. So a lockfile committed with
# the cooldown disabled locally breaks the image build, not just `pnpm add`.
#
# That also makes the registry's `time` metadata load-bearing here: the policy
# reads publish dates from the packument. Verdaccio proxies them through intact
# (verified), but a proxy that stripped `time` would break this step.
#
# Which registry: none named here. pnpm-workspace.yaml pins `registry:` to the
# self-hosted Verdaccio and is COPY'd in below, so the build inherits the same
# gate as local dev and CI — one declaration, no per-environment drift.
#
# NPM_REGISTRY is the emergency override, empty by default. Set it to build
# against a different registry without editing the repo:
#   podman build --build-arg NPM_REGISTRY=https://registry.npmjs.org/ .
# Empty means "use whatever pnpm-workspace.yaml says", so the default path
# cannot silently bypass the proxy.
#
# `--config.registry` is the only spelling that works: pnpm silently IGNORES
# the npm_config_registry / NPM_CONFIG_REGISTRY env vars, so setting one here
# would resolve from npmjs while looking correct.
#
# COREPACK_NPM_REGISTRY closes the last direct download. `corepack enable` above
# only installs shims; the pnpm BINARY itself is fetched on the first `pnpm`
# invocation — which is this line — and corepack reads none of pnpm's config, so
# without this it pulls pnpm straight from npmjs and skips the proxy entirely:
#   ! Corepack is about to download https://registry.npmjs.org/pnpm/-/pnpm-11.18.0.tgz
#
# The registry is read OUT of pnpm-workspace.yaml rather than restated, so the
# gate has exactly one source of truth and corepack cannot drift from pnpm.
ARG NPM_REGISTRY=
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN REGISTRY="${NPM_REGISTRY:-$(sed -n 's|^registry:[[:space:]]*||p' pnpm-workspace.yaml)}" \
    && test -n "$REGISTRY" \
    && COREPACK_NPM_REGISTRY="$REGISTRY" \
       pnpm install --frozen-lockfile --config.node-linker=hoisted --config.registry="$REGISTRY"

COPY . .

# src/lib/env.ts validates at import time and the build imports the server
# graph, so these must be present — but nothing connects to a database here.
# The values only have to satisfy the schema (AUTH_SECRET has a 32-char
# minimum).
#
# Set inline on the RUN rather than with ENV: an ENV is recorded in the image
# config and inherited by every later layer, so a placeholder that looks like a
# credential would ship in the builder image's metadata. Inline, it exists only
# for the duration of this one command.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    AUTH_SECRET=build-placeholder-secret-not-used-for-anything-real \
    pnpm build

# ───── Stage 2: runtime ──────────────────────────────────────────────────
# Nitro's .output is fully self-contained: server bundle, its dependencies,
# and .output/public for the client assets. node:24-slim (Debian) rather than
# alpine so glibc-linked native binaries work without the libc6-compat dance.
FROM node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Non-root runtime user.
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 --ingroup nodejs anansi

COPY --from=builder --chown=anansi:nodejs /app/.output ./.output

# Migration runner + SQL files. The runner (start.mjs) lives at the WORKDIR
# root next to .output; the SQL ledger lives under ./drizzle/migrations so the
# path matches what start.mjs passes to migrate().
#
# `drizzle-orm` and `postgres` are also copied because Nitro bundles runtime
# deps *into* .output rather than emitting them as importable node_modules.
# start.mjs is a sibling script that resolves them through Node, so they have
# to exist on disk. drizzle-orm has zero hard runtime deps and postgres has
# none either, so this is just two flat dirs — no transitive dep walking.
COPY --from=builder --chown=anansi:nodejs /app/start.mjs ./start.mjs
COPY --from=builder --chown=anansi:nodejs /app/src/lib/data/db/migrations ./drizzle/migrations
COPY --from=builder --chown=anansi:nodejs /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=builder --chown=anansi:nodejs /app/node_modules/postgres ./node_modules/postgres

USER anansi

# HOST, not HOSTNAME — that was Next standalone's spelling. Nitro's node-server
# preset reads HOST (and NITRO_HOST); HOSTNAME would leave it on the default.
ENV PORT=3000
ENV HOST=0.0.0.0
EXPOSE 3000

# /api/healthz round-trips a `SELECT 1` to Postgres, so an unhealthy container
# means "can't serve", not merely "process alive". start-period covers the
# migration run, which happens before the server listens at all.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# start.mjs applies migrations then imports the Nitro server. Single Node
# process — signals from the container runtime hit the server cleanly. Pass
# MIGRATE_ONLY=1 to short-circuit after migrations (clean fit for a NixOS
# ExecStartPre that gates the app service on a successful migration run).
CMD ["node", "start.mjs"]
