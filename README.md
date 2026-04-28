<p align="center">
  <img src="src/app/icon.svg" alt="Ananse Ntontan — Adinkra symbol for Anansi" width="96" height="96" />
</p>

<h1 align="center">Anansi</h1>

<p align="center">
  Personal operating system for goals, relationships, and values.<br />
  Self-hosted. Single user. Built for the long arc, not the dopamine hit.
</p>

---

Anansi is named after the West African spider trickster — whose Adinkra symbol **Ananse Ntontan** (the spider's web) represents wisdom, creativity, and the complexity of life. The icon above is that web.

The app sits at the intersection of "what do I want" (goals, tasks, values), "who am I to the people around me" (a reflection-only Personal CRM), and "what am I noticing about myself" (the Self living portrait). Nothing here is a contact manager or a productivity tracker — it's a thinking surface.

## Features

- **Goals canvas (`Objectives`)** — Hierarchical goals with parent-child links, free-positioned cards on a React Flow canvas, and weighted connections (0–100) that auto-derive importance (Low/Medium/High).
- **Tasks** — Per-goal tasks with title, emoji, description, difficulty, deadline, referent people, and group tags. The cross-goal `Tasks` tab is a searchable flat list grouped by goal.
- **Horizons** — Tasks bucketed into `Backlog` / `This Month` / `This Quarter` / `This Year` based on `scheduledAt`. Buckets are computed at render — a task auto-promotes as the deadline approaches.
- **Pulse** — Daily landing view. Sync items + unified Upcoming feed (next bids + important dates) + On the Horizon (Month/Quarter/Year, year collapsed by default).
- **Weekly Sync** — Reusable user-owned tracking-items library, sync templates (one default per user, auto-snapshotted into each new sync), inline text per item, and binary attachments.
- **Personal CRM** — A reflection surface, not a rolodex. People sit in a 4-column Kanban (`To Process` / `Exploring` / `Long-term` / `Context-bound`). Per-person prompts: appreciation, my needs, legacy message, self-reflection. Plus per-person `Next bids` (gestures, gifts, repairs) and yearly `Important dates` (birthdays, anniversaries) that surface in Pulse.
- **Self** — A living portrait, not a tracker. Prose fields (this-year description, my story, attachment tendencies, love/apology/conflict/stress patterns, note-to-future-self) plus list buckets (energizers, drainers, just-for-me, proud, patterns, triggers, releases, year-ahead). Empty fields read as clean pages, not unfinished forms.
- **Bucket List** — Things to do before dying, optionally tagged with the people you want to do them with.
- **Values** — Named + colored tags on goals; values carry their own behavior list (short evidence sentences).
- **Groups** — Cross-entity tags spanning both people and tasks. The same `Family` group can hold both your partner and the "call mom" task.
- **Backup / Import** — Full per-user JSON+base64 export and transactional replace import.

## Stack

- **Frontend:** Next.js 16 (App Router), React 19 (with React Compiler), TypeScript, Tailwind, React Flow (`@xyflow/react`), Framer Motion, dnd-kit.
- **API:** tRPC v11 with TanStack Query v5, App-Router-native client (`createTRPCReact`).
- **Auth:** HttpOnly JWT cookies via `jose` (encrypted JWE A256GCM) + bcrypt password hashing. Rate-limited login + register routes.
- **Database:** PostgreSQL 17 via Drizzle ORM + Drizzle Kit migrations.
- **Storage:** Filesystem-backed `uploads/{userId}/` for avatars, person photos, weekly-sync attachments. Polymorphic `attachments` table with magic-byte-validated upload.

Deeper architectural detail lives in [`CLAUDE.md`](./CLAUDE.md) — it's the single source of truth for schema, endpoints, and feature design intent.

## Local development

Requires Node 20+ and a Postgres database. The simplest free option is a [Supabase](https://supabase.com) project — use the **Session pooler** connection string (Project → Connect → Session pooler), which is IPv4-compatible and works on the free tier.

```bash
# 1. Create .env at the repo root.
cp .env.example .env
# then fill in:
#   DATABASE_URL — Supabase Session pooler URL (URL-encode special chars in the password)
#   JWT_SECRET   — 32+ chars; generate with: openssl rand -base64 48

# 2. Install deps
npm ci

# 3. Apply migrations
npm run db:migrate

# 4. Start the dev server
npm run dev
```

App lands on <http://localhost:3000>.

### First user

There's no seed script — register your first user via the app's `/register` page. For automated flows (Playwright, smoke testing), the conventional credentials are `santi@test.local` / `devpassword`. To insert that user directly:

```bash
HASH=$(node -e "console.log(require('bcryptjs').hashSync('devpassword', 10))")
ID=$(node -e "console.log(require('@paralleldrive/cuid2').createId())")
psql "$DATABASE_URL" \
  -c "INSERT INTO users (id, name, email, password) VALUES ('$ID', 'Santi', 'santi@test.local', '$HASH');"
```

## Pre-flight checks

Run all three before opening a PR. Zero is the only acceptable count:

```bash
npm run format      # Prettier — formats in place
npm run lint        # ESLint — must end clean
npm run typecheck   # tsc --noEmit
npm run build       # next build
```

CI runs lint + typecheck + build on every PR (`.github/workflows/ci.yml`). The Docker image is published on version-bump only (`docker-publish.yml`).

## Deployment

Anansi is a standalone Next.js app behind Traefik on a NAS. Image is published to `ghcr.io/<owner>/<repo>:latest` on every `package.json` version bump.

```bash
# Pull and run on the host (see docker-compose.yml for the production layout)
docker compose pull
docker compose up -d
```

Required env:

- `DATABASE_URL` — Postgres connection string.
- `JWT_SECRET` — at least 32 characters; the app refuses to boot without it. Generate with `openssl rand -base64 48`.

The container runs as a non-root `app` user, exposes a `/api/healthz` route (DB roundtrip check), and applies pending migrations on boot before exec-ing into Next.

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) — architecture, schema, API endpoints, feature design notes. The canonical doc.
- [`TODO.md`](./TODO.md) — backlog of outstanding features and follow-ups.

## License

Private. Personal project.
