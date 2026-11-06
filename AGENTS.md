# Anansi

Personal operating system for goals, relationships, and values. Named after Anansi — the West African spider trickster — whose Adinkra symbol **Ananse Ntontan** (the spider's web) represents wisdom, creativity, and the complexity of life. The app's icon is that web.

Feature surface: visual goal hierarchies with weighted connections, weekly progress retrospectives, a Personal CRM for reflecting on relationships, user-defined values that tag goals, and custom groups that span both people and tasks (e.g. "Family" can hold both my partner and the "call mom" task).

## Local dev

```bash
pnpm install           # pnpm 11, Node 24+ (engineStrict)
pnpm dev               # vite dev on :5173
pnpm build && pnpm start   # nitro bundle in .output/, served on :3000
```

Postgres comes from `.env` → `DATABASE_URL` (local docker, RDS, a Supabase session-pooler URL — anything). The migrations in `src/lib/data/db/migrations/` create the whole schema, Auth.js's `accounts` table included.

> **`env -u DATABASE_URL` is often needed in front of these commands.** A stale ambient `DATABASE_URL` in the shell beats `.env`, and the failure looks like an unrelated connection error rather than a config problem.

Auth is **Auth.js v5 core** (`@auth/core`) with **exactly one provider active at a time**, chosen by whether an IdP is configured:

| | provider | where |
|---|---|---|
| `OIDC_*` set | Pocket ID (OIDC) | production — SSO is the only door, `/register` is gated off |
| `OIDC_*` absent | Credentials (email + password) | `pnpm dev`, Playwright, `scripts/capture-screens.sh` |

The switch is the **presence of the env vars**, never `NODE_ENV` — see "Single sign-on" below. Either way the JWT session cookie is the same cookie, signed with `AUTH_SECRET` (generate with `openssl rand -base64 32`). No magic links, no email confirmation, no password reset in either mode.

Everything below in this section describes local dev, where the password path is the whole of sign-in. The conventional test user for automated flows (Playwright, manual smoke testing) is:

- **Email:** `santi@test.local`
- **Password:** `devpassword12345` (AuthScreens enforces 12)

Create it via the UI: open `http://localhost:5173/register`, fill in name + email + password, submit. The `signUp` server fn bcrypts the password, inserts the user row, and signs you in — no confirmation email, no second step. `scripts/seed-dev-data.ts` then fills every tab with a deterministic dataset.

There is no browserless sign-in any more: `POST /api/auth/callback/credentials` answers 404 since 2026-10-02, because it checked passwords outside the signIn server fn's rate limit (see `src/routes/api.auth.$.ts`). `scripts/capture-screens.sh` and `scripts/check-shell.mjs` still use it and need to sign in through `/login` in their browser instead.

If you lock yourself out: there's no password reset flow yet. Either re-register with a different email or wipe the user row from the DB and re-register.

Local dev DB only — do not reuse credentials in production.

## Stack

- **Framework:** TanStack Start (Vite 8 + Nitro), TanStack Router file routes, React 19 **+ React Compiler**, TypeScript
- **Data:** TanStack Query + `createServerFn` server functions. **No tRPC** — see "Data flow".
- **UI:** Tailwind **v4** (`@tailwindcss/vite`, no PostCSS step), React Flow (`@xyflow/react`), Lucide, dnd-kit, react-hot-toast, i18next
- **Backend:** Auth.js v5 core (`@auth/core` + `@auth/drizzle-adapter`), bcryptjs, **Zod 4**
- **Database:** PostgreSQL + Drizzle ORM + Drizzle Kit
- **Files:** the app's private S3 bucket on the box's Garage store, through the platform's canonical client (`src/server/object-store.ts`) — see "File storage"
- **Tooling:** pnpm 11 (with a supply-chain cooldown), ESLint flat config, Prettier (single quotes, no semicolons), `@t3-oss/env-core`

### React Compiler

Enabled in `vite.config.ts` via `@rolldown/plugin-babel` + `reactCompilerPreset()`.
ESLint has enforced the compiler's rules (`preserve-manual-memoization`,
`set-state-in-effect`, `purity`) as **errors** since the migration; for a while the
compiler itself was not installed, so the codebase paid the constraint cost and got
none of the auto-memoization.

> **It is a separate plugin, not an option on `viteReact()`.** `@vitejs/plugin-react`
> v6 moved its transform to oxc and **dropped the `babel` option entirely**, so the
> v4-era `viteReact({ babel: { plugins: [...] } })` spelling is now silently ignored —
> no error, no warning, and a build that looks completely normal while compiling
> nothing. The only way to tell the difference is to grep the build output for
> `react/compiler-runtime`; when it is working, ~39 client chunks import it and a
> small `compiler-runtime-*.js` chunk is emitted.

Applied to the client build only, which is where the value is (SSR renders each
component once). Compiled and uncompiled components interoperate, so a mixed build is
not a half-configured state.

### Zod 4

`z.coerce.date()` **cannot be rendered into JSON Schema** by zod 4 — it throws
`Date cannot be represented in JSON Schema` rather than silently emitting
`{type:'string', format:'date-time'}` the way zod 3 did. That matters only on the MCP
path, where the throw comes from inside `tools/list` and takes the whole catalog with
it; see `src/lib/mcp/tools/fields.ts` and the zod 4 section of `.golden/README.md`.

Two other zod 4 changes bit during the upgrade and are worth knowing:

- **`.default()` no longer parses its argument.** It short-circuits and returns the
  value as the output, so `z.object({ n: z.number().default(60) }).default({})` now
  yields `{}` with no `n`. **`.prefault()`** is the old behaviour.
- **`z.coerce.date()`'s input type is `unknown`**, which poisons any object spread
  built from a schema's *input* type. Type UI-facing mutations from the schema's
  **output** type instead — see the note in `lib/mutations/goals-data.ts`.

## Project Structure

```
src/
  routes/                    # file routes; routeTree.gen.ts is generated + gitignored
  router.tsx                 # QueryClient (staleTime 30s) + setupRouterSsrQueryIntegration
  start.ts                   # createStart → global request middleware (security headers)
  client.tsx                 # client entry — awaits the locale chunk BEFORE hydrateRoot

  server/                    # ── never imported by the client ──
    services/                # plain async (userId, input) fns. NO @tanstack imports.
      errors.ts              #   the AppError taxonomy
      auth.ts values.ts value-behaviors.ts goals.ts tasks.ts connections.ts data.ts
      tracking-items.ts sync-templates.ts weekly-sync.ts attachments.ts file-refs.ts files.ts
      people.ts groups.ts next-bids.ts important-dates.ts bucket-list.ts
      self.ts self-list-items.ts backup.ts
    bucket.ts                # the app's bucket from S3_* (memory store outside production)
    object-store.ts          # the platform's S3 client, a VERBATIM copy (+ its vitest test)
    api/                     # v1.ts (the phone API's withApiKey) + file-response.ts
    fn/                      # createServerFn wrappers. EXPORT ONLY SERVER FNS (see below).
      values.fn.ts goals.fn.ts … + auth.fn.ts + locale.fn.ts + oauth.fn.ts
    middleware/auth.ts       # createMiddleware — a runtime value, so NOT in fn/
    auth/{config,session,actions}.ts

  lib/
    queries/                 # queryOptions factories + the qk key registry. Client-safe.
    mutations/               # useMutation hooks, grouped by surface
    computation/
      use-goal-progress.ts   # the memoized progress DFS (was GoalsContext's core)
      importance.ts
    api/types.ts             # ~726 lines of zod schemas, shared by services + fns + MCP
    data/                    # schema.ts, db connection, migrations/
    mcp/                     # MCP server + 80 tools + the OAuth 2.1 provider
    env.ts security-headers.ts horizon-period.ts week.ts image-upload.ts
    theme.ts color-palette.ts emoji-utils.ts

  components/
    goals/                   # feature components
      AppShell.tsx           # sidebar + mobile drawer + user menu + global modals
      GoalsGraph.tsx GoalNode.tsx GoalModal.tsx EditableEdge.tsx
      TaskModal.tsx Tasks.tsx Horizons.tsx
      ValuesManager.tsx WeeklyRetrospective.tsx LifeProgress.tsx
      PeopleManager.tsx PersonModal.tsx RelationshipsBoard.tsx
      Self.tsx BucketListItemModal.tsx TabError.tsx
      ColorPicker.tsx DatePicker.tsx Avatar.tsx EmojiPickerLazy.tsx
    auth/AuthScreens.tsx
  i18n/                      # config, Provider, resources (lazy), en.json + es.json, useLocale
  styles/globals.css         # Tailwind v4 entry + ~70 design tokens

public/                      # icon.svg, icon.png, apple-icon.png
```

There is **no `uploads/` directory** and no disk. Every uploaded file is a `files` row in Postgres whose bytes live in the app's bucket — see "File storage".

## Routing

Real file routes, one per tab. `/app/<slug>` URLs are unchanged from the Next era.

```
__root.tsx          validateSearch { locale? } · head + shellComponent · <Toaster/> mounted once
index.tsx           /                       login.tsx  /login  { next?, error? }
privacy.tsx  terms.tsx                      register.tsx  /register  { next? }

app.tsx             /app LAYOUT — beforeLoad auth guard, { modal?: 'profile'|'import' }
app.index.tsx       /app { goal? } renders the graph directly (NOT a redirect to /app/objectives)
app.objectives.tsx { goal? }      app.horizons.tsx { task?, goal? }
app.tasks.tsx      { task?, goal? }  app.sync.tsx { week? }
app.people.tsx     { filter?, groupId?, person? }   app.bucket.tsx { item? }
                    (`goal`/`item`/`task` accept an id, or the literal `new` to open the create form)
app.pulse.tsx  app.tracking-items.tsx  app.self.tsx  app.values.tsx
app.progress.tsx  app.relationships.tsx
app.$.tsx           /app/* → redirect to /app (preserves the old silent slug fallback)

api.auth.$.ts  api.mcp.ts  api.files.$id.ts  api.healthz.ts
oauth.{register,token,revoke}.ts  oauth.authorize.tsx  oauth.authorize.decision.ts
[.]well-known.oauth-authorization-server.ts   → /.well-known/oauth-authorization-server
[.]well-known.oauth-protected-resource.ts     → /.well-known/oauth-protected-resource
```

`[.]` is TanStack Router's escape for a literal dot in a filename, which is why the `.well-known` docs are served directly instead of through a rewrite.

> **A component rendered by more than one route must read search params with the route-agnostic hooks.**
> `GoalsGraph` is the component for both `/app` and `/app/objectives`. A bound `Route.useSearch()` / `Route.useNavigate()` throws `Invariant failed` when the component renders under the route it was *not* bound to — and the build is clean, so it only appears when someone opens that URL. Use `useSearch({ strict: false })` + `useNavigate()` with `to: '.'`, and declare the param in `validateSearch` on **every** route that renders the component, or the undeclared one silently strips it.

> **Write `validateSearch` as an inline function literal, never as a call to a generic helper.**
> A route file is circular with `routeTree.gen.ts`. TypeScript resolves that circularity for a function literal but bails for a generic call expression, falling back to `AnySchema` — so the route's search type silently becomes `{}`, `useSearch()` returns nothing, and every `navigate()` to it stops type-checking its params. The error surfaces at the *navigation site*, not at the route that caused it. Related: `z.catch()` makes a schema's input `unknown`, which intersects away every param in the navigation type. An inline function is tolerant of bad input for free — just coerce and default.

## Data flow

There is no tRPC. The chain is:

```
component  →  lib/queries/*.ts (queryOptions)  →  server/fn/*.fn.ts (createServerFn)
                                                       ↓ authMiddleware
                                                  server/services/*.ts  →  db
MCP tool  ────────────────────────────────────────────↗  (direct, in-process)
```

- **`server/services/*.ts`** holds all business logic as plain `(userId, input)` async functions. It imports `db`, the zod schemas and `AppError`, and nothing from `@tanstack/*`. That is what lets the 80 MCP tools call it directly: the MCP graph never touches the Start compiler, so there is no function-id registration, no CSRF, no Seroval, no HTTP hop.
- Services **re-parse their input** with the shared zod schema. Two entry points means two independent validators; parsing inside the service is the only guarantee that covers both, and it makes each service callable from a script without ceremony.
- **`server/fn/*.fn.ts`** wraps services for the browser. Every route loader prefetches with `queryClient.ensureQueryData(...)` and components read with `useSuspenseQuery`, so tab data is server-rendered and hydrated — there is no loading spinner to reintroduce.
- **`lib/queries/keys.ts`** owns every query key (`qk.*`), replacing tRPC's `utils.*.invalidate()`. Invalidate by key **root** (`qk.people`), not by leaf — prefix matching covers the leaves.

> **A `.fn.ts` module must export ONLY server functions.** Exporting any plain runtime value makes the Start compiler treat the module as mixed and mis-register its function ids. `vite build` tolerates it; **`vite dev` throws `Invalid server function ID` at call time** — so it hides until someone clicks the thing. This is why `server/middleware/auth.ts` lives outside `fn/`: `createMiddleware` returns a runtime value.

> **Never `import 'server-only'`.** That package's exports map the `react-server` condition to an empty module and everything else to a bare `throw`, and Vite's SSR pass does not apply that condition — so the guard fires on the server it exists to protect and 500s every request. `vite build` does not catch it. The boundary is enforced by the `no-restricted-imports` rule in `eslint.config.mjs` (client-reachable directories may not import `~/server/**` or `~/lib/mcp/**`) plus `pnpm check:bundle`, which greps the built `.output/public/` and runs as part of `pnpm ci`.

**Errors across the wire.** Services throw `AppError`. `authMiddleware` converts it to an HTTP status plus a `CODE: message` string, because Seroval does not reconstruct an `Error` subclass on the client — so don't rely on `instanceof AppError` there; `lib/queries/errors.ts` parses the code back out of the message. The MCP path loses nothing: it calls services in-process, where `instanceof` holds and `_meta.trpc_code` stays exact.

**Mutations reject.** Under the old `GoalsContext` a failed write was swallowed into `console.error` and looked identical to a success. The hooks in `lib/mutations/` reject, and call sites toast. Optimistic paths (goal position, task scheduling, person category, the Self lists) snapshot, patch, and roll back.

**Week-keyed queries are never prefetched in a loader.** `weekStartOf` works in local time and a loader also runs on the server, so a server in UTC and a browser in UTC−3 would key differently and refetch on hydration. Pulse and WeeklyRetrospective use plain `useQuery` and compute the week client-side.

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
User-owned tracking-items library (goal optional → "Unscoped"), reusable sync templates (one default per user auto-snapshots into each new sync), inline `text_content` per sync item, and binary attachments (rows in `attachments`, each pointing at a file: a `files` row whose bytes are in the bucket).

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
**`@auth/core` directly** (no `next-auth` wrapper), with one provider active at a time — Pocket ID (OIDC) where an IdP is configured, Credentials (email + password) where one isn't. JWT session strategy either way: the session token is a signed cookie (`AUTH_SECRET`), no `sessions` table. Browser-initiated flows go through the server functions in `src/server/fn/auth.fn.ts` (`signIn`, `signUp`, `signOut`, `changePassword`, `startOidcSignIn`); the first four return `{ ok: true } | { ok: false, error }`. The browser bundle contains no auth SDK.

No email-dependent flows in v1: no email confirmation, no magic links, no password reset. Adding any of those means wiring an email transport and switching the providers list in `src/server/auth/config.ts`.

#### Single sign-on (OIDC)

Configured entirely by env — the app ships one code path and picks a door at boot.

| var | example | notes |
|---|---|---|
| `OIDC_ISSUER_URL` | `https://id.toscanini.me` | discovery root; **must stay lazy** |
| `OIDC_CLIENT_ID` | `anansi` | |
| `OIDC_CLIENT_SECRET` | 40 chars | from a sops-encrypted env file |
| `OIDC_REDIRECT_URI` | `https://anansi.toscanini.me/api/auth/callback/pocket-id` | registered at the IdP; **its last path segment IS the provider id** |
| `OIDC_PROVIDER_ID` | `pocket-id` | fallback when the redirect URI is unset |
| `OIDC_PROVIDER_NAME` | `Pocket ID` | shown on the sign-in error screen |
| `OIDC_SCOPES` | `openid profile email groups` | |

`oidcEnabled` in `src/lib/env.ts` is true only when the **first four** are all present, and it is the single flag everything branches on. Deliberately not `NODE_ENV`: a half-configured IdP falls back to the password form instead of producing a broken redirect, and a dev container pointed at a real IdP behaves exactly like production.

> **The provider `id` is not a free choice — it is half of the redirect URI registered at the IdP.** Auth.js builds its callback as `${basePath}/callback/${provider.id}`, so `pocket-id` is what makes the callback land where Pocket ID is registered to send it. `config.ts` derives it from `OIDC_REDIRECT_URI`'s last path segment rather than restating the literal, so the two cannot drift. Get it wrong and the IdP answers `invalid redirect_uri`, which reads like an IdP outage rather than a typo here.

> **Discovery must stay lazy.** Passing `issuer` (not a hand-written `authorization`/`token`/`userinfo` triple) makes @auth/core fetch `/.well-known/openid-configuration` on the first authorize request. An app that reaches the IdP at module import crash-loops on a cold boot whenever the IdP comes up second.

`allowDangerousEmailAccountLinking: true` links the OIDC identity onto the **pre-existing `users` row with the same email** instead of creating a second, empty account — that is what carries an existing user's data across the cutover. It is safe *only* because Pocket ID is the sole provider on that deployment and verifies the address itself. **Adding a second provider means revisiting that line first**, and the tell that it stopped working is a second `users` row with a duplicate email.

**Starting the flow** — `startOidcSignIn` in `src/server/auth/actions.ts`. Credentials is the one provider with no external hop, so its sign-in starts and finishes in-process; OIDC cannot, so this runs Auth.js far enough (`raw` + `skipCSRFCheck`) to produce the authorize URL and hands it back for a **full-page** navigation. `/login`'s `beforeLoad` throws `redirect({ href: url })` — an absolute href, which TanStack turns into `window.location.href` rather than a router push, as it must: different origin.

> **`applyCookies` is load-bearing.** Auth.js emits the `state` and PKCE `code_verifier` cookies as part of building that URL, and the callback validates the IdP's response against them. Drop the replay and the callback fails with a state mismatch that surfaces under the IdP's name and looks like an IdP problem. They survive the redirect on both paths: Start merges the request's `set-cookie` headers into any non-2xx response (`mergeEventResponseHeaders` in start-server-core), and on a client-side navigation they land on the server function's own 200 before the navigation happens.

The callback needs **no new route** — `src/routes/api.auth.$.ts` already serves `/api/auth/callback/*`, and its `withForwardedOrigin` rewrite is exactly what makes it work behind a TLS-terminating proxy: the request reaches Nitro over plain http, and without the rewrite both the `__Secure-` cookie name and the callback origin would be wrong.

**Route behaviour under SSO:**
- `/login` redirects to the IdP from `beforeLoad`, after the existing already-signed-in check and preserving `?next=`. **Unless `?error=` is present** — @auth/core sends every failed sign-in to `pages.signIn` (= `/login`) with the error type in the query string, so without that guard an account the IdP refuses (one outside the `admins` group) loops between the two hosts forever. It renders `SignInErrorScreen` with a "try again" instead.
- `/register` redirects to `/login` — self-registration is the IdP's job, and an open register page on a publicly-exposed app is a liability. Gated at the route, not by hiding the link. `signUp` / `registerUser` stay in the codebase for dev and seeding.
- Sign-out is **unchanged and deliberately local**: `signOutSession()` clears our cookie and leaves the Pocket ID session alone (24h), which is what keeps SSO across the other apps silent. Redirecting to `end_session_endpoint` would be a global logout — a different feature, not a fix.
- The `/oauth/*` MCP surface is unaffected: it authorizes against whatever session exists, and the session cookie is byte-identical either way.

The client cannot read `oidcEnabled` for itself — `~/lib/env` is server-only, and importing it from a route would drag dotenv into the browser bundle. It crosses the wire through `fetchAuthMode` / `authModeQueryOptions` (`staleTime: Infinity`, no invalidation site: it cannot change without a restart).

**No migration was needed for any of this.** `users.email` is already unique, `users.name` already NOT NULL, and `accounts` already mirrors `AdapterAccount` — it was created for exactly this and had been empty since. `passwordHash` and `changePassword` are untouched; the column simply goes dormant under SSO.

Identity flow:
- **`src/server/auth/session.ts`** — `getServerSession()` is a port of `next-auth/lib/index.js`'s session read: it builds a Request to `createActionURL('session', …)` and calls `Auth(request, config)`, memoized per Request in a WeakMap. Chosen over hand-decoding with `@auth/core/jwt` because the JWE **salt defaults to the cookie name** and the name is `__Secure-`-prefixed under HTTPS — so a hand-rolled decode silently returns `null` in production while passing locally. Going through the session action derives the name, the prefix and the salt from the same code that wrote them, and runs the `session` callback that produces `session.user.id`.
- **`src/routes/api.auth.$.ts`** mounts `@auth/core` at `/api/auth/*`, serving only session/csrf/providers/signin/error, POST signout and the OIDC provider's signin/callback; everything else, the credentials doors included, is a 404. No UI form posts to it (credentials sign-in runs in-process behind the rate limit), but it is where the OIDC callback lands — an OAuth callback has to be a real URL the IdP can redirect a browser to, and no server function can be that. **It rewrites the request origin from `x-forwarded-{proto,host}`** — `@auth/core` reads the protocol straight off `request.url`, Next used to rebuild that from the forwarded headers, and Nitro does not. Without the rewrite, everything behind a TLS-terminating proxy reads as signed-out.
- **`basePath: '/api/auth'` must stay set explicitly.** `@auth/core` defaults to `/auth`; only `next-auth` forced `/api/auth`.
- Do **not** set `cookies`, `useSecureCookies`, `jwt.encode`/`jwt.decode`, or `session.maxAge` in the config. Each one changes the cookie name, the salt, or the key derivation, and the failure mode is a silent `null` — i.e. everyone logged out.
- `public.users.id` is `uuid` with `defaultRandom()`, generated locally. No FK to any external auth table. The `accounts` table exists (required by `@auth/drizzle-adapter`) and stays empty until an OIDC provider is configured.
- **`src/server/middleware/auth.ts`** is the replacement for tRPC's `protectedProcedure`: it resolves the session once and hands `{ userId }` to the handler as typed context.

The `/app` route's `beforeLoad` guard redirects to `/login?next=…` **in the HTTP response** — a real 307, not the `useEffect` bounce the Next version used, so there is no flash of the shell before the redirect.

Full per-user data isolation via cascade FKs. `ProfileModal` handles name/email edit, avatar upload, and password change; `changePassword` bcrypt-compares the current password before writing the new hash, preserving the "verify current first" guarantee.

### File management
Image, document, and other binary uploads on weekly-sync items; built-in inline text editor for sync notes (DB-only, no filesystem).

## Database Structure

**Conventions for every table:** `id` (text, primary key, cuid2), `createdAt` and `updatedAt` (timestamp, audit). Listed only when notable. The audit pair comes from the shared `timestamps` object in `schema.ts`, spread into each table; `updatedAt` carries `.$onUpdate(() => new Date())` so services do not restate it.

> **`$onUpdate` does not rescue an empty `.set({})`.** It is a Drizzle-level default (no DDL, no migration, and a raw `UPDATE` in psql will not fire it), and drizzle raises "No values to set" while *building* the query — before any `$onUpdate` value is applied. So patch-shaped updates whose fields are all optional (`people`, `tasks`, `connections`, `person_groups`, and the three typed patch builders in `auth` / `important-dates` / `self-list-items`) still seed `updatedAt: new Date()` by hand to guarantee a non-empty SET, and say so locally. An explicit value always wins over `$onUpdate`, which is what lets `backup.import` preserve the timestamps it is restoring. All user-scoped tables cascade-delete on `users.id`. **Exception:** `users.id` itself is a `uuid` and every `user_id` FK column is also `uuid` — no cuid2 on the user identity boundary. (The uuid is a leftover from the Supabase Auth era, kept because the column type is load-bearing across every FK; it is now generated locally.)

### users
- `id` (uuid, PK, `defaultRandom()` — generated locally on user creation; no external auth-table FK)
- `name`, `email` (UNIQUE), `passwordHash` (nullable — bcrypt-hashed by the `signUp` / `changePassword` server fns), `emailVerified` (timestamp, nullable — unused in v1; Auth.js adapter type compatibility), `image` (text, nullable — Auth.js adapter compatibility, unused), `avatarUrl` (text, nullable — `/api/files/{id}` pointer; null = `Avatar.tsx` initial fallback), `locale` (BCP-47 code, nullable)

### accounts (Auth.js)
- Created by `@auth/drizzle-adapter`. Empty under the Credentials provider (it doesn't write here); one row per user under OIDC, linking `provider`/`provider_account_id` to the existing `users.id`. **Two `users` rows with the same email means `allowDangerousEmailAccountLinking` didn't take.**

### files
- One row per uploaded file (avatars, person photos, sync attachments): the record half. The bytes are an object in the app's bucket at `files/<id>`, a key derived from the row (`fileKey` in `services/file-refs.ts`), so no column stores a path. Served by `/api/files/$id`, which auth-gates by session cookie + owner match.
- `id` (cuid2, PK), `ownerId` (uuid, FK → users.id, cascade), `fileName`, `mimeType`, `sizeBytes` (int), `createdAt` (until November 2026 the bytes lived in a bytea `data` column; `0004` dropped it)

### values
- `name`, `color`, `userId`

### goals
- `title`, `description`, `emoji` (nullable), `parentId` (nullable, self-FK **ON DELETE SET NULL** — deleting a parent orphans its children rather than silently wiping a sub-tree), `positionX`, `positionY` (real, canvas position), `userId`
- `status` (enum `active|archived`, NOT NULL, default `active`). **"Deleting" a goal archives it** — `goals.remove` flips `status` to `archived`, hard-deletes its connections, and archives its tracking items, all in one tx. The row survives; every read filters on `status = 'active'`. So a goal id stays resolvable after a delete, and a hard `DELETE FROM goals` is a manual operation with no service behind it.

### tasks
- `goalId`, `title`, `description` (nullable — surfaces in Tasks tab + TaskModal; row only shows title), `emoji` (nullable, **Unicode glyph only** — `tasks.emoji` rejects URLs at the zod layer; tasks have no upload affordance), `difficulty` (1–3), `completed` (boolean), `scheduledAt` (timestamp, nullable — single deadline; null = Backlog; bucket computed at render, not stored).
- **Linked surfaces:** referent people via `task_referents`, group tags via `tasks_to_groups`. Both cascade-delete with the task.

### connections
- `source`, `target` (FK → goals.id), `weight` (real, 0–100)

### trackingItems
User-owned library for weekly syncs. Goal-link is optional — items with `goalId IS NULL` show as "Unscoped". Goal deletion sets `goalId` to NULL (not cascade), so the item survives.
- `userId` (NOT NULL, cascade), `goalId` (nullable, ON DELETE SET NULL), `title`, `description` (nullable), `order`, `status` (enum `active|archived`, default `active`), `deletedAt` (nullable — set when referenced by an existing sync at delete time)
- `overlay` (jsonb, nullable) — the camera outline the phone draws for pictures retaken every week (face, chest, side, back). Shape and limits: `overlaySchema` in `src/lib/overlay.ts` (strokes of `[x, y]` points normalized to the 3:4 camera frame). Written only through `PUT/DELETE /api/v1/tracking-items/{id}/overlay`; carried by backups.

### apiKeys
Per-device keys for the phone app's REST API (see "Phone API"). `userId` (cascade), `name`, `prefix` (first 12 characters of the raw key, for the list), `tokenHash` (SHA-256 hex, UNIQUE — the raw `ank_…` key is shown once and never stored), `lastUsedAt` (written at most once a minute), `revokedAt`, `createdAt`.

### syncTemplates + syncTemplateItems (junction)
Named bundles of tracking items. **Partial unique index** enforces "at most one default per user". The default auto-snapshots into each new weekly sync.
- `syncTemplates`: `userId`, `name`, `isDefault` (NOT NULL, default false)
- `syncTemplateItems`: `templateId` (cascade), `trackingItemId` (cascade), `orderIdx` (default 0); UNIQUE(templateId, trackingItemId)

### weeklySync + weeklySyncItems
- `weeklySync`: `userId`, `weekDate` (NOT NULL, Monday of the week), `templateId` (nullable, ON DELETE SET NULL — the template snapshotted from at create time)
- `weeklySyncItems`: `weeklySyncId` (cascade), `trackingItemId` (cascade), `textContent` (nullable, inline notes — replaces old notes.txt files), `orderIdx` (NOT NULL, default 0)

### attachments
Polymorphic file metadata, keyed on `(parentType, parentId)`. Today's only producer is `parentType = 'weekly_sync_item'`, but the schema is permissive so other entities can opt in without a migration. The bytes are a file (`files` row + bucket object). The `fileId` FK cascades **from `files` to `attachments`**: deleting the file row removes the attachment row, never the other way round — so every delete goes through `files.deleteFiles` (bytes first, then the file row, and the cascade takes the attachment).
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

## Service layer

One file per domain in `src/server/services/`, one thin `.fn.ts` wrapper per file in `src/server/fn/`, one `queryOptions` factory per read in `src/lib/queries/`. The names below are the **service exports**; the server fn of the same name is a one-line delegate. Grouped by their old tRPC namespace so the mapping stays legible.

### auth
`signIn` / `signUp` / `signOut` / `changePassword` are server fns in `auth.fn.ts` returning `{ ok: true } | { ok: false, error }`; the first three are pre-auth by definition, `changePassword` runs behind `authMiddleware` and bcrypt-compares the current password first. The rest are ordinary profile reads/writes against the local users row:
- `me` — `{ id, name, email, avatarUrl, locale }` from `public.users`
- `updateProfile` (rejects email collisions)
- `uploadAvatar` (base64 → a new file, sets `users.avatarUrl` to `/api/files/{id}`; the previous avatar's file is released after the update), `removeAvatar` (clears the pointer, then releases the file)
- `setLocale` (persists the BCP-47 locale code)

`session` and `me` are deliberately **separate queries**: the cookie carries name/email but a stale `avatarUrl` and no `locale`. `sessionQueryOptions` is cookie-only, `staleTime: Infinity`, and drives the route guard; `meQueryOptions` reads the live row and drives ProfileModal, Avatar and `useLocale`.

### goals
- `getAll`, `create`, `update` — with tasks + value associations
- `remove` — **soft**: archives the goal, deletes its connections, archives its tracking items (see the `goals` table above). Exposed as `delete_goal` / the `deleteGoal` server fn; both return `{ success: true }`.

### values
- `getAll`, `create`, `update`, `delete` — value CRUD; deletion removes goal associations

### tasks
- `create({ goalId, ...fields, referentIds?, groupIds? })` — referent/group sets at create time
- `update` — replace-set semantics on `referentIds[]`/`groupIds[]` (omit to leave unchanged); accepts `scheduledAt`
- `delete`
- `setScheduled({ id, scheduledAt })` — drag-drop endpoint for Horizons; only persists the date, bucket is client-computed
- (Pulse uses `nextBids.listUpcoming` + `importantDates.list`, see below)

### connections
- `getAll`, `create`, `update`, `delete` (weight is the only mutable field)

### trackingItems
- `list({ goalId? })`, `create({ title, description?, goalId?, order? })`, `update`, `delete` (soft when referenced by a sync, hard otherwise)

### syncTemplates
- `list`, `create({ name, isDefault? })` (clears existing default in same tx if `isDefault: true`), `update`, `delete`, `setItems({ templateId, items })` (replace-set with orderIdx)

### weeklySync
- `getByWeek({ weekStart })`, `getWeeklyRetrospectiveData({ weekStart })` (hydrates everything: sync row, full library, goal-grouped items + attachments, top-level `unscopedItems[]`)
- `create({ weekDate, templateId? })` — snapshots from explicit/default template, empty otherwise
- `addItem` (idempotent), `removeItem` (drops from this sync only; library row stays; deletes its attachments' files, bytes included — attachments are polymorphic, so no FK does it), `setItemText`, `reorderItems`

### attachments
- `upload({ parentType: 'weekly_sync_item', parentId, fileName, fileType, data })` — base64; stores a file (bytes to the bucket, then the `files` row), then the attachment metadata row. Metadata-insert failure discards the file, bytes included. Returns `{ url }` as a `/api/files/{id}` path.
- `find` (metadata + the file's type and size, no bytes: what `/api/v1/attachments/{id}` streams from), `read` (the same with the bytes, for MCP's `get_sync_attachment`)
- `remove({ id })` — deletes the file (bytes, then row); the FK cascade takes the attachment row.

### images
- `upload`, `uploadMultiple` — single-image / multi-image upload (used outside the weekly-sync flow)

### people
- `getAll({ includeArchived? })`, `getById`, `create`, `update` (a new `emoji` that replaces an uploaded photo releases the old photo's file), `archive`/`unarchive` (preferred), `delete` (hard, only for wrong entries; an uploaded photo's file goes with it)
- `setCategory` — drag-drop, updates only category + boardOrder
- `getTasksAsReferent` (with goal context), `getBucketListItemsAsParticipant` (read-only, shown in PersonModal)

### groups
- `getAll`, `create`, `update`, `delete` — CRUD for cross-entity groups
- `getTasks({ groupId })` — tasks in a group joined with goal context (id/title/emoji + `scheduledAt` + completion); drives the Tasks section on the group filter view

### nextBids
- `list({ personId })`, `create({ personId, content, dueAt? })`, `update({ id, content?, dueAt? })` (`dueAt: null` clears), `setCompleted({ id, completed })` (sets/clears `completedAt`; bid stays visible), `delete` (hard — only for wrong entries)
- `listUpcoming({ withinDays })` — open bids across all the user's people whose `dueAt` falls within window (default 60d); joined with person name + emoji; drives Pulse "Upcoming" alongside `importantDates.list`

### importantDates
- `list({ personId? })` (omit personId → all dates, sorted by month/day), `create`, `update`, `delete`

### self
- `get` (or null), `update` — partial upsert on prose fields; only fields you pass get written

### selfListItems
- `list` (ordered by kind then orderIdx — client groups by kind), `create({ kind, content, patternCategory? })` (server zeroes patternCategory unless `kind = 'pattern'`), `update` (same enforcement), `delete`, `reorder({ kind, ordering })` (gated on userId+kind so a forged id from another kind/user is a no-op)

### bucketList
- `list` (oldest first; rows hydrate `personIds[]`), `create`, `update` (pass `personIds` to replace link set, omit to leave unchanged), `toggleCompleted`, `delete`

### Data export
- `data.getAll` — all user data (values, goals, connections). Shares `src/lib/data/queries/load-goals.ts` with `goals.getAll` — the 6-query hydration lives there once.
- `backup.export` / `backup.import` — full user backup including people + userSelf and the attachments' bytes (read from / written to the bucket). `import` re-parses its (large, untrusted) payload inside the service; that is not optional there. Its new files' bytes go to the bucket before their rows join the transaction (and are discarded if it rolls back); the replaced attachments' files lose their rows in the transaction and their bytes only after it commits. Person photos and the avatar are not in a backup and are left alone.

## File storage

Records in Postgres, bytes in the bucket. Every upload (avatar, person photo, sync attachment) is a **`files`** row — owner, name, type, size — and an object in the app's private bucket on the box's Garage store at **`files/<id>`**, a key derived from the row so no column stores a path. Sync-item text notes are inline in `weekly_sync_items.text_content` (DB-only).

**The pieces.** `src/server/object-store.ts` is the platform's canonical S3 client, copied **verbatim** from daedalus (`nix/modules/garage/client/`) with its vitest test beside it: never edit it here — change the canonical copy and copy it back in. Both files are in `.prettierignore` (they carry the platform's formatting). `src/server/bucket.ts` builds the store from the five `S3_*` variables the platform injects with Object storage on (not declared in `env.ts`: the client checks them itself, all five or none), and gives an in-memory store when they are absent — `pnpm dev` and the tests keep uploads in memory, gone on restart. In production there is **no fallback**: `start.mjs`, the image's only entry point, refuses to boot without the five variables. `bucket()` deliberately does not key on `NODE_ENV`: the box runs `pnpm run ci` inside the image after the build, with `NODE_ENV=production` and no bucket, and the tests must pass there. `src/server/services/files.ts` is the only code that touches both halves:

- **Write**: the object first (always with its Content-Type), then the row. A row never names bytes that were not written; a crash in between leaves an object nothing names.
- **Delete** (`deleteFiles`): the objects first (one batched remove), then the rows. A failed removal throws before any row goes, so the caller sees it and a retry finishes the job. `files → attachments` cascades, so an attachment row goes with its file row.
- **Release** (`releaseFile`): a column that named a file (`users.avatarUrl`, `people.emoji`) no longer does — after an avatar replace/remove or a person's photo change/delete. The file is deleted unless another row still names it; this runs after the change landed, so a failure is logged, not thrown.
- **Read**: from the bucket only. A row whose object is missing is answered as not found and logged by key — never served from the old `data` column.

> **The route path must stay exactly `/api/files/$id`.** The literal string `/api/files/{id}` is persisted in `users.avatar_url` and `people.emoji`, so moving the route orphans every stored reference.

The bucket is private and unreachable from a browser or the phone; bytes leave only through the app's routes, never as a presigned URL. `/api/files/$id` (session) and `/api/v1/attachments/{id}` (API key) share `server/api/file-response.ts`: the row names the Content-Type, the object gives Content-Length and an ETag, and a single `bytes=` Range is passed on and answered 206 (a range past the end is a 416). The route is auth-gated on every request and returns 404 for "not found", "not owned by caller" and "no object" alike, so no enumeration leaks. `Cache-Control: private, max-age=300` lets the browser keep the bytes for the session without persisting them in a shared cache; the phone route keeps its `private, max-age=31536000, immutable`.

How callers reference uploaded files:
- `users.avatarUrl` holds `/api/files/{fileId}` (or null for the initials fallback). On re-upload the new file is stored first, the pointer moves, then the old file is released.
- `people.emoji` accepts either an emoji glyph or `/api/files/{fileId}` (the `Avatar.tsx` component branches on it via `isEmojiUrl`). The Zod schema validates the URL shape via `isOurStorageImageUrl`. A photo uploaded and never saved onto a person (a cancelled modal) stays behind unnamed.
- `attachments.fileId` is a NOT NULL FK on `files.id`, cascading from the file to the attachment.

**Supported types:** images (PNG/JPG/JPEG/GIF/WebP), documents (TXT/PDF/...), video, audio, other. Image MIME is sniffed via magic bytes in `image-upload.ts`; non-image extensions are clamped to a safe-extension allow-list in `_shared.safeExtension`.

**Security:**
- The serving route requires an authenticated session AND matches `files.ownerId` against the session user. Nothing else.
- Upload services (`auth.uploadAvatar`, `people.uploadImage`, `attachments.upload`) build the `ownerId` from the `userId` that `authMiddleware` resolved server-side — no user-supplied path segments anywhere, and the object key is the server-minted id.
- Base64 envelope decoded + validated (size + image magic-bytes if `fileType === 'image'`) before anything is written.
- Attachment upload stores the file first, then the `attachments` metadata row. If the metadata insert throws, the file is discarded, bytes included (no orphan bytes).
- `isOurStorageImageUrl` rejects anything that isn't a clean `/api/files/{id}` path so user-pasted external URLs can't be smuggled through the emoji/avatar fields.

## MCP server (talk-to-Anansi via Claude)

Anansi ships a remote **Model Context Protocol** server at `POST /api/mcp` so Claude Desktop / claude.ai Connectors / Claude Code can read and write the user's goals, tasks, people, values, bids, dates, groups, bucket list, and Self entries through a tool catalog. The server **IS its own OAuth 2.1 Authorization Server** — it delegates to nothing upstream — but it uses the browser's Auth.js session as the identity input to `/oauth/authorize`. Bearer tokens are short-lived (1h access) with rotating refresh (30d).

Transport: Streamable HTTP via `@modelcontextprotocol/sdk`'s `WebStandardStreamableHTTPServerTransport` (stateless, JSON response mode). Each request creates a fresh `McpServer` + transport; the bearer is validated against `mcp_access_tokens.token_hash`, identity resolves to `McpCtx = { userId }`, and each tool calls `src/server/services/*` **directly, in-process**. No parallel business logic, no extra network hop, and — because the MCP graph never reaches the Start compiler — no server-function registration, CSRF or Seroval involved.

`src/routes/api.mcp.ts` must **never import `~/server/auth/session`**. MCP identity comes from the bearer token and nothing else; the only legitimate crossover is `/oauth/authorize`, which needs the browser session to know who is consenting.

### Endpoints

- `POST /api/mcp` — main JSON-RPC endpoint. 401 + `WWW-Authenticate: Bearer realm="anansi-mcp", resource_metadata="…"` on missing/invalid token.
- `GET /.well-known/oauth-protected-resource` — RFC 9728, served directly by `[.]well-known.oauth-protected-resource.ts`. No rewrite indirection.
- `GET /.well-known/oauth-authorization-server` — RFC 8414, same shape.
- `POST /oauth/register` — RFC 7591 Dynamic Client Registration. Public-client only (`token_endpoint_auth_method = "none"`). Rate-limited 5/min/IP.
- `GET /oauth/authorize` — the consent page. Reads the Auth.js session cookie. No session → redirect to `/login?next=<this-url-encoded>` (login/register honor `?next=`). Prior consent for the same `(user, client, scope)` → auto-mint a code + redirect to redirect_uri. Otherwise renders `ConsentScreen`.
  - All four branches (`error` | `redirect` | `consent`) resolve inside **one** server fn, `resolveAuthorize` in `oauth.fn.ts`, because a TanStack loader also runs on the client — neither `getServerSession()` nor `mintAuthCode()` can be called from the loader body. The route sets `staleTime: Infinity` + `shouldReload: false` so it cannot re-run; the codes table is single-use anyway, so a stray mint is unused rather than dangerous.
  - **The error branch renders inline and never redirects to an unverified `redirect_uri`.** That is the security property of the unknown-client case, not a UI preference.
- `POST /oauth/authorize/decision` — handles Approve/Deny. CSRF-guarded by Origin/Referer check. Approve mints a 60s single-use code bound to PKCE + redirect_uri, records consent, 303 to redirect_uri.
- `POST /oauth/token` — `authorization_code` + `refresh_token` grants. PKCE S256 only. Refresh is rotating with `SELECT … FOR UPDATE` to serialize concurrent rotations. Rate-limited 20/min/IP.
- `POST /oauth/revoke` — RFC 7009. Always returns 200.

### MCP tool catalog

`registerAllTools()` (in `src/lib/mcp/tools/index.ts`) wires **80 tools** across 14 domain files. All tool names are flat verb-first snake_case (`list_goals`, `update_person`, `set_next_bid_done`, …). Hand-written `title` + `description` drive LLM tool selection; Zod raw shapes give the SDK enough type info to both generate the inputSchema JSON Schema AND validate inputs at call-time.

Domains: `system` (4: `whoami`, `update_profile`, `set_avatar`, `remove_avatar`), `goals` (4), `tasks` (4), `values` (7), `people` (11), `next_bids` (6), `important_dates` (4), `groups` (5), `bucket_list` (5), `self` (7), `tracking_items` (4), `sync_templates` (5), `weekly_sync` (10, with `get_pulse` and the attachments), `connections` (4). The app is meant to be fully drivable from here. Left on the screens on purpose: password and email changes, because a connector must not be able to take over the account; backup export and import, because one is the whole account with file bytes and the other replaces it. A new feature gets its tools with it.

**A week is named by a calendar day (`localDay`), never by the clock.** The server is in UTC and `week_date` holds whatever Monday the creator's clock said: Monday 03:00Z from a browser in Uruguay, 00:00Z from a naive server. The unique index cannot see those as one week, so a tool computing `weekStartOf(new Date())` would start a second sync that Pulse never shows. So the tools take the user's `day`, `weekOfDay` turns it into noon UTC on its Monday, and `weekly-sync.ts` matches by week within `WEEK_MATCH_MS` instead of by instant. That also keeps one sync for a user who opens the app on another clock. Starting a week that has a sync returns that sync.

**Pulse is computed once**, in `lib/pulse.ts`: `Pulse.tsx` and `get_pulse` (`server/services/pulse.ts`) call the same pure functions, so a change to the attention rules reaches both.

MCP-specific gates (not in the underlying service schemas): `create_person` / `update_person` reject URL emojis (an LLM can't construct a valid `/api/files/{id}` pointer anyway); `create_goal` omits the `tasks` array (use `create_task` after the goal exists) so the LLM doesn't have to think about pre-cast task ids.

`src/lib/mcp/errors.ts` maps `AppError` → an MCP error result. **`_meta.trpc_code` keeps its name verbatim** even though tRPC is gone — it is an opaque private field that clients may already key on, and renaming it would be a gratuitous wire change.

**The catalog is pinned.** `.golden/mcp-tools.json` holds the full `tools/list` output with every `inputSchema`; the diff against it must be **exactly zero** after any change here. Enforced by `pnpm check:mcp-tools` (`scripts/check-mcp-tools.ts`), part of `pnpm ci` and so run inside the image build on every push to `main`. Re-baseline deliberately with `--update` only after reading the diff.

### Tables

All `user_id` columns are `uuid REFERENCES users(id) ON DELETE CASCADE`. Tokens stored as `token_hash` (SHA-256 hex of the raw value) — raw token never persisted.

- **mcp_oauth_clients** — DCR clients: `client_name`, `redirect_uris (text[])`, `grant_types (text[])`, `token_endpoint_auth_method` ("none"), `scope`. Id IS the public `client_id`.
- **mcp_authorization_codes** — single-use, 60s TTL, PKCE-bound: `client_id`, `user_id`, `redirect_uri`, `code_challenge`, `code_challenge_method` ("S256"), `scope`, `expires_at`, `consumed_at`. Id IS the opaque code value.
- **mcp_access_tokens** — `token_hash UNIQUE`, `user_id`, `client_id`, `scope`, `expires_at`, `revoked_at`. Hot-path indexes on `token_hash` and `user_id`.
- **mcp_refresh_tokens** — same shape + `rotated_to` (id of the replacement token for audit trail).
- **mcp_consents** — `(user_id, client_id) UNIQUE`, latest granted `scope`. Drives auto-approve on subsequent `/authorize` hits for the same client.
- **mcp_audit_log** — `event` (`register | authorize_started | consent_granted | consent_auto | authorize_denied | token_issued | token_refreshed | token_refresh_failed | token_revoked`), `user_id` (SET NULL on delete), `client_id`, `ip`, `meta` (JSON-stringified).

### File layout (under src/)

```
routes/api.mcp.ts                              # Bearer auth + transport
routes/[.]well-known.oauth-{authorization-server,protected-resource}.ts
routes/oauth.{register,token,revoke}.ts
routes/oauth.authorize.tsx                     # loader → resolveAuthorize server fn
routes/oauth.authorize.decision.ts             # Form POST → code mint
server/fn/oauth.fn.ts                          # resolveAuthorize (all four branches)
components/oauth/ConsentScreen.tsx             # Consent UI (EN-only for v1)
lib/mcp/server.ts                              # Per-request McpServer factory
lib/mcp/types.ts                               # McpCtx = { userId }
lib/mcp/errors.ts                              # AppError → MCP error result + mcpJsonResult
lib/mcp/tools/{system,goals,tasks,values,people,next_bids,important_dates,groups,bucket_list,self,tracking_items,sync_templates,weekly_sync,connections}.ts
lib/mcp/tools/fields.ts                        # isoDate + toolInput/closedObject (zod 4 JSON Schema)
lib/mcp/oauth/{store,clients,codes,tokens,pkce,consent,metadata,scopes,audit,authorize-validation}.ts
```

`ConsentScreen.tsx` is a plain HTML form posting to `/oauth/authorize/decision`, which stays a server route with its Origin/Referer CSRF check and 303 intact. `metadata.ts`'s `resolveOrigin(req: Request)` honours `x-forwarded-{proto,host}`, so the advertised endpoints are correct behind a proxy.

### Dev wiring

Add to `.mcp.json` in any project (or Claude Desktop's config):

```json
{ "mcpServers": { "anansi": { "type": "http", "url": "http://localhost:5173/api/mcp" } } }
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

## Phone API (/api/v1)

The iPhone app (`ios/`) has its own small REST API instead of driving MCP. Every route file is `src/routes/api.v1.*.ts` and wraps **each** handler in `withApiKey` (`src/server/api/v1.ts`), which rate-limits per IP (600/min, before the key check), resolves `Authorization: Bearer ank_…` through `src/server/services/api-keys.ts`, and turns `AppError`/`ZodError` into `{ "error": { code, message } }` with the matching status. Handlers call the service layer in-process, like the MCP tools; no business rule lives in a route. `surface.test.ts` lists every route as `apikey` and checks one `withApiKey(` per handler.

Keys: created and revoked by the signed-in user in Profile → Devices (`src/server/fn/api-keys.fn.ts`, `DevicesSection.tsx`). A new key is shown once, as text and as a QR code (rendered by `uqr`) of `anansi://connect?server=<origin>&key=<key>`, which the app (or the iPhone camera) opens to connect. At most 20 live keys per user; no expiry; no scopes.

| Route | Methods | Service |
| --- | --- | --- |
| `/api/v1/me` | GET | `auth.me` (id, name, email) |
| `/api/v1/pulse?day=YYYY-MM-DD` | GET | `pulse.get` |
| `/api/v1/weeks/{day}` | GET, POST `{templateId?}` | `weeklySync.getWeeklyRetrospectiveData` / `create` (by `weekOfDay`) |
| `/api/v1/syncs/{id}/items` | POST `{trackingItemId}` | `weeklySync.addItem` |
| `/api/v1/syncs/{id}/order` | PUT `{ids}` | `weeklySync.reorderItems` |
| `/api/v1/sync-items/{id}` | PATCH `{textContent}`, DELETE | `setItemText` / `removeItem` |
| `/api/v1/sync-items/{id}/attachments` | POST (body = the file; `?fileName=&fileType=`) | `attachments.upload` |
| `/api/v1/attachments/{id}` | GET (the bytes, streamed from the bucket, immutable; one Range honoured), DELETE | `attachments.find` + `file-response.ts` / `remove` |
| `/api/v1/tracking-items` | GET, POST | `trackingItems.list` / `create` |
| `/api/v1/tracking-items/{id}` | PATCH, DELETE | `update` / `remove` |
| `/api/v1/tracking-items/{id}/overlay` | PUT `{overlay}`, DELETE | `setOverlay` |
| `/api/v1/tracking-items/{id}/latest-picture?exclude=` | GET | `latestPicture` (newest image of any week, or null) |
| `/api/v1/templates` | GET, POST | `syncTemplates.list` / `create` |
| `/api/v1/templates/{id}/items` | PUT `{trackingItemIds}` | `syncTemplates.setItems` |
| `/api/v1/goals` | GET | `goals.list` (id, title, emoji) |

## Landing page

`src/routes/index.tsx` is one argument in five parts: hero with the hand-built Pulse window (`components/landing/AppDemo.tsx`), the web (`Web.tsx`, the Ananse Ntontan mark drawn large with real record kinds and the threads the schema links), Claude as a transcript of real MCP tool calls (`Transcript.tsx`), an FAQ, and the inverted coda. The header comment of each file says what it must stay in step with.

Copy rules, short form: every claim true today and checked against code or the legal pages (anansi is free, with no plans or pricing anywhere; nothing is encrypted at rest); never write a number the app has not computed; never invent quotes or users; no em or en dashes in user-visible strings (the separator is `·`); no exclamation marks, no hype words; the FAQ answers cost, access and privacy plainly and never talks about who runs the server or where. Keep `en.json` and `es.json` in step.

## i18n

EN + ES via i18next. **Translation bundles are code-split per language** — they
were ~55 KB gzipped of eagerly-loaded JSON on every page including the marketing
landing, to display one of the two. Now one locale loads per visit (~18 KB gz).

The load is invisible to the build and loud at runtime, because i18next answers a
missing bundle with the raw key path rather than an error. Three rules keep that
from ever reaching a user:

1. **Never call `i18n.changeLanguage` directly — call `switchLocale(locale)`** from
   `src/i18n/resources.ts`. It loads the chunk first. Switching first renders
   `landing.nav.web` until the fetch lands.
2. **Both render entries await the bundle before rendering.** The server does it in
   `__root`'s loader; the client does it in `src/client.tsx` before `hydrateRoot`
   (the root loader does *not* re-run on hydration, so the client entry is the only
   place that can). **`src/client.tsx` exists for that one await** — delete it and
   hydration paints key paths over correct HTML.
3. **`i18n.init()` is async, and `addResourceBundle` before it settles is silently
   discarded.** `ensureLocaleLoaded` awaits the exported `i18nReady` for this reason.

**The server clones the i18next instance per request** (`Provider.tsx`). i18next's
default export is a module singleton and `changeLanguage` mutates it, so on a
shared server one request's language leaked into the next — a visitor with no
cookie was served `lang="en"` wrapped around Spanish body text. `cloneInstance`
shares the resource store (bundles still load once) and gives each render its own
language. **The client keeps the singleton**: it is what `useTranslation()` hands
to `useLocale` / `LocaleQueryParam`, so cloning there disconnects the picker.

Locale precedence is `?locale=` → cookie → i18next detector (localStorage, then
navigator). The first two are resolved **server-side** in the root loader, so a
shared `/?locale=es` link is server-rendered Spanish. The shell marks that with
`data-locale-explicit` on `<html>`; `src/client.tsx` reads it to know whether it
may apply a stored localStorage preference, which must not override a link the
visitor just followed.

Adding a language: see the checklist at the top of `src/i18n/constants.ts`. The
`loaders` map in `resources.ts` is typed by `Locale`, so step 2 fails the build
until step 3 is done.

Verify with `node scripts/check-i18n.mjs <base-url>` — asserts the rendered
language, zero key paths in the DOM, zero hydration errors, and **exactly one
locale bundle on the wire**. Run it against `pnpm dev` and the built server;
the client entry differs between them.

## SSR shell preferences (theme, sidebar)

Two cookies exist purely so the **server** can render the first paint correctly.
Both store the *resolved* value, not the preference, because the inputs they
depend on — `prefers-color-scheme`, `window.innerWidth` — do not exist on the
server. Storing the answer is what makes it renderable; storing the question
would not help.

| cookie | holds | written by |
|---|---|---|
| `anansi:theme-resolved` | `light` / `dark` | `applyTheme` in `src/lib/theme.ts`, on every resolution change |
| `anansi:sidebar` | `<0\|1>:<width>` | the effect in `AppShell`, on every effective-geometry change |

`getShellPrefs` (`src/server/fn/shell.fn.ts`) reads both plus the locale in **one**
server fn — a route loader runs on the client too, so `getRequestHeader` cannot be
called from a loader body, and two fns would mean two sequential round trips.

The preference itself still lives in `localStorage` (`anansi:theme` holds
`light|dark|system`). The cookie is the render hint; the localStorage key is the
user's choice. They are deliberately different keys holding different things.

Residual: a first-ever visit, or the first load after the OS theme changed while
the user was away, still paints one default frame before the client corrects it
and writes a fresh cookie. A blocking inline `<script>` would close that too, but
that is exactly what was removed from the Next layout — React 19 warns about any
`<script>` in the rendered tree.

> **Never read `localStorage` or `window.*` in a `useState` initializer.** That is
> what made the sidebar jump and the theme flash: the server cannot run it, so SSR
> renders one thing and the client immediately renders another. Seed from a cookie
> the server also saw, and reconcile the genuinely client-only part (viewport
> width) in an effect. `Math.random()` in an initializer is the same bug — it cost
> a hydration mismatch in `GoalModal` the moment the modal became deep-linkable,
> which is why `pickDefaultEmoji` is seeded rather than random.

Verify with `node scripts/check-shell.mjs <base-url>`, which asserts what the
server sent by reading the raw HTML — a check that runs after the page settles
would pass either way, since the client always converges.

## Styling (Tailwind v4)

`src/styles/globals.css` is the single entry: `@import 'tailwindcss'`, then the `@source` directives, then the React Flow stylesheet, then ~70 oklch design tokens with `color-mix()`, the `[data-theme="dark"]` overrides and a small `@layer base`. There is no `tailwind.config.ts`, no `postcss.config.cjs`, no autoprefixer (lightningcss handles prefixing), and no `theme.extend` / `@apply` / `theme()` anywhere. Dark mode is a `[data-theme]` attribute, **not** Tailwind's `dark:` variant — there are zero real `dark:` usages in the codebase.

> **The `@source '../components'` and `@source '../routes'` directives are not optional.** v4 discovers classes by scanning outward from the CSS file's own directory, and `globals.css` lives in `src/styles/` while every class lives in a sibling. Delete them and nearly every utility silently vanishes *while the build still succeeds and the pages still render* — just unstyled.

Two v4 preflight changes are restored in the `@layer base` block rather than at ~190 call sites: `cursor: pointer` on non-disabled buttons (v3 preflight had it, v4 dropped it), and `::placeholder { color: var(--ink-4) }` (v3 used gray-400, v4 uses currentColor@50%; `--ink-4` is what this design system actually defines for placeholders). Also renamed during the v4 port: `flex-shrink-0` → `shrink-0` (the old name emits nothing in v4), `backdrop-blur-sm` → `backdrop-blur-xs` (the scale shifted, so the old name now means 2× the blur), `outline-none` → `outline-hidden` (v4's `outline-none` is `outline-style: none`; `outline-hidden` preserves v3's forced-colors-friendly transparent outline).

## Package registry

Every dependency resolves through the self-hosted **Verdaccio** at `https://verdaccio.toscanini.me/`. It is declared once, as `registry:` in `pnpm-workspace.yaml`, so local dev and the box's image build share a single gate — no environment can opt out, and there is **no fallback to npmjs anywhere**. A gate that silently routes around itself is not a gate.

What it provides: one chokepoint every app's dependencies flow through, private packages served alongside public ones, and independence from npmjs outages, unpublishes and yanked versions.

> **It is a cache, not a filter.** Verdaccio proxies npmjs transparently and vets nothing — a malicious package passes straight through. It becomes a security control only once configured as one (publish auth, package allow-lists). The protection against a *tampered mirror* is the lockfile, not the proxy: pnpm verifies every tarball against the integrity hash pinned in `pnpm-lock.yaml`, so even a fully compromised Verdaccio cannot swap the contents of a locked dependency. This repo's actual supply-chain defenses remain the cooldown below, `allowBuilds`, and `--frozen-lockfile`.

The lockfile is **registry-agnostic** — lockfile v9 records integrity hashes and no tarball URLs — so pointing at a different registry needs no lockfile change and produces a byte-identical install or fails on the hash.

**Failure mode to recognise.** When Verdaccio's uplink to npmjs is down it keeps answering `GET /`, `/-/ping` and every already-cached package with `200`, while returning `500 {"error":"uplink is offline"}` for anything it must fetch, and sometimes a hard `404` for a package npmjs serves fine. So the proxy looks healthy from a browser while installs collapse — only a real install of an uncached package is an honest probe. Persistent 404s can be a poisoned negative cache entry; delete that package's directory from Verdaccio's storage so it refetches.

Emergency override, for an outage where a build must ship anyway — deliberately manual, nothing automatic reaches for it:

```bash
pnpm install --config.registry=https://registry.npmjs.org/   # one command, locally
```

**`--config.registry` is the only spelling that works.** pnpm silently ignores
`npm_config_registry` / `NPM_CONFIG_REGISTRY`, so setting either resolves from
npmjs while looking correct — the same class of silent-fallback bug as the
`viteReact({ babel })` note above. There is no override for the box's build:
the gate is `pnpm-workspace.yaml`, which the build reads from the repo, so an
emergency that must ship goes through a commit like everything else.

## Supply-chain cooldown

`pnpm-workspace.yaml` sets `minimumReleaseAge: 10080` — no package version published in the last 7 days may be used. It is enforced **at every install, including `--frozen-lockfile`**, which re-verifies all lockfile entries; a lockfile written with the cooldown off will fail the box's image build even though nothing is being resolved.

The cooldown reads publish dates from the registry's packument, so it depends on Verdaccio proxying the `time` field through intact — it does (verified). A proxy that stripped `time` would break every install.

Adding a dependency:

```bash
# comment out minimumReleaseAge in pnpm-workspace.yaml
pnpm add <pkg>
# restore minimumReleaseAge
pnpm install --frozen-lockfile   # ← the step that catches a too-young TRANSITIVE dep
```

That last command is the one that matters, and it fails more often than the `pnpm add` does. When it names a transitive dependency, pin it under `overrides:` in `pnpm-workspace.yaml` with a comment saying when the pin can be deleted — and note that the policy check runs *before* resolution, so landing the pin needs one more install with the cooldown commented out. `pnpm dlx` from this repo needs `--config.minimum-release-age=0`.

## Post-change verification (required for every non-trivial change)

After any meaningful change — schema, route, component, refactor — run the whole set and **fix every warning and error before declaring the work done**.

```bash
pnpm format           # Prettier, formats in place
pnpm lint             # ESLint — must end with zero warnings AND zero errors
pnpm typecheck        # tsr generate && tsc --noEmit
pnpm check:mcp-tools  # MCP catalog vs .golden/mcp-tools.json — must be zero diff
pnpm test             # node's runner (via tsx) for our tests, then vitest for src/server/object-store.test.ts alone
pnpm build            # vite build (client + SSR + nitro)
```

`pnpm ci` is five of those six in their check form — `format:check`, `lint`,
`typecheck`, `test`, `check:mcp-tools` — plus `check:bundle`, and the box runs exactly
that inside the image build on every push to `main`, after the build step. A
failure there fails the build, so nothing ships past them.
`check:mcp-tools` needs no server, database or token — it builds the MCP server
in-process and drives a real client over an in-memory transport, so it is seconds.

**`check-fonts.mjs` and `check-i18n.mjs` are not automated today.** They lived
only in the deleted GitHub Actions workflow, and nothing runs them now: both
need a booted server and a Playwright chromium, and the image build has neither.
They still guard failures that are invisible to a build — a wrong
font family silently renders the app in `Georgia`, a missing i18n bundle
silently renders raw key paths, both at HTTP 200 — so run them by hand against
a built server (neither needs a database; boot against a deliberately
unreachable `DATABASE_URL`) after touching fonts or translations.

`check-shell.mjs` is not automated either, and never was: it signs in and loads
`/app`, so it needs a real Postgres and a seeded user. Run it locally against
`pnpm dev` or a built server.

Rules:
- Zero is the only acceptable count. Don't ship "just one warning" — they compound and get ignored.
- Fix the root cause rather than disabling a rule. `eslint-disable` comments need a one-line justification and should be rare.
- **Do not run `pnpm typecheck` while `pnpm dev` is running.** Both generate `routeTree.gen.ts`; racing them puts the dev server into an endless reload loop that looks like an app bug.

> **A green `pnpm build` is not evidence that the app runs.** Three separate defects during the migration passed `vite build` and failed on the first real request: `import 'server-only'` (500 on every SSR pass), a mis-registered server-function id (`Invalid server function ID`, only at call time), and a dnd-kit hydration mismatch. **Exercise changes in `pnpm dev` from a real browser**, and include *client-side* navigation — a hard reload runs loaders on the server where a server fn is a direct call, so only client-side navigation tests the RPC path.

`.golden/` holds the pre-migration oracle and is the reference for anything that must not drift: the 80-tool `tools/list` JSON, both `.well-known` documents, the MCP 401 response (which doubles as the security-header baseline), and 29 screenshots. `.golden/README.md` documents the diff procedure, the one deliberate re-baseline (zod 4), and its known false positives (`objectives-*` always differ — React Flow animates its dashed edges).

## Infrastructure

- **`start.mjs`** is the container entry: apply Drizzle migrations, then `import('./.output/server/index.mjs')` (Nitro's bundle listens on import and reads `PORT`/`HOST`). It preflights `DATABASE_URL`, `AUTH_SECRET` and the bucket's five `S3_*` variables and exits 1 if any is missing. **`MIGRATE_ONLY=1` short-circuits before the server starts and exits 0** — that is a hard external contract, used as a NixOS `ExecStartPre`. Do not split this into a separate migration container.
- **`railpack.json`** is the WHOLE build definition — there is no Dockerfile. `provider: node` + `.tool-versions` pick the toolchain; `steps.build` extends Railpack's own build step; `deploy.inputs` is the complete list of what the runtime image contains — the mise runtime, `/app/.output` (which carries the S3 SDK inside Nitro's server bundle), `start.mjs`, the Drizzle migrations, and the bare `node_modules/drizzle-orm` + `node_modules/postgres` that `start.mjs` imports. Nothing else ships: an image that needs another file needs another `deploy.inputs` entry, not a copy step. Rolling a build definition back is `git revert` of the commit that changed it.
  - The registry is **not** named here either: `pnpm-workspace.yaml` is in the build context and pins `registry:`, so the box's build inherits the same gate as local dev. See "Package registry" for the emergency override and for why `--config.registry` is the only spelling pnpm honours.
  - There is **no `HEALTHCHECK`** in a Railpack image, so nothing container-side round-trips `SELECT 1` any more. `/api/healthz` still exists and is what gatus probes from outside; a green systemd unit has never meant a live container here.
- **`railpack.json`'s `exclude`** is the build-context filter, in `.dockerignore` syntax with `!` negation — Railpack read `.dockerignore` and merged it into this same field, so folding the file in changed nothing except leaving exactly one list. Two entries carry real history: the `*.png` exclusion is written `/*.png`, anchored to the context root, because a bare `*.png` matches at every depth and would silently drop `public/icon.png` and `public/apple-icon.png`, breaking the favicon with no error anywhere; and **`.golden/` is deliberately NOT excluded** — `pnpm ci` runs `check:mcp-tools`, which reads `.golden/mcp-tool-names.tsv` as its oracle, and the checks run against this same context. Excluding something the build or the checks need breaks them; excluding something only the image does not need buys nothing, because `deploy.inputs` already decides that.
- **Security headers** — the six headers that used to be `next.config.js`'s `headers()` now live in `src/lib/security-headers.ts` and are applied by a global **request** middleware in `src/start.ts`. Request middleware wraps every request Start handles — pages, server functions, server routes, redirects, 404s — which is what `source: '/:path*'` meant. Nitro `routeRules` would only exist in the built output and silently vanish under `vite dev`. (The one gap: a server function that *throws* produces Start's own 500 outside this middleware, so that response has no headers.)
- **Build** — the box builds this repo; there are no `.github/workflows` files and no `REGISTRY_PASSWORD` secret. On every push to `main` daedalus's GitHub App builds the image with rootless BuildKit + Railpack from `railpack.json`, running `pnpm ci` (format:check → lint → typecheck → test → check:mcp-tools → check:bundle) inside that build, and pushes `sha-<sha>` and `latest` to the box's own zot registry (`registry.toscanini.me/anansi`). `app-anansi-deploy.timer` sees the new digest and restarts the container — live in ~2 minutes, and nothing leaves the network. The result shows up on GitHub as a check run named `daedalus` plus a Deployment.
  - The build reads no env vars: `src/lib/env.ts` validates when the server first imports it, which `vite build` never does, so `railpack.json` declares no `secrets` and the build needs no placeholders. All that matters is a runnable image listening on 3000.
  - Dependencies resolve through the self-hosted **Verdaccio** and there is **no fallback to npmjs** — see "Package registry" below. Verdaccio being unreachable fails the build, by design.
  - To verify a change to the build definition: `pnpm ci` locally for the checks, and for a **real** image without shipping it, set the app's publish mode to *Candidate* in daedalus and press *Build now* — same Railpack build, pushed as `candidate-<sha>`, deployed nowhere.

## Database migrations

Drizzle migrations live in `src/lib/data/db/migrations/`. `0000_perpetual_scream.sql` is the squashed 23-migration history; `0001`–`0004` came after it (`0003_files_data_nullable` and `0004_drop_files_data` retired `files.data` when the bytes moved to the bucket).

1. **One migration per PR.** Schema changes land as a single consolidated file, not a chain of fixups. Reviewers shouldn't replay your iteration history; squashing after the fact is a merge-conflict magnet.
2. **If you change schema during a PR and the previous migration isn't committed yet, roll it back before regenerating:**
   - Manually reverse in Postgres (`DROP TABLE`, `ALTER TABLE DROP COLUMN`, …) and delete the row from `drizzle.__drizzle_migrations` (match on `hash`, not `id`).
   - Delete the uncommitted `.sql` + `meta/NNNN_snapshot.json` and remove the matching `entries[]` item from `meta/_journal.json`.
   - Edit `schema.ts`, then `pnpm db:generate` to produce a single fresh migration.
   - `pnpm db:migrate` to apply.
   - **Do not** use `pnpm db:push` during this workflow — it's interactive and touches unrelated foreign keys.

## Maintenance

**This file is the single source of truth.** Update it on the same commit as any change to: schema, service/endpoint surface, file structure, features, tech stack, auth, file storage, routing, or major UI restructuring. Out-of-date docs are worse than no docs — a future agent will trust the wrong fact and break something.


---

_Single source of truth for Anansi's architecture, features, and implementation._
