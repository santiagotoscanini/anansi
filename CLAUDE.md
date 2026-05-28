# Anansi

Personal operating system for goals, relationships, and values. Named after Anansi — the West African spider trickster — whose Adinkra symbol **Ananse Ntontan** (the spider's web) represents wisdom, creativity, and the complexity of life. The app's icon is that web.

Feature surface: visual goal hierarchies with weighted connections, weekly progress retrospectives, a Personal CRM for reflecting on relationships, user-defined values that tag goals, and custom groups that span both people and tasks (e.g. "Family" can hold both my partner and the "call mom" task).

## Local dev credentials

Local dev runs against any Postgres (Supabase Session Pooler, local docker, RDS, …) configured via `.env` → `DATABASE_URL`. Auth is handled by **Auth.js v5** (`next-auth`) with the **Credentials provider** — email + password only, no magic links, no email confirmation, no password reset. The JWT session cookie is signed with `AUTH_SECRET` (generate with `openssl rand -base64 32`).

The conventional test user for automated flows (Playwright, manual smoke testing) is:

- **Email:** `santi@test.local`
- **Password:** `devpassword12345` (AuthScreens enforces 12)

Create it via the UI: open `http://localhost:3000/register`, fill in name + email + password, submit. The server action bcrypts the password, inserts the user row, and signs you in — no confirmation email, no second step.

If you lock yourself out: there's no password reset flow yet. Either re-register with a different email or wipe the user row from the DB and re-register.

Local dev DB only — do not reuse credentials in production.

## Stack

- **Frontend:** Next.js 16 (app dir), React 19, TypeScript, Tailwind, React Flow (`@xyflow/react`), Framer Motion, Lucide, dnd-kit
- **Backend:** tRPC v11, Next.js API routes, Auth.js v5 (`next-auth` + `@auth/drizzle-adapter`), bcryptjs, Zod
- **Database:** PostgreSQL + Drizzle ORM + Drizzle Kit
- **State:** React Context + TanStack Query (via tRPC) + IDB Keyval

## Project Structure

```
src/
  app/
    api/trpc/[trpc]/         # tRPC API endpoints
    privacy/, terms/         # Public legal pages (EN-only starter content; Spanish translation TBD)
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
**Auth.js v5** (`next-auth`, server-only) with the Credentials provider handles signup + sign-in via email/password. JWT session strategy: the session token is a signed cookie (`AUTH_SECRET`), no `sessions` table. Google is scaffolded (commented out) in `src/lib/auth/index.ts`; uncomment + add `AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET` to enable. **Browser-initiated flows run through server actions in `src/app/auth/actions.ts`** (`signInWithPasswordAction`, `signUpAction`, `signOutAction`, `changePasswordAction`). The browser bundle contains no auth SDK — everything stays server-side.

No email-dependent flows in v1: no email confirmation, no magic links, no password reset. Adding any of those means wiring an email transport and switching the providers list in `src/lib/auth/index.ts`.

Identity flow:
- Sessions live in HttpOnly cookies issued by Auth.js's edge middleware (`middleware.ts` re-exports `auth as middleware`). JWT strategy means there's no token refresh round-trip.
- `/api/auth/[...nextauth]/route.ts` handles all NextAuth callbacks (sign-in, sign-out, session reads).
- `public.users.id` is `uuid` with `defaultRandom()` — generated locally on user creation. No FK to an external auth table. The `accounts` table exists (required by `@auth/drizzle-adapter`) but is empty until Google is enabled.
- The tRPC context (`src/lib/api/trpc.ts`) resolves the current user via `await auth()` (server helper) and exposes the same `{ userId, userName }` shape every router already reads.

Full per-user data isolation via cascade FKs. Profile page (`ProfileModal`) handles name/email edit, avatar upload, and password change. Password change calls `changePasswordAction` which bcrypt-compares the current password before writing the new hash — preserves the "verify current first" UX guarantee.

### File management
Image, document, and other binary uploads on weekly-sync items; built-in inline text editor for sync notes (DB-only, no filesystem).

## Database Structure

**Conventions for every table:** `id` (text, primary key, cuid2), `createdAt` and `updatedAt` (timestamp, audit). Listed only when notable. All user-scoped tables cascade-delete on `users.id`. **Exception:** `users.id` itself is a `uuid` matching `auth.users(id)` (Supabase Auth's primary key) and every `user_id` FK column is also `uuid` — no cuid2 on the user identity boundary.

### users
- `id` (uuid, PK, `defaultRandom()` — generated locally on user creation; no external auth-table FK)
- `name`, `email` (UNIQUE), `passwordHash` (nullable — bcrypt-hashed by `signUpAction`/`changePasswordAction`), `emailVerified` (timestamp, nullable — unused in v1; Auth.js adapter type compatibility), `image` (text, nullable — Auth.js adapter compatibility, unused), `avatarUrl` (text, nullable — `/api/files/{id}` pointer; null = `Avatar.tsx` initial fallback), `locale` (BCP-47 code, nullable)

### accounts (Auth.js)
- Created by `@auth/drizzle-adapter`. Empty in v1 (Credentials provider doesn't write here). Required so the adapter's assertions succeed and the table is ready the day a social provider lands.

### files
- Generic binary blob store — replaces Supabase Storage. One row per uploaded file (avatars, person photos, sync attachments). Bytes live in `data` (bytea); served by `/api/files/[id]` which auth-gates by session cookie + owner match.
- `id` (cuid2, PK), `ownerId` (uuid, FK → users.id, cascade), `fileName`, `mimeType`, `sizeBytes` (int), `data` (bytea), `createdAt`

### values
- `name`, `color`, `userId`

### goals
- `title`, `description`, `parentId` (nullable, self-FK), `positionX`, `positionY` (real, canvas position), `userId`

### tasks
- `goalId`, `title`, `description` (nullable — surfaces in Tasks tab + TaskModal; row only shows title), `emoji` (nullable, **Unicode glyph only** — `tasks.emoji` rejects URLs at the zod layer; tasks have no upload affordance), `difficulty` (1–3), `completed` (boolean), `scheduledAt` (timestamp, nullable — single deadline; null = Backlog; bucket computed at render, not stored).
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
Polymorphic file metadata, keyed on `(parentType, parentId)`. Today's only producer is `parentType = 'weekly_sync_item'`, but the schema is permissive so other entities can opt in without a migration. Bytes live in the `files` table; `fileId` FK cascades, so deleting an attachment removes the blob in the same tx.
- `userId` (cascade), `parentType` (NOT NULL discriminator), `parentId` (NOT NULL), `fileName`, `fileType` (enum: image|document|video|audio|other), `fileId` (NOT NULL, FK → files.id, cascade), `sizeBytes` (nullable). Indexed on `(parentType, parentId)` and `userId`.

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
Signup/sign-in/sign-out/password-change are **server actions** (`src/app/auth/actions.ts`); `GoalsContext.tsx` exposes thin wrappers (`signInWithPassword`, `signUp`, `logout`) that call the actions and invalidate the `auth.me` tRPC query. The tRPC router only covers authenticated profile reads/writes against the local users row:
- `me` — returns `{ id, name, email, avatarUrl, locale }` from `public.users`
- `updateProfile` (rejects email collisions; writes directly to `public.users`)
- `uploadAvatar` (base64 → `files` table, sets `users.avatarUrl` to `/api/files/{id}`; previous avatar's blob deleted after the update), `removeAvatar` (clears `users.avatarUrl` + deletes the blob)
- `setLocale` (persists the BCP-47 locale code)

Password change while logged in: server action `changePasswordAction` (bcrypt-compares current, then writes new hash). No tRPC procedure.

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
- `upload({ parentType: 'weekly_sync_item', parentId, fileName, fileType, data })` — base64; inserts the file blob into `files`, then the attachment metadata row. Metadata-insert failure rolls back the file row (no orphan bytes). Returns `{ url }` as a `/api/files/{id}` path.
- `delete({ id })` — single attachment delete; cascades the `files` row via FK.

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

## File storage

All binary uploads live in the **`files`** Postgres table — bytes stored as `bytea`, served by the `/api/files/[id]` route. No external object store, no signed URLs, no RLS dance: the route auth-gates by Auth.js session cookie + `ownerId` match, full stop. Sync-item text notes are inline in `weekly_sync_items.text_content` (DB-only).

The route is auth-gated on every request and returns 404 for both "not found" and "not owned by caller" so no enumeration leaks. `Cache-Control: private, max-age=300` lets the browser keep the bytes for the session without persisting them in a shared cache.

How callers reference uploaded files:
- `users.avatarUrl` holds `/api/files/{fileId}` (or null for the initials fallback). Replaced atomically on re-upload, old file row deleted after the update lands.
- `people.emoji` accepts either an emoji glyph or `/api/files/{fileId}` (the `Avatar.tsx` component branches on it via `isEmojiUrl`). The Zod schema validates the URL shape via `isOurStorageImageUrl`.
- `attachments.fileId` is a NOT NULL FK on `files.id` with cascade — one delete removes the metadata row + blob in the same tx.

**Supported types:** images (PNG/JPG/JPEG/GIF/WebP), documents (TXT/PDF/...), video, audio, other. Image MIME is sniffed via magic bytes in `image-upload.ts`; non-image extensions are clamped to a safe-extension allow-list in `_shared.safeExtension`.

**Security:**
- The serving route requires an authenticated session AND matches `files.ownerId` against the session user. Nothing else.
- Upload routes (`auth.uploadAvatar`, `people.uploadImage`, `attachments.upload`) build the `ownerId` from the server-verified `ctx.user.userId` — no user-supplied path segments anywhere.
- Base64 envelope decoded + validated (size + image magic-bytes if `fileType === 'image'`) before any DB write.
- Attachment upload inserts the `files` row first, then the `attachments` metadata row. If the metadata insert throws, the file row is rolled back via a follow-up delete (no orphan bytes).
- `isOurStorageImageUrl` rejects anything that isn't a clean `/api/files/{id}` path so user-pasted external URLs can't be smuggled through the emoji/avatar fields.

## MCP server (talk-to-Anansi via Claude)

Anansi ships a remote **Model Context Protocol** server at `POST /api/mcp` so Claude Desktop / claude.ai Connectors / Claude Code can read and write the user's goals, tasks, people, values, bids, dates, groups, bucket list, and Self entries through a tool catalog. The server **IS its own OAuth 2.1 Authorization Server** — it does not delegate to Supabase upstream — but it uses the existing Supabase session as the identity input to `/oauth/authorize`. Bearer tokens are short-lived (1h access) with rotating refresh (30d).

Transport: Streamable HTTP via `@modelcontextprotocol/sdk`'s `WebStandardStreamableHTTPServerTransport` (stateless, JSON response mode). Each request creates a fresh `McpServer` + transport; bearer is validated against `mcp_access_tokens.token_hash`, identity resolved to `{ userId, userName }`, and the same `createCaller(ctx)` that powers tRPC server-side calls dispatches each tool. No parallel business logic; no extra network hop.

### Endpoints

- `POST /api/mcp` — main JSON-RPC endpoint. 401 + `WWW-Authenticate: Bearer realm="anansi-mcp", resource_metadata="…"` on missing/invalid token.
- `GET /.well-known/oauth-protected-resource` — RFC 9728 (rewritten in `next.config.js` to `/api/oauth/well-known/oauth-protected-resource`).
- `GET /.well-known/oauth-authorization-server` — RFC 8414 (same rewrite shape).
- `POST /oauth/register` — RFC 7591 Dynamic Client Registration. Public-client only (`token_endpoint_auth_method = "none"`). Rate-limited 5/min/IP.
- `GET /oauth/authorize` — server-component consent page. Reads Supabase cookie. No session → 302 `/login?next=<this-url-encoded>` (login/register honor `?next=`). Prior consent for same `(user, client, scope)` → auto-mint code + 302 to redirect_uri. Otherwise renders `ConsentScreen`.
- `POST /oauth/authorize/decision` — handles Approve/Deny. CSRF-guarded by Origin/Referer check. Approve mints a 60s single-use code bound to PKCE + redirect_uri, records consent, 303 to redirect_uri.
- `POST /oauth/token` — `authorization_code` + `refresh_token` grants. PKCE S256 only. Refresh is rotating with `SELECT … FOR UPDATE` to serialize concurrent rotations. Rate-limited 20/min/IP.
- `POST /oauth/revoke` — RFC 7009. Always returns 200.

### MCP tool catalog

`registerAllTools()` (in `src/lib/mcp/tools/index.ts`) wires **51 tools** across 10 domain files. All tool names are flat verb-first snake_case (`list_goals`, `update_person`, `set_next_bid_done`, …). Hand-written `title` + `description` drive LLM tool selection; Zod raw shapes give the SDK enough type info to both generate the inputSchema JSON Schema AND validate inputs at call-time.

Domains: `system` (1 — `whoami`), `goals` (4), `tasks` (4), `values` (7), `people` (9), `next_bids` (6), `important_dates` (4), `groups` (5), `bucket_list` (5), `self` (6). Out of scope for v1 (re-add when needed): connections (graph topology), tracking items / sync templates / weekly sync, attachments / images, backup / data export.

MCP-specific gates (not in underlying tRPC schemas): `create_person` / `update_person` reject URL emojis (LLM can't construct valid Supabase Storage URLs anyway); `create_goal` omits the `tasks` array (use `create_task` after the goal exists) so the LLM doesn't have to think about pre-cast task ids.

### Tables (one migration: 0023)

All `user_id` columns are `uuid REFERENCES users(id) ON DELETE CASCADE`. Tokens stored as `token_hash` (SHA-256 hex of the raw value) — raw token never persisted.

- **mcp_oauth_clients** — DCR clients: `client_name`, `redirect_uris (text[])`, `grant_types (text[])`, `token_endpoint_auth_method` ("none"), `scope`. Id IS the public `client_id`.
- **mcp_authorization_codes** — single-use, 60s TTL, PKCE-bound: `client_id`, `user_id`, `redirect_uri`, `code_challenge`, `code_challenge_method` ("S256"), `scope`, `expires_at`, `consumed_at`. Id IS the opaque code value.
- **mcp_access_tokens** — `token_hash UNIQUE`, `user_id`, `client_id`, `scope`, `expires_at`, `revoked_at`. Hot-path indexes on `token_hash` and `user_id`.
- **mcp_refresh_tokens** — same shape + `rotated_to` (id of the replacement token for audit trail).
- **mcp_consents** — `(user_id, client_id) UNIQUE`, latest granted `scope`. Drives auto-approve on subsequent `/authorize` hits for the same client.
- **mcp_audit_log** — `event` (`register | authorize_started | consent_granted | consent_auto | authorize_denied | token_issued | token_refreshed | token_refresh_failed | token_revoked`), `user_id` (SET NULL on delete), `client_id`, `ip`, `meta` (JSON-stringified).

### File layout (under src/)

```
app/api/mcp/route.ts                           # Bearer auth + tRPC bridge + transport
app/api/oauth/well-known/{oauth-authorization-server,oauth-protected-resource}/route.ts
app/oauth/{register,token,revoke}/route.ts
app/oauth/authorize/page.tsx                   # Server component, consent + auto-approve
app/oauth/authorize/decision/route.ts          # Form POST → code mint
components/oauth/ConsentScreen.tsx             # Server-rendered consent UI (EN-only for v1)
lib/mcp/server.ts                              # Per-request McpServer factory
lib/mcp/caller.ts                              # createMcpCaller → createCaller(ctx)
lib/mcp/errors.ts                              # mapTrpcError + mcpJsonResult
lib/mcp/tools/{system,goals,tasks,values,people,next_bids,important_dates,groups,bucket_list,self}.ts
lib/mcp/oauth/{store,clients,codes,tokens,pkce,consent,metadata,scopes,audit,authorize-validation}.ts
```

### Dev wiring

Add to `.mcp.json` in any project (or Claude Desktop's config):

```json
{ "mcpServers": { "anansi": { "type": "http", "url": "http://localhost:3000/api/mcp" } } }
```

In Claude Code, run `/mcp` and pick `anansi` → it walks DCR + browser OAuth automatically. For prod, swap the URL. The MCP client caches the issued client_id and refresh token, so the browser-tab login flow runs once per device.

### Security knobs

- Access tokens: 1h. Refresh: 30d, rotating. New issuance revokes any prior `(user, client)` tokens — one active grant per pair.
- PKCE: S256 only. `plain` is rejected at the metadata level.
- Auth codes: 60s TTL, single-use (atomic `UPDATE … SET consumed_at = now() WHERE consumed_at IS NULL`), bound to PKCE challenge + redirect_uri.
- Redirect URIs: exact string match against DCR-registered list; `http://` only allowed for `localhost`/`127.0.0.1`/`[::1]`; `javascript:` / `data:` / `file:` schemes refused at registration.
- CSRF on `/oauth/authorize/decision`: Origin/Referer header check.
- Rate limits: 5/min/IP on `/oauth/register`, 20/min/IP on `/oauth/token`, 300/min/IP on `/api/mcp`.
- DCR is unauthenticated and publicly accessible — acceptable for a single-user personal app. For multi-tenant deployment, add an admin allow-list before exposing.
- Audit log captures every OAuth state change (never tool calls — too noisy). Token hashes / raw codes are never logged.

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
