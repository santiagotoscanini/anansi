# Anansi

Personal operating system for goals, relationships, and values. Named after Anansi — the West African spider trickster — whose Adinkra symbol **Ananse Ntontan** (the spider's web) represents wisdom, creativity, and the complexity of life. The app's icon is that web.

Feature surface: visual goal hierarchies with weighted connections, weekly progress retrospectives, a Personal CRM for reflecting on relationships, user-defined values that tag goals, and custom groups that span both people and tasks (e.g. "Family" can hold both my partner and the "call mom" task).

## Local dev credentials

The local Postgres (`docker-compose.dev.yml`, port 15822) has a single seeded test user for automated flows (Playwright, manual smoke testing):

- **Email:** `santi@test.local`
- **Password:** `devpassword`

Local dev DB only — do not reuse in production. To reset if the password drifts:

```bash
HASH=$(node -e "console.log(require('bcryptjs').hashSync('devpassword', 10))")
docker exec goals-db psql -U user -d goals_db \
  -c "UPDATE users SET password = '$HASH', updated_at = now() WHERE email = 'santi@test.local';"
```

To log in: open `http://localhost:3000`, enter the email + password above, click "Sign In".

## Stack

- **Frontend:** Next.js 16 (app dir), React 19, TypeScript, Tailwind, React Flow (`@xyflow/react`), Framer Motion, Lucide, dnd-kit
- **Backend:** tRPC v11, Next.js API routes, Jose (JWT), Zod, bcryptjs
- **Database:** PostgreSQL + Drizzle ORM + Drizzle Kit
- **State:** React Context + TanStack Query (via tRPC) + IDB Keyval

## Project Structure

```
src/
  app/
    api/trpc/[trpc]/         # tRPC API endpoints
    uploads/[...path]/       # File serving route (protected)
    layout.tsx, page.tsx     # Root layout + main page
  components/goals/          # All feature components
    GoalsDashboard.tsx       # Top-level shell with sidebar nav
    GoalsGraph.tsx           # React Flow goal network
    GoalNode.tsx             # Goal card on canvas (with referent avatar cluster)
    GoalModal.tsx            # Goal create/edit
    TaskModal.tsx            # Per-task editor (title, emoji, description, deadline, difficulty, referents, groups, completion)
    Tasks.tsx                # Cross-goal Tasks tab — search + tasks grouped by goal
    EditableEdge.tsx         # Connection weight editor
    ValuesManager.tsx        # Values + behaviors
    WeeklyRetrospective.tsx  # Weekly sync interface
    LifeProgress.tsx         # Progress dashboard
    PeopleManager.tsx, PersonModal.tsx, RelationshipsBoard.tsx
    Self.tsx                 # "Living portrait" page
    BucketListItemModal.tsx
    ColorPicker.tsx, DatePicker.tsx, Avatar.tsx  # Shared inputs
  contexts/GoalsContext.tsx  # Global state
  lib/
    api/                     # tRPC config + routers (auth.ts, goals.ts, root.ts, trpc.ts)
    data/                    # schema.ts, db connection, migrations/
    horizon-period.ts        # Task scheduling bucket math
    auth-client.ts, auth-server.ts, image-upload.ts
  trpc/react.tsx
  styles/

uploads/{userId}/...         # File storage (outside src/)
```

## Features

### Goals
- Hierarchical goals with parent-child links and free-positioned cards on a React Flow canvas.
- **Weighted connections** between goals (0–100). Importance is computed live from outgoing-edge weights; **Low** ≤33.3, **Medium** 33.3–66.6, **High** ≥66.6.
- **Values** (named + colored) tag goals via `goal_values`; values also carry their own behavior list.

### Tasks
- Per-goal, with title, optional emoji (distinct from the goal's emoji), description, difficulty 1–3, completion, optional `scheduledAt` deadline, referent people, and group tags.
- **Cross-Goal Tasks tab** — searchable flat list grouped by parent goal. Row click → `TaskModal` (full editor). The graph + GoalModal still own quick row affordances (toggle complete, inline date picker, referent/group popovers); the Tasks tab is where description + emoji edits happen since they don't fit on a row.
- **Horizons tab** buckets tasks into `Backlog` / `This Month` / `This Quarter` / `This Year` (plus auto-flagged `Past due` / `Later`) by computing the bucket from `scheduledAt` and the current calendar — no enum stored, so a task auto-promotes as the deadline approaches. Bucket math in `src/lib/horizon-period.ts`.

### Pulse (top-level daily landing)
Sync items + unified Upcoming feed (next bids + important dates) + On the Horizon (Month/Quarter/Year, year collapsed by default).

### Weekly retrospectives
User-owned tracking-items library (goal optional → "Unscoped"), reusable sync templates (one default per user auto-snapshots into each new sync), inline `text_content` per sync item, and binary attachments under `uploads/{userId}/attachments/`.

### Personal CRM (People + Self)
- People are a **reflection surface**, not a contact manager — phone/email/birthday/last-contact/vCard import were intentionally removed.
- 4-column Relationships board: `to_process`, `exploring`, `long_term`, `context_bound`. Category is required at create time.
- Per-person prompts: appreciation, my needs, legacy message (catch-all for unfinished business), self-reflection.
- **Next bids** (per-person actionable items — gift, gesture, check-in, apology) with optional `dueAt`. Completed bids stay visible (struck through).
- **Important dates** — yearly recurring (birthday, anniversary, …); surfaces in Pulse within 30 days.
- **Bucket list** with optional linked people ("people I want to do this with").
- **Groups** (user-defined tags) are cross-entity: same group rows tag both people (`people_to_groups`) and tasks (`tasks_to_groups`).
- **Self page** — "living portrait": prose fields on `user_self` + list buckets in `self_list_items` (energizers, drainers, just-for-me, proud, patterns by category, triggers, released, year-ahead). Empty fields = clean page, not unfinished form.

### Auth & multi-user
Password-based with bcrypt + JWT (Jose). Full per-user data isolation. Profile page allows name/email/password edit and avatar upload (deterministic-initial fallback when no avatar).

### File management
Image, document, and other binary uploads on weekly-sync items; built-in inline text editor for sync notes (DB-only, no filesystem).

## Database Structure

**Conventions for every table:** `id` (text, primary key, cuid2), `createdAt` and `updatedAt` (timestamp, audit). Listed only when notable. All user-scoped tables cascade-delete on `users.id`.

### users
- `name`, `email` (UNIQUE), `password` (bcrypt hash), `avatarUrl` (text, nullable — path under `/uploads/{userId}/avatar.{ext}`; null = `Avatar.tsx` initial fallback)

### values
- `name`, `color`, `userId`

### goals
- `title`, `description`, `parentId` (nullable, self-FK), `positionX`, `positionY` (real, canvas position), `userId`

### tasks
- `goalId`, `title`, `description` (nullable — surfaces in Tasks tab + TaskModal; row only shows title), `emoji` (nullable, native unicode or `/uploads/...` URL — distinct from goal's emoji), `difficulty` (1–3), `completed` (boolean), `scheduledAt` (timestamp, nullable — single deadline; null = Backlog; bucket computed at render, not stored).
- **Linked surfaces:** referent people via `task_referents`, group tags via `tasks_to_groups`. Both cascade-delete with the task.

### connections
- `source`, `target` (FK → goals.id), `weight` (real, 0–100)

### trackingItems
User-owned library for weekly syncs. Goal-link is optional — items with `goalId IS NULL` show as "Unscoped". Goal deletion sets `goalId` to NULL (not cascade), so the item survives.
- `userId` (NOT NULL, cascade), `goalId` (nullable, ON DELETE SET NULL), `title`, `description` (nullable), `order`, `status` (enum `active|archived`, default `active`), `deletedAt` (nullable — set when referenced by an existing sync at delete time)

### syncTemplates + syncTemplateItems (junction)
Named bundles of tracking items. **Partial unique index** enforces "at most one default per user". The default auto-snapshots into each new weekly sync.
- `syncTemplates`: `userId`, `name`, `isDefault` (NOT NULL, default false)
- `syncTemplateItems`: `templateId` (cascade), `trackingItemId` (cascade), `orderIdx` (default 0); UNIQUE(templateId, trackingItemId)

### weeklySync + weeklySyncItems
- `weeklySync`: `userId`, `weekDate` (NOT NULL, Monday of the week), `templateId` (nullable, ON DELETE SET NULL — the template snapshotted from at create time)
- `weeklySyncItems`: `weeklySyncId` (cascade), `trackingItemId` (cascade), `textContent` (nullable, inline notes — replaces old notes.txt files), `orderIdx` (NOT NULL, default 0)

### attachments
Polymorphic file metadata, keyed on `(parentType, parentId)`. Today's only producer is `parentType = 'weekly_sync_item'`, but the schema is permissive so other entities can opt in without a migration. Stored at `uploads/{userId}/attachments/{id}.{ext}` — decoupled from goal/date so unscoped items can hold files.
- `userId` (cascade), `parentType` (NOT NULL discriminator), `parentId` (NOT NULL), `fileName`, `fileType` (enum: image|document|video|audio|other), `storagePath`, `sizeBytes` (nullable). Indexed on `(parentType, parentId)` and `userId`.

### goalValues (junction)
- `goalId` (FK), `valueId` (FK)

### people (Personal CRM — reflection only)
- `userId` (cascade), `name`, `emoji` (nullable), `category` (enum **NOT NULL**: `to_process|exploring|long_term|context_bound`), `boardOrder`
- Reflection prompts (all nullable text): `appreciation` (Gottman 5:1 counter-weight), `myNeeds` (unspoken needs before they become resentment), `legacyMessage` (catch-all for unfinished business — repair/release/end), `selfReflection`
- `decideBy` (timestamp, nullable — exploring-column decision deadline, default +6 months), `archivedAt` (nullable — preferred over delete; excluded from active list)

### next_bids
Per-person actionable items. Captured when noticed, not when needed. Completed bids stay visible — the trail is preserved.
- `personId` (cascade), `content`, `dueAt` (nullable, one-shot deadline; overdue badge until completion — NOT recurring), `completedAt` (nullable; null = pending)

### important_dates
Yearly-recurring per-person dates (birthday, anniversary, …). Surfaces in Pulse when next occurrence is within 30 days. Distinct from `next_bids.dueAt` (one-shot).
- `personId` (cascade), `label`, `month` (NOT NULL, 1–12), `day` (NOT NULL, 1–31), `year` (nullable — original year for "turning N" math)

### bucket_list_items + bucket_list_item_people
- `bucket_list_items`: `userId` (cascade), `content`, `description` (nullable), `completedAt` (nullable; null = pending)
- `bucket_list_item_people`: `bucketItemId` (cascade), `personId` (cascade) — "people I want to do this with"; many-to-many

### person_groups + people_to_groups + tasks_to_groups
User-defined tags spanning **both people and tasks**. The DB table name keeps `person_groups` for backwards compat; user-facing concept is just "Groups."
- `person_groups`: `userId` (cascade), `name`, `color` (hex), `orderIdx`
- `people_to_groups`: `personId` (cascade), `groupId` (cascade)
- `tasks_to_groups`: `taskId` (cascade), `groupId` (cascade)

### task_referents
Many-to-many tasks ↔ people ("people I'm relying on for this"). The first relational tie between Goals and People — deliberate, since tasks are where reflection becomes action. Rendered in GoalModal task list (chip toggles), PersonModal "Tasks I'm relying on them for", and GoalNode avatar cluster.
- `taskId` (cascade), `personId` (cascade)

### user_self (one row per user, UNIQUE on userId)
The Self page is a **living portrait**, not a tracker. Prose lives here; list buckets live in `self_list_items`. Empty fields are intentional — untouched sections must read as clean pages, not unfinished forms.
- All nullable text: `thisYearSelfDescription`, `descriptionYear` (int — auto-bumps on edit; null prompts UI to claim a year), `myStory`, `attachmentTendencies`, `loveLanguageGive`, `loveLanguageReceive`, `apologyLanguage`, `conflictStyle`, `stressResponse`, `noteToFutureSelf`

### self_list_items
One table for every list-shaped Self section. Server enforces `patternCategory` is non-null only when `kind = 'pattern'`.
- `userId` (cascade, NOT NULL), `kind` (enum: `energizer|drainer|just_for_me|proud|pattern|trigger|release|year_ahead`), `patternCategory` (enum, nullable: `relational|self_pattern|communication|body_state|choice`), `content` (max 2000 chars), `orderIdx` (NOT NULL, default 0). Indexed on `(userId, kind)`.

### Key relationships
- Users → many goals, values, weeklySync, people, trackingItems, syncTemplates, bucketListItems, personGroups; one optional userSelf row.
- Goals → many child goals (self-FK), many tasks, optional tracking items; many-to-many goals via connections; many-to-many values via goalValues.
- Tasks → many referent people via taskReferents; many groups via tasksToGroups.
- Weekly syncs → many syncItems → optional textContent + many attachments (polymorphic, parentType='weekly_sync_item').

## Computed (not stored)

- **Goal importance** — Low/Medium/High thresholds above; recomputed from outgoing connection weights.
- **Task completion rate per goal**, **goal progress**, **historical sync trends**.
- **Horizon bucket per task** — computed from `scheduledAt` + current calendar in `horizon-period.ts` (`bucketForDate`, `currentMonthRange`, `endOfCurrentBucket`, `formatScheduledShort`).
- **Current week sync existence**, **per-tracking-item attachment counts**.

## Backend endpoints (tRPC)

### auth
- `authenticate`, `register`, `me`
- `updateProfile` (rejects email collisions), `changePassword` (verifies current first)
- `uploadAvatar` (base64 → `uploads/{userId}/avatar.{ext}`; cleans stale extensions), `removeAvatar`

### goals.goals
- `getAll`, `create`, `update`, `delete` — full CRUD with tasks + value associations + cascading

### goals.values
- `getAll`, `create`, `update`, `delete` — value CRUD; deletion removes goal associations

### goals.tasks
- `create({ goalId, ...fields, referentIds?, groupIds? })` — referent/group sets at create time
- `update` — replace-set semantics on `referentIds[]`/`groupIds[]` (omit to leave unchanged); accepts `scheduledAt`
- `delete`
- `setScheduled({ id, scheduledAt })` — drag-drop endpoint for Horizons; only persists the date, bucket is client-computed
- (Pulse uses `nextBids.listUpcoming` + `importantDates.list`, see below)

### goals.connections
- `getAll`, `create`, `update`, `delete` (weight is the only mutable field)

### goals.trackingItems (replaces old `getAll`)
- `list({ goalId? })`, `create({ title, description?, goalId?, order? })`, `update`, `delete` (soft when referenced by a sync, hard otherwise)

### goals.syncTemplates
- `list`, `create({ name, isDefault? })` (clears existing default in same tx if `isDefault: true`), `update`, `delete`, `setItems({ templateId, items })` (replace-set with orderIdx)

### goals.weeklySync
- `getByWeek({ weekStart })`, `getWeeklyRetrospectiveData({ weekStart })` (hydrates everything: sync row, full library, goal-grouped items + attachments, top-level `unscopedItems[]`)
- `create({ weekDate, templateId? })` — snapshots from explicit/default template, empty otherwise
- `addItem` (idempotent), `removeItem` (drops from this sync only; library row stays; hand-deletes attachments to unlink files), `setItemText`, `reorderItems`

### goals.attachments
- `upload({ parentType: 'weekly_sync_item', parentId, fileName, fileType, data })` — base64; DB row first, FS write inside same tx so failure rolls back
- `delete({ id })` — DB delete + unlink

### goals.images
- `upload`, `uploadMultiple` — single-image / multi-image upload (used outside the weekly-sync flow)

### goals.people
- `getAll({ includeArchived? })`, `getById`, `create`, `update`, `archive`/`unarchive` (preferred), `delete` (hard, only for wrong entries)
- `setCategory` — drag-drop, updates only category + boardOrder
- `getTasksAsReferent` (with goal context), `getBucketListItemsAsParticipant` (read-only, shown in PersonModal)

### goals.groups
- `getAll`, `create`, `update`, `delete` — CRUD for cross-entity groups
- `getTasks({ groupId })` — tasks in a group joined with goal context (id/title/emoji + `scheduledAt` + completion); drives the Tasks section on the group filter view

### goals.nextBids
- `list({ personId })`, `create({ personId, content, dueAt? })`, `update({ id, content?, dueAt? })` (`dueAt: null` clears), `setCompleted({ id, completed })` (sets/clears `completedAt`; bid stays visible), `delete` (hard — only for wrong entries)
- `listUpcoming({ withinDays })` — open bids across all the user's people whose `dueAt` falls within window (default 60d); joined with person name + emoji; drives Pulse "Upcoming" alongside `importantDates.list`

### goals.importantDates
- `list({ personId? })` (omit personId → all dates, sorted by month/day), `create`, `update`, `delete`

### goals.self
- `get` (or null), `update` — partial upsert on prose fields; only fields you pass get written

### goals.selfListItems
- `list` (ordered by kind then orderIdx — client groups by kind), `create({ kind, content, patternCategory? })` (server zeroes patternCategory unless `kind = 'pattern'`), `update` (same enforcement), `delete`, `reorder({ kind, ordering })` (gated on userId+kind so a forged id from another kind/user is a no-op)

### goals.bucketList
- `list` (oldest first; rows hydrate `personIds[]`), `create`, `update` (pass `personIds` to replace link set, omit to leave unchanged), `toggleCompleted`, `delete`

### Data export
- `goals.data.getAll` — all user data (values, goals, connections)
- `goals.backup.export` / `goals.backup.import` — full user backup including people + userSelf

### File serving
- `/uploads/[...path]` — protected static file serving

## File storage

Files live under `uploads/{userId}/...`. Sync-item text notes are inline in `weekly_sync_items.text_content` (DB-only); only binary attachments touch disk.

```
uploads/{userId}/
  avatar.{ext}                  # current user avatar (also serves People photos)
  attachments/{attachmentId}.{ext}   # weekly-sync attachments, keyed only on owner
  people/{personId}.{ext}       # person photos (uploaded via people.uploadImage)
```

The attachments path is keyed only on user — the DB resolves "which sync item" via `(parentType, parentId)`, so unscoped items still work.

**Supported types:** images (PNG/JPG/JPEG/GIF/WebP), documents (TXT/PDF/...), video, audio, other.

**Security:**
- Every attachment row carries `userId`; uploads validate parent-row owner; deletes match by id AND userId.
- Paths are constructed server-side from validated ids — no user-supplied path segments.
- Base64 envelope validated before touching disk.
- DB row first, FS write inside the same tx — failed write rolls back the row, no orphans.

## Maintenance

**This file is the single source of truth.** Update it on the same commit as any change to: schema, API endpoints, file structure, features, tech stack, auth, file storage, or major UI restructuring. Out-of-date docs are worse than no docs — a future agent will trust the wrong fact and break something.

## Post-change verification (required for every non-trivial change)

After any meaningful change — schema, router, component, refactor — run the full trio and **fix every warning and error before declaring the work done**. Skipping turns the next session's first 30 minutes into cleanup.

```bash
npm run format    # Prettier (formats in place)
npm run lint      # ESLint — must end with zero warnings AND zero errors
npm run build     # Next build — treat warnings as errors
```

Rules:
- Zero is the only acceptable count. Don't ship "just one warning" — they compound and get ignored.
- If a warning seems wrong, fix the root cause (rename a variable, restructure a hook, narrow a type) rather than disabling the rule. `eslint-disable` comments need a one-line justification and should be rare.
- The pre-existing `_global-error` prerender warning during `npm run build` is the documented exception (see memory). Anything else new is on you to fix.

## Database migrations

Drizzle migrations live in `src/lib/data/db/migrations/`.

1. **One migration per PR.** Schema changes land as a single consolidated file, not a chain of fixups. Reviewers shouldn't replay your iteration history; squashing after the fact is a merge-conflict magnet.
2. **If you change schema during a PR and the previous migration isn't committed yet, roll it back before regenerating:**
   - Manually reverse in Postgres (`DROP TABLE`, `ALTER TABLE DROP COLUMN`, …) and delete the row from `drizzle.__drizzle_migrations` (match on `hash`, not `id`).
   - Delete the uncommitted `.sql` + `meta/NNNN_snapshot.json` and remove the matching `entries[]` item from `meta/_journal.json`.
   - Edit `schema.ts`, then `npm run db:generate` to produce a single fresh migration.
   - `npm run db:migrate` to apply.
   - **Do not** use `npm run db:push` during this workflow — it's interactive and touches unrelated foreign keys.

---

_Single source of truth for Anansi's architecture, features, and implementation._
