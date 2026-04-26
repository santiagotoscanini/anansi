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

- ⬜ **#8 — `throw new Error(...)` everywhere → wrong HTTP status codes.** Replace with `TRPCError({ code, message })` in `trpc.ts` middleware + ~62 router sites.
- ⬜ **#9 — No rate limiting.** Add `@upstash/ratelimit` (or token bucket) on auth.* and upload mutations.
- ⬜ **#10 — `refreshData()` refetches full graph on every CRUD.** Convert to targeted `utils.invalidate()` per affected query, optimistic updates on hot paths.
- ⬜ **#11 — `getGoalProgress` is recursive O(n²) per render.** Memoize via topological computation, single pass on data change.
- ⬜ **#12 — Goal update wipes all tasks on every save.** Stop sending `tasks[]` on `goals.update`; route per-task edits through the per-task endpoints.
- ⬜ **#13 — Missing DB indexes.** Add indexes on goals(user_id,status), tasks(goal_id), connections(source/target), task_referents(task_id/person_id), attachments(parent_type,parent_id), weekly_sync_items(weekly_sync_id,order_idx), partial on next_bids open, important_dates(person_id).
- ⬜ **#14 — `getWeeklyRetrospectiveData` runs queries serially.** `Promise.all` the independent ones.
- ⬜ **#15 — Password min 6 chars.** Bump to 12 + breached-password check (HIBP-style).
- ⏭ **#16 — Zero tests.** Deferred; see `todo.md`.

## 🟡 MEDIUM — structural

- ⬜ **#17 — Split `goals.ts` (2433 lines) and `GoalsContext.tsx` (839 lines).** Per-feature router files; auth pulled out of the goals context.
- ⬜ **#18 — `calculateImportance` duplicated 4×, `loadGoalsForUser` 2×.** Extract to shared helpers, prove logic is identical.
- ⬜ **#19 — Migrate to App Router-native `createTRPCReact` + provider in layout.** Drop `withTRPC` HOC.
- ⏭ **#20 — `z.date()` vs `z.coerce.date()` inconsistency.** Deferred.
- ⬜ **#21 — Dual error shape: auth returns `{ success, error }`, others throw.** Converge on TRPCError throws (rolls into #8).
- ⏭ **#22 — Structured logging (pino).** Deferred.
- ⏭ **#23 — Security headers (CSP/HSTS/X-Frame-Options).** Deferred.
- ⬜ **#24 — `debug.getWeeklySyncData` ships in production.** Dead code (verified no callers). Delete.
- ⏸ **#25 — Dockerfile installs drizzle-kit in runner.** Skip — self-hosted, migrations must run inside container.
- ⏸ **#26 — `docker-compose.yml` hardcoded userId in volume mount.** Skip — file is unused, kept for local dev.
- ⏸ **#27 — Vercel Speed Insights/Analytics on self-hosted.** Skip — leave as-is.
