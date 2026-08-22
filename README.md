<p align="center">
  <img src="public/icon.svg" alt="Ananse Ntontan — Adinkra symbol for Anansi" width="96" height="96" />
</p>

<h1 align="center">Anansi</h1>

<p align="center">
  Personal operating system for goals, relationships, and values.<br />
  Self-hosted. Single user. Built for the long arc.
</p>

---

Anansi is named after the West African spider trickster — whose Adinkra symbol **Ananse Ntontan** (the spider's web) represents wisdom, creativity, and the complexity of life. The icon above is that web.

The app sits at the intersection of "what do I want" (goals, tasks, values), "who am I to the people around me" (a reflection-only Personal CRM), and "what am I noticing about myself" (the Self living portrait). It's a thinking surface.

## Features

- **Goals canvas (`Objectives`).** Hierarchical goals with parent-child links, free-positioned cards on a React Flow canvas, and weighted connections (0–100) that auto-derive importance (Low/Medium/High).
- **Tasks.** Per-goal tasks with title, emoji, description, difficulty, deadline, referent people, and group tags. The cross-goal `Tasks` tab is a searchable flat list grouped by goal.
- **Horizons.** Tasks bucketed into `Backlog` / `This Month` / `This Quarter` / `This Year` based on `scheduledAt`. Buckets are computed at render, so a task auto-promotes as the deadline approaches.
- **Pulse.** Daily landing view. Sync items + unified Upcoming feed (next bids + important dates) + On the Horizon (Month/Quarter/Year, year collapsed by default).
- **Weekly Sync.** Reusable user-owned tracking-items library, sync templates (one default per user, auto-snapshotted into each new sync), inline text per item, and binary attachments.
- **Personal CRM.** A reflection surface. People sit in a 4-column Kanban (`To Process` / `Exploring` / `Long-term` / `Context-bound`). Per-person prompts: appreciation, my needs, legacy message, self-reflection. Plus per-person `Next bids` (gestures, gifts, repairs) and yearly `Important dates` (birthdays, anniversaries) that surface in Pulse.
- **Self.** A portrait you keep rewriting. Prose fields (this-year description, my story, attachment tendencies, love/apology/conflict/stress patterns, note-to-future-self) plus list buckets (energizers, drainers, just-for-me, proud, patterns, triggers, releases, year-ahead). Empty fields read as clean pages, not unfinished forms.
- **Bucket List.** Things to do before dying, optionally tagged with the people you want to do them with.
- **Values.** Named + colored tags on goals; values carry their own behavior list (short evidence sentences).
- **Groups.** Cross-entity tags spanning both people and tasks. The same `Family` group can hold both your partner and the "call mom" task.
- **Backup / Import.** Full per-user JSON+base64 export and transactional replace import.
- **MCP server.** A remote Model Context Protocol server at `POST /api/mcp` exposing 51 tools, so Claude can read and write your goals, people, values and Self entries. It is its own OAuth 2.1 authorization server.

## Stack

- **Framework:** TanStack Start (Vite 8 + Nitro), TanStack Router file routes, React 19 with the React Compiler, TypeScript.
- **Data:** TanStack Query + `createServerFn` server functions calling a plain service layer. No tRPC.
- **UI:** Tailwind v4 (no PostCSS step), React Flow (`@xyflow/react`), Lucide, dnd-kit, i18next (EN + ES).
- **Auth:** Auth.js v5 on `@auth/core` directly, Credentials provider, bcrypt password hashing, JWT session cookie. The browser bundle contains no auth SDK.
- **Database:** PostgreSQL via Drizzle ORM + Drizzle Kit migrations.
- **Storage:** All uploads live in a `files` Postgres table as `bytea`, served by `/api/files/{id}` behind a session + owner check. No object store, no filesystem writes.

Deeper architectural detail lives in [`CLAUDE.md`](./CLAUDE.md) — it's the single source of truth for schema, endpoints, and feature design intent.

## Local development

Requires **Node 24+** and **pnpm 11** (`corepack enable`), plus a Postgres database — local Docker, RDS, a Supabase session-pooler URL, anything.

```bash
# 1. Create .env at the repo root.
cp .env.example .env
# then fill in:
#   DATABASE_URL — any Postgres connection string
#   AUTH_SECRET  — generate with: openssl rand -base64 32

# 2. Install deps
pnpm install

# 3. Apply migrations (creates the whole schema, accounts table included)
pnpm db:migrate

# 4. Start the dev server
pnpm dev
```

Dev lands on <http://localhost:5173>. The production build serves on `:3000`:

```bash
pnpm build && pnpm start
```

> **`env -u DATABASE_URL` is often needed in front of these commands.** A stale
> ambient `DATABASE_URL` beats `.env` (dotenv does not override already-set
> vars), and the failure looks like an unrelated connection error rather than a
> config problem.

### First user

Register at <http://localhost:5173/register> — name, email, password, submit. The `signUp` server function bcrypts the password, inserts the user row and signs you in. There's no confirmation email and no second step.

The conventional test user for automated flows is `santi@test.local` / `devpassword12345` (the register form enforces a 12-character minimum). Once it exists, populate every tab with a deterministic dataset:

```bash
env -u DATABASE_URL npx tsx scripts/seed-dev-data.ts
```

There is no password reset flow. If you lock yourself out locally, re-register with a different email or delete the user row and start over.

### Adding a dependency

`pnpm-workspace.yaml` sets `minimumReleaseAge: 10080` — no package published in the last 7 days may be used, enforced on **every** install including `--frozen-lockfile`. So:

```bash
# comment out minimumReleaseAge in pnpm-workspace.yaml
pnpm add <pkg>
# restore minimumReleaseAge
pnpm install --frozen-lockfile   # ← the step that catches a too-young TRANSITIVE dep
```

That last command fails more often than the `pnpm add` does. `pnpm dlx` from this repo needs `--config.minimum-release-age=0`.

## Pre-flight checks

Run all four before opening a PR. Zero warnings and zero errors is the only acceptable count:

```bash
pnpm format           # Prettier — formats in place
pnpm lint             # ESLint — must end clean
pnpm typecheck        # tsr generate && tsc --noEmit
pnpm check:mcp-tools  # MCP tool catalog vs .golden/mcp-tools.json — zero diff
pnpm build            # vite build (client + SSR + nitro)
```

CI runs `format:check` → `lint` → `typecheck` → `check:mcp-tools` → `build` on every PR, then greps the built client assets for server modules and env placeholders, boots the built server, and runs the font and i18n checks against it (`.github/workflows/ci.yml`). `.github/workflows/release.yml` calls that whole workflow as a gate, so nothing ships unvalidated.

`scripts/check-shell.mjs` is the one check CI does not run — it signs in and loads `/app`, so it needs a real Postgres and a seeded user. Run it locally.

> Don't run `pnpm typecheck` while `pnpm dev` is running — both generate
> `routeTree.gen.ts`, and racing them puts the dev server into a reload loop
> that looks like an app bug.

**A green build is not evidence that the app runs.** Several defects during the TanStack migration passed `vite build` and failed on the first real request. Exercise changes in `pnpm dev` from a real browser, and include client-side navigation — a hard reload runs loaders on the server, where a server function is a direct call, so only client-side navigation tests the RPC path.

## Deployment

Anansi ships as a Docker image: a `node:24` builder producing Nitro's self-contained `.output/`, and a `node:24-slim` runtime that runs as a non-root user. `.github/workflows/release.yml` builds `linux/amd64` on every push to `main` and pushes `:latest` to a self-hosted zot registry.

```bash
docker build -t anansi .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://... \
  -e AUTH_SECRET=$(openssl rand -base64 32) \
  anansi
```

`start.mjs` is the entrypoint: it preflights both env vars, applies outstanding Drizzle migrations, then imports the Nitro server in the same process. Migrations are idempotent, so re-runs are free.

Required env:

- `DATABASE_URL` — Postgres connection string.
- `AUTH_SECRET` — 32+ characters; signs the Auth.js JWT session cookie. The container refuses to boot without it.
- `MIGRATE_ONLY=1` *(optional)* — apply migrations and exit 0 without starting the server. Used as a systemd `ExecStartPre` so a failed migration can't be papered over by a healthy-looking boot.

The image has a `HEALTHCHECK` against `/api/healthz`, which round-trips a `SELECT 1` — unhealthy means "can't serve", not merely "process dead".

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) — architecture, schema, service surface, feature design notes. The canonical doc.
- [`todo.md`](./todo.md) — backlog of outstanding features and follow-ups.
- [`.golden/README.md`](./.golden/README.md) — the pre-migration baseline oracle (MCP tool catalog, `.well-known` documents, screenshots) and how to diff against it.

## License

Private. Personal project.
