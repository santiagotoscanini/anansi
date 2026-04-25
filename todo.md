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
- [ ] **User profile page** — dedicated route under the sidebar (probably bottom of the rail
      or a click on the avatar). Edit:
  - Display name
  - Email (with re-verification email if NextAuth flow requires it)
  - Profile image (avatar upload — reuse the `attachments` table with
    `parent_type='user_profile'` so we don't add another file table)
  - Password change (only when using credentials provider)
  - Account deletion / data export entry points (export already exists via
    `goals.backup.export`; surface a button)

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

## UI improvements

- [ ] **Goal Modal — "Link existing tracking item" picker** *(open from the original sync redesign plan)*
      Today the modal only creates new tracking items linked to that goal. Add a picker that
      shows the user's library entries with `goalId IS NULL` (or a different goal) so an
      existing item can be re-pointed without leaving the modal.
- [ ] **Sync — drag-reorder of items inside a sync** — the template editor already uses
      `@dnd-kit/sortable`; reuse that pattern in `WeeklyRetrospective` to persist via
      `weeklySync.reorderItems`.
- [ ] **Empty-state hint on first Sync visit** — if the user has no default template,
      surface a one-line "Set up a template so future syncs auto-fill" with a button that
      opens the template editor pre-focused on the create input.
- [ ] **Avatar upload** — `Avatar.tsx` already handles URL/emoji/initial fallback; wire the
      upload flow once profile lands.
- [ ] **Mobile polish pass** — drawer interaction on the sidebar, tap targets on the values
      page color picker, picker modals on small viewports.
- [ ] **Graph readability** — on dense graphs the node labels overlap. Either auto-zoom-to-fit
      on load, or render labels with a translucent background.

## Tech debt left from the sync redesign

- [ ] **Drop `weekly_sync_item_files` in a follow-up migration** — already empty in every
      environment after `scripts/migrate-sync-storage.ts`. Schema.ts still keeps it as a
      deprecated table. Drop the table + its Drizzle entry once a release has gone by with
      no regressions.
- [ ] **Replace the `WeeklyRetrospective.tsx` shape adapter** — the component still projects
      the new server shape into the legacy `RetroGoal/RetroTrackingItem` types. Rewrite the
      JSX directly against the new shape (`goal.items[]`, `attachments[]`, `textContent`)
      so the adapter goes away.
- [ ] **Backup version bridging** — current code only accepts `version: 2` backups.
      Either add a one-shot `v1 → v2` converter or document that pre-redesign exports
      need manual restore.
