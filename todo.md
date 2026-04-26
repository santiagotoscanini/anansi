# Anansi — Outstanding work

Tracker for features not yet built and tech debt left behind by the
sync-redesign session. Add new items above the relevant section heading;
strike through completed items rather than deleting them so the trail of
shipped work stays visible until the next prune.

## Auth & user profile

- [ ] **Real OAuth via NextAuth** — replace the local password flow with NextAuth providers
      (Google + GitHub at minimum). Reference implementation in the **Voyra** project — match
      the route layout, session callback, and edge-runtime guards there. Plan to keep the
      seeded local-dev user (`santi@test.local`) usable during the transition via a credentials
      provider.

## TickTick integration

- [ ] **TickTick OAuth** — add it as a NextAuth provider OR a separate connect flow under
      profile. Store the access + refresh tokens encrypted in a new `external_credentials`
      table keyed by `(user_id, provider)`.
- [ ] **Two-way sync with TickTick**
  - Map our `tasks` (per-goal, with difficulty 1-3) ↔ TickTick tasks. Sync delta both ways:
    - Local create → push to TickTick
    - TickTick create → ingest into the matching goal's task list
    - Status / completion both directions
  - Conflict policy: last-write-wins on edits, but never auto-delete on the remote (ask first).
  - Decide which TickTick project a new goal maps to (default: a single "Anansi" list, or one
    list per top-level goal).
  - Background job — Next.js cron / a long-running queue worker to pull on a schedule.

## Goals & objectives

- [ ] **Books on goals — ISBN / Goodreads links** — let a goal carry a list of books I want to
      read as part of pursuing it. Capture by ISBN or Goodreads URL; render the list in the
      goal modal with cover/title fetched from the source. Decide whether the list is its own
      table (`goal_books`) or a generic "external references" table that future link types
      (papers, courses, podcasts) can reuse.

## UI improvements

- [ ] **Goal Modal — "Link existing tracking item" picker** _(open from the original sync redesign plan)_
      Today the modal only creates new tracking items linked to that goal. Add a picker that
      shows the user's library entries with `goalId IS NULL` (or a different goal) so an
      existing item can be re-pointed without leaving the modal.
- [ ] **Sync — drag-reorder of items inside a sync** — the template editor already uses
      `@dnd-kit/sortable`; reuse that pattern in `WeeklyRetrospective` to persist via
      `weeklySync.reorderItems`.
- [ ] **Empty-state hint on first Sync visit** — if the user has no default template,
      surface a one-line "Set up a template so future syncs auto-fill" with a button that
      opens the template editor pre-focused on the create input.
- [ ] **Mobile polish pass** — drawer interaction on the sidebar, tap targets on the values
      page color picker, picker modals on small viewports.
- [ ] **Graph readability** — on dense graphs the node labels overlap. Either auto-zoom-to-fit
      on load, or render labels with a translucent background.

## Multi-cadence syncs (future)

Today there's exactly one sync type — weekly. Down the road, support multiple
ad-hoc cadences (daily, weekly, monthly, quarterly, …) each with **their own
default** set of items. Implications when picked up:

- Schema: extend `sync_templates` (or rename to `sync_defaults`) with a
  `cadence` enum (`daily | weekly | monthly | custom_days`) plus a
  `period_key` derivation rule. A user has one default per cadence.
- `weekly_sync` becomes more general (probably renamed to `syncs`) with a
  cadence column and a period key (week-of-year, day, month-of-year, etc.).
- UI: a per-cadence picker in the Sync tab. Each cadence has its own retro
  view; navigation moves you forward/back within the cadence.
- The current single-default per user (one template row, isDefault always
  true) is the trivial case of this — preserved without migration if we
  add cadence as nullable + treat `NULL` as "weekly".

Until then: hide the multi-template surface. One default per user, always.

## Tech debt left from the sync redesign

- [x] ~~**Replace the `WeeklyRetrospective.tsx` shape adapter** — the component still projects
      the new server shape into the legacy `RetroGoal/RetroTrackingItem` types. Rewrite the
      JSX directly against the new shape (`goal.items[]`, `attachments[]`, `textContent`)
      so the adapter goes away.~~

## Tech debt deferred from the 2026-04-26 audit

See `IMPROVEMENTS.md` for the full audit and its in-progress items. The
following were deliberately deferred:

- [ ] **Tests** — no unit, integration, or e2e tests exist. Pick when ready: Vitest for
      unit/router tests + Playwright for the four highest-stakes e2e flows (login, create
      goal, weekly retro create, backup-import round-trip). _Audit item #16._
- [ ] **`z.date()` vs `z.coerce.date()` consistency.** Pick `z.coerce.date()` everywhere so
      non-superjson clients (mobile, curl, future TickTick callbacks) round-trip cleanly.
      _Audit item #20._
- [ ] **Structured logging (pino).** 39 `console.*` call-sites with no context tagging
      (userId, requestId, durationMs). Bring in `pino` + a tRPC middleware that attaches
      structured fields per request. _Audit item #22._
- [ ] **Security headers** — `Strict-Transport-Security`, `X-Frame-Options`,
      `Referrer-Policy`, `Content-Security-Policy`. Baseline CSP for a uploads-rendering
      app: `img-src 'self'; script-src 'self'`. Configure via `next.config.js`. _Audit
      item #23._
