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

- [ ] **Replace the `WeeklyRetrospective.tsx` shape adapter** — the component still projects
      the new server shape into the legacy `RetroGoal/RetroTrackingItem` types. Rewrite the
      JSX directly against the new shape (`goal.items[]`, `attachments[]`, `textContent`)
      so the adapter goes away.
- [ ] **Backup version bridging** — current code only accepts `version: 2` backups.
      Either add a one-shot `v1 → v2` converter or document that pre-redesign exports
      need manual restore.

# Improvements found at the plane

- ~~Sidebar should be flexible, and collapse when it's too small. It should still have the collapse/expand button.~~
- ~~No need for data migration. Assume this is the first time using the app, so no need for scripts, backwards compatibility, export/import with fallbacks, etc. The code should assume current version is the only one.~~
- ~~We should add GitHub Docker deployment, which means that when the package.json is uploaded (use the /commands from santree for patch, minor) a new Docker image should be pushed to GitHub registry, so I don't need to clone the repo on the NAS.~~
- ~~Cleanup unused functions in the codebase, looks like there are legacy code paths, at a first glance I saw `saveWeeklySyncFile`, but there are probably lot of them.~~
- ~~On the schemas trackingItems, syncTemplates, etc there is an issue with pgTable: The signature '(name: "tracking_items", columns: { id: HasRuntimeDefault<HasDefault<IsPrimaryKey<NotNull<PgTextBuilderInitial<"id", [string, ...string[]]>>>>>; ... 8 more ...; updatedAt: HasDefault<...>; }, extraConfig: (self: { ...; }) => PgTableExtraConfig): PgTableWithColumns<...>' of 'pgTable' is deprecated.ts(6387). table.d.ts(38, 8): The declaration was marked as deprecated here.~~
- ~~Drop `weekly_sync_item_files` in a follow-up migration, it's deprecated and legacy.~~
- ~~Similar to above, there are legacy columns in the userSelf table, drop them~~
- ~~Similar, migrate gift ideas name to be next_bids, it represent more than just gifts.~~
