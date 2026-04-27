# Anansi — Improvement Plan Progress

Audit performed 2026-04-26. Items numbered as in the original audit; legend below.

**Status:** ⬜ pending · 🟨 in progress · ✅ done · ⏭ deferred to `todo.md`

---

## 🔴 URGENT — security & data integrity

- ✅ **#1 — Hardcoded JWT secret fallback.** Throws at module load if `JWT_SECRET` is missing or <32 chars. Added `JWT_SECRET` passthrough to `docker-compose.yml`, documented in `.env.example`. **Deploy note:** prod env must export `JWT_SECRET` or the container will refuse to start.
- ✅ **#2 — `auth.getUsers` deleted.** No callers found. Removed from `auth.ts` and from the CLAUDE.md endpoint list.
- ✅ **#3 — JWT cookie now HttpOnly.** Three Next route handlers (`/api/auth/login`, `/api/auth/register`, `/api/auth/logout`) set the cookie with `HttpOnly; Secure (in prod); SameSite=Lax`. Removed `auth.authenticate`/`auth.register` tRPC mutations and the entire `src/lib/auth-client.ts`. Verified via curl that `Set-Cookie` carries `HttpOnly` and that `me` round-trips with the cookie.
- ✅ **#4 — `/uploads/[...path]` now authenticated.** Reads JWT from cookie, requires the leading path segment to match the caller's userId, and resolves the absolute path to verify it stays under `UPLOADS_ROOT` (catches percent-encoded traversal). Adds `X-Content-Type-Options: nosniff` and switches `Cache-Control` to `private`. Smoke-tested: unauth→401, own→200, cross-user→403, traversal→400/404.
- ✅ **#5 — CORS block removed.** Same-origin Next deployment doesn't need it. The wildcard+credentials combo was invalid per spec but signalled confused intent.
- ✅ **#6 — Image upload validation.** New `decodeUpload`/`decodeImageUpload`/`sniffImageMime` helpers in `lib/image-upload.ts`. 10MB binary cap (≈14MB base64), PNG/JPEG/GIF/WebP magic-byte sniff for image paths, sniffed-MIME → canonical extension (so a `.png` carrying JPEG payload lands as `.jpg`), `safeExtension` allow-list for non-image attachments (anything outside list → `.bin`). Wired into `auth.uploadAvatar`, `goals.people.uploadImage`, `goals.attachments.upload`. Smoke-tested: valid PNG→200, JS-as-PNG→rejected, 14MB→rejected.
- ✅ **#7 — `auth.verify` deleted.** GoalsContext now derives auth state from `auth.me.useQuery()` (already protected) instead of probing token validity through a public endpoint.

## 🟠 HIGH — correctness, perf, ergonomics

- ✅ **#8 — `TRPCError` everywhere.** `trpc.ts` middleware now throws `TRPCError({ code: "UNAUTHORIZED" })`. All 60 router sites converted: ownership / not-found → `NOT_FOUND`, email collisions → `CONFLICT`, wrong-current-password → `FORBIDDEN`, batch-validation/upload errors → `BAD_REQUEST`, post-insert no-row → `INTERNAL_SERVER_ERROR`. Smoke-tested: unauth→401, missing goal→404 (both were 500 before).
- ✅ **#9 — Rate limiting (in-memory).** New `lib/rate-limit.ts` with fixed-window token bucket + periodic sweep + `clientIpFromHeaders` (Traefik-aware). Applied: login 5/15min/IP, register 3/hour/IP, avatar upload 10/min/user, person photo 20/min/user, attachments 30/min/user. Smoke-tested: 6 bad-password tries in a row → attempts 1-5 return 401, 6+ return 429 with `Retry-After: 900`.
- ✅ **#10 — Targeted invalidation + optimistic task toggle.** Replaced 18 `await refreshData()` calls with `await invalidateData()` (a thin wrapper around `utils.goals.data.getAll.invalidate()`) — same target, but explicit React-Query semantics that don't block the mutation handler. Added optimistic update on `updateTask`: snapshots the cache, patches the matching task, awaits the server, rolls back on error. The canvas checkbox now flips instantly. `refreshData` is preserved on the public surface for components (backup-import) that explicitly want to wait on the refetch. Note: splitting `goals.data.getAll` into per-feature queries deferred — substantial cross-component refactor that belongs with #17 (router/context split).
- ✅ **#11 — Progress computed once per data change.** New `progressCaches` `useMemo` builds three Maps in one pass: `goalsById`, `completions`, `progresses`. The DFS that computes total progress uses a memo + visiting set so cycles in the goal graph don't infinite-loop. `getGoalCompletion` / `getPathCompletion` / `getGoalProgress` become O(1) Map lookups instead of recursive scans on every render. Identical math; verified by round-trip on real data (2 goals / 1 connection).
- ✅ **#12 — Goal update no longer accepts `tasks`.** `updateGoalSchema` now omits the field — Zod rejects it before the procedure runs. Removed the inputTasks delete-and-reinsert block from `goals.update` entirely. Verified the only call site (`GoalModal.handleSave`) already wasn't sending tasks. Per-task edits go through `goals.tasks.{create,update,delete}` exclusively.
- ✅ **#13 — DB indexes added.** Migration `0017_lush_thunderbolt.sql` adds 14 indexes: `goals(user_id,status)`, `goals(parent_id)`, `tasks(goal_id)`, `tasks(scheduled_at)`, `connections(source)`, `connections(target)`, `task_referents(task_id)`, `task_referents(person_id)`, `weekly_sync_items(weekly_sync_id,order_idx)`, `weekly_sync(user_id,week_date)` (unique — one sync per user per week), `people(user_id)`, `next_bids(person_id)`, partial `next_bids(person_id) WHERE completed_at IS NULL` (drives Pulse), `important_dates(person_id)`. attachments + tracking_items + self_list_items already had theirs.
- ✅ **#14 — `getWeeklyRetrospectiveData` parallelized.** Two batches via `Promise.all`: (1) sync row + active goals + tracking-items library — independent; (2) connections + sync-items — depend on goalsData/syncRecord respectively but parallel to each other. Attachments still sequential since they need syncItemsData. Response shape unchanged; HTTP round-trip verified.
- ✅ **#15 — Password minimum 12 chars.** Updated registerSchema, changePasswordSchema, RegisterModal client validation, and ProfileModal placeholder. Existing accounts with shorter passwords still log in (length is enforced only on new/changed passwords). Note: the dev account `santi@test.local` / `devpassword` (11 chars) keeps working for login; the password just can't be re-used as a *new* password if changed via the profile UI. HIBP / breach-list deferred — added as a follow-up nice-to-have if you want it later.
- ⏭ **#16 — Zero tests.** Deferred; see `todo.md`.

## 🟡 MEDIUM — structural

- ⬜ **#17 — Split `goals.ts` (2433 lines) and `GoalsContext.tsx` (839 lines).** Per-feature router files; auth pulled out of the goals context.
- ⬜ **#18 — `calculateImportance` duplicated 4×, `loadGoalsForUser` 2×.** Extract to shared helpers, prove logic is identical.
- ⬜ **#19 — Migrate to App Router-native `createTRPCReact` + provider in layout.** Drop `withTRPC` HOC.
- ⏭ **#20 — `z.date()` vs `z.coerce.date()` inconsistency.** Deferred.
- ✅ **#21 — Dual error shape converged.** tRPC procedures all throw `TRPCError`; the auth route handlers under `/api/auth/*` return `{ error }` with proper HTTP status codes (401/400/409). Frontend `authenticate`/`register` check `res.ok` instead of parsing a `success` field.
- ⏭ **#22 — Structured logging (pino).** Deferred.
- ⏭ **#23 — Security headers (CSP/HSTS/X-Frame-Options).** Deferred.
- ⬜ **#24 — `debug.getWeeklySyncData` ships in production.** Dead code (verified no callers). Delete.
- ⏸ **#25 — Dockerfile installs drizzle-kit in runner.** Skip — self-hosted, migrations must run inside container.
- ⏸ **#26 — `docker-compose.yml` hardcoded userId in volume mount.** Skip — file is unused, kept for local dev.
- ⏸ **#27 — Vercel Speed Insights/Analytics on self-hosted.** Skip — leave as-is.
