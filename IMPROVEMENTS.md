# Anansi — Improvement Plan Progress

Audit performed 2026-04-26. Items numbered as in the original audit; legend below.

**Status:** ⬜ pending · 🟨 in progress · ✅ done · ⏭ deferred to `todo.md`

---

## 🔴 URGENT — security & data integrity

- ✅ **#1 — Hardcoded JWT secret fallback.** Throws at module load if `JWT_SECRET` is missing or <32 chars. Added `JWT_SECRET` passthrough to `docker-compose.yml`, documented in `.env.example`. **Deploy note:** prod env must export `JWT_SECRET` or the container will refuse to start.
- ✅ **#2 — `auth.getUsers` deleted.** No callers found. Removed from `auth.ts` and from the CLAUDE.md endpoint list.
- ⬜ **#3 — JWT cookie not HttpOnly (XSS = takeover).** Move auth state changes to dedicated Next route handlers (`/api/auth/login`, `/api/auth/register`, `/api/auth/logout`). Set the cookie server-side with `HttpOnly; Secure; SameSite=Lax`. Remove `clientAuth.setCookie`.
- ⬜ **#4 — `/uploads/[...path]` is unauthenticated.** Verify JWT from cookie, enforce leading-path-segment matches `userId`. Replace the substring traversal check with `path.normalize` + `startsWith(UPLOADS_ROOT)`.
- ⬜ **#5 — CORS wildcard with credentials.** Remove the CORS block from `next.config.js`.
- ⬜ **#6 — Image upload: extension-only, no size limit, no magic-byte sniff.** Add Zod size cap (10MB), magic-byte check, `X-Content-Type-Options: nosniff` on the uploads route.
- ⬜ **#7 — `auth.verify` is publicProcedure taking the token in body.** Delete it; client uses `auth.me` (already protected).

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
