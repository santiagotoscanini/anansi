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
- **Arrange.** One button (and one MCP tool) lays the whole goal graph out from its connections, with undo.
- **Mentions.** Type `@` and a name in a journal day, a weekly sync note or a task, and the person is linked; each person's page lists everywhere they are mentioned.
- **Tasks.** Per-goal tasks with title, emoji, description, difficulty, deadline, referent people, and group tags. The cross-goal `Tasks` tab is a searchable flat list grouped by goal.
- **Horizons.** Tasks bucketed into `Backlog` / `This Month` / `This Quarter` / `This Year` based on `scheduledAt`. Buckets are computed at render, so a task auto-promotes as the deadline approaches.
- **Pulse.** Daily landing view. Sync items + unified Upcoming feed (next bids + important dates) + On the Horizon (Month/Quarter/Year, year collapsed by default).
- **Weekly Sync.** Reusable user-owned tracking-items library, sync templates (one default per user, auto-snapshotted into each new sync), inline text per item, and binary attachments.
- **Over time.** Pick one tracking item and look at it across every week: its pictures as a time-lapse on a real timeline, two weeks compared under a divider, or every week on one sheet with the missed ones marked. On the web and the phone.
- **Journal.** One entry per calendar day, written like a diary: the day's highlights, free text, pictures, and the people it was about. Typing `@` and a name mentions a person, and each person's page lists the days that mention them. Built to be written by talking the day through with Claude; the web and the iPhone app read and edit the same days.
- **Personal CRM.** A reflection surface. People sit in a 4-column Kanban (`To Process` / `Exploring` / `Long-term` / `Context-bound`). Per-person prompts: appreciation, my needs, legacy message, self-reflection. Plus per-person `Next bids` (gestures, gifts, repairs) and yearly `Important dates` (birthdays, anniversaries) that surface in Pulse.
- **Self.** A portrait you keep rewriting. Prose fields (this-year description, my story, attachment tendencies, love/apology/conflict/stress patterns, note-to-future-self) plus list buckets (energizers, drainers, just-for-me, proud, patterns, triggers, releases, year-ahead). Empty fields read as clean pages, not unfinished forms.
- **Bucket List.** Things to do before dying, optionally tagged with the people you want to do them with.
- **Values.** Named + colored tags on goals; values carry their own behavior list (short evidence sentences).
- **Groups.** Cross-entity tags spanning both people and tasks. The same `Family` group can hold both your partner and the "call mom" task.
- **Backup / Import.** Full per-user JSON+base64 export and transactional replace import.
- **MCP server.** A remote Model Context Protocol server at `POST /api/mcp` exposing 91 tools, so Claude can run the whole app: goals, tasks, people, values, Self, Pulse, the weekly sync and the journal. It is its own OAuth 2.1 authorization server.

## Stack

- **Framework:** TanStack Start (Vite 8 + Nitro), TanStack Router file routes, React 19 with the React Compiler, TypeScript.
- **Data:** TanStack Query + `createServerFn` server functions calling a plain service layer. No tRPC.
- **UI:** Tailwind v4 (no PostCSS step), React Flow (`@xyflow/react`), Lucide, dnd-kit, i18next (EN + ES).
- **Auth:** Auth.js v5 on `@auth/core` directly, Credentials provider, bcrypt password hashing, JWT session cookie. The browser bundle contains no auth SDK.
- **Database:** PostgreSQL via Drizzle ORM + Drizzle Kit migrations.
- **Storage:** Every upload is a `files` row in Postgres whose bytes live in the app's private S3 bucket (Garage, on the same box) at `files/<id>`, served by `/api/files/{id}` behind a session + owner check. No presigned URLs, no filesystem writes.

Deeper architectural detail lives in [`AGENTS.md`](./AGENTS.md) — it's the single source of truth for schema, endpoints, and feature design intent.

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

`pnpm ci` runs `format:check` → `lint` → `typecheck` → `check:mcp-tools` → `check:bundle` (the grep of the built client assets for server modules and env placeholders), and the box runs exactly that inside the image build on every push to `main` — see [Deployment](#deployment). A failure there fails the build, so nothing ships unvalidated.

Three checks are **not automated today** — nothing runs them anywhere, so run them by hand:

- `scripts/check-fonts.mjs` and `scripts/check-i18n.mjs` need a booted server and a Playwright chromium. They used to run in a GitHub Actions workflow that no longer exists. Run them after touching fonts or translations; neither needs a database.
- `scripts/check-shell.mjs` signs in and loads `/app`, so it needs a real Postgres and a seeded user.

> Don't run `pnpm typecheck` while `pnpm dev` is running — both generate
> `routeTree.gen.ts`, and racing them puts the dev server into a reload loop
> that looks like an app bug.

**A green build is not evidence that the app runs.** Several defects during the TanStack migration passed `vite build` and failed on the first real request. Exercise changes in `pnpm dev` from a real browser, and include client-side navigation — a hard reload runs loaders on the server, where a server function is a direct call, so only client-side navigation tests the RPC path.

## Deployment

Anansi ships as a container image, and the server it runs on builds it. Every push to `main` is picked up by daedalus's GitHub App, which runs `pnpm ci` inside an image build driven by rootless BuildKit + Railpack (`railpack.json`), then pushes `sha-<sha>` and `latest` to that box's own zot registry (`registry.toscanini.me/anansi`). A deploy timer notices the new digest and restarts the container: live in about two minutes, with nothing leaving the network. Results come back to GitHub as a check run named `daedalus` plus a Deployment — there are no workflow files in this repo and no registry credentials to configure.

`railpack.json` is the whole build definition — there is no Dockerfile, so a build definition that turns out to be wrong is rolled back with `git revert` of the commit that changed it. `exclude` in that file is the build-context filter (`.dockerignore` syntax, `!` negation included) and `deploy.inputs` is the exact list of what the runtime image contains.

Run it locally without an image at all:

```bash
pnpm build
DATABASE_URL=postgresql://... AUTH_SECRET=$(openssl rand -base64 32) node start.mjs
```

`pnpm ci` is the same check suite the server runs inside the build, so a green `pnpm ci` locally is a green build there. For a **real** image without deploying it, set the app's publish mode to *Candidate* in daedalus and press *Build now*: the same Railpack build runs and pushes `candidate-<sha>` to the registry, and nothing is deployed.

`start.mjs` is the entrypoint: it preflights both env vars, applies outstanding Drizzle migrations, then imports the Nitro server in the same process. Migrations are idempotent, so re-runs are free.

Required env:

- `DATABASE_URL` — Postgres connection string.
- `AUTH_SECRET` — 32+ characters; signs the Auth.js JWT session cookie. The container refuses to boot without it.
- `MIGRATE_ONLY=1` *(optional)* — apply migrations and exit 0 without starting the server. Used as a systemd `ExecStartPre` so a failed migration can't be papered over by a healthy-looking boot.

`/api/healthz` round-trips a `SELECT 1`, so a 200 there means "can serve", not merely "process alive". A Railpack image declares no `HEALTHCHECK` of its own — the probe is external (gatus on the host), which is the right place for it.

## Documentation

- [`AGENTS.md`](./AGENTS.md) — architecture, schema, service surface, feature design notes. The canonical doc.
- [`todo.md`](./todo.md) — backlog of outstanding features and follow-ups.
- [`.golden/README.md`](./.golden/README.md) — the pre-migration baseline oracle (MCP tool catalog, `.well-known` documents, screenshots) and how to diff against it.

## License

Private. Personal project.
