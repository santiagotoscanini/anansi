# Phase 0 baseline oracle

Captured before the TanStack Start migration, on branch `tanstack-start-migration`.
Every later phase is diffed against these. Regenerate nothing here — if a diff appears,
the diff is the finding.

## Artifacts

| File | What it is | Used by |
|---|---|---|
| `mcp-tools.json` | `tools/list` result: all **51** tools with full `inputSchema`, sorted by name | **The standing catalog gate** — `pnpm check:mcp-tools`, run in CI on every PR. Diff must be exactly zero. Re-baselined once for zod 4; see below. |
| `mcp-tool-names.tsv` | `domain <TAB> tool_name`, 51 rows, 51 unique | Cross-check that no tool is dropped or renamed |
| `procedures.tsv` | `file <TAB> line <TAB> name`, **84** rows | **Phase 1b checklist** — one service export per row, no exceptions (mitigates R7, the loss of `_def.record` flattening) |
| `well-known-as.json` | RFC 8414 authorization-server metadata | Phase 3.5 — must stay byte-identical modulo origin |
| `well-known-pr.json` | RFC 9728 protected-resource metadata | ditto |
| `mcp-401.txt` | Unauthenticated `POST /api/mcp` response | Proves the 401 + `WWW-Authenticate` shape survives; **also the baseline for the 6 security headers** that move out of `next.config.js` into `src/start.ts` |
| `font-vars.txt` | The `--font-*` CSS custom properties as `next/font` currently emits them | **Phase 3.1 / R3** — see below |

## Fonts (settles R3)

`next/font` emits **non-variable** family names:

```
--font-cormorant:         "Cormorant Garamond", "Cormorant Garamond Fallback"
--font-instrument-serif:  "Instrument Serif",   "Instrument Serif Fallback"
--font-newsreader:        "Newsreader",         "Newsreader Fallback"
--font-geist:             "Geist",              "Geist Fallback"
--font-geist-mono:        "Geist Mono",         "Geist Mono Fallback"
```

So use the **static `@fontsource/*`** packages, which declare exactly these families.
`@fontsource-variable/*` declares `"X Variable"` and would silently fall through to the
`Georgia, serif` / `ui-sans-serif` fallbacks in `globals.css` with no error. Cormorant,
Instrument Serif and Newsreader all need their **italic** subsets (`.wordmark` and
`.brand-em` are `font-style: italic`).

### Resolved in 3.1

The package names are a trap in one more place than expected. **`@fontsource/geist-sans`
declares the family as `"Geist Sans"`** — it is the obvious-looking package and it is
wrong; it would have missed `--font-geist: "Geist"` and dropped the entire UI typeface to
`system-ui`. The correct package is **`@fontsource/geist`**. Always read `metadata.json`'s
`family` field rather than inferring from the package name.

Verified by `scripts/check-fonts.mjs`, which renders a probe element per weight/style in
each role's real font stack and asks Chrome which font it actually picked (CDP
`CSS.getPlatformFontsForNode` — DevTools' "Rendered Fonts" panel). Checking the resolved
`--font-*` value is **not** sufficient: `"Geist Sans"` contains `"Geist"`, so a substring
comparison passes while nothing renders. Neither is `document.fonts.check()`, which
interrogates the `@font-face` rules independently of whether any variable points at them.

```bash
node scripts/check-fonts.mjs http://localhost:3100/   # Next baseline: 25/25
node scripts/check-fonts.mjs http://localhost:3001/   # Start dev:     25/25
node scripts/check-fonts.mjs http://localhost:3002/   # Nitro build:   25/25
```

Chrome reports the **platform** font name, so the assertion is a prefix test: Next serves
variable fonts and reports the default instance (`"Geist"`, `"Cormorant Garamond Light"`
at every weight), while Start serves static per-weight files and reports the real weight
(`"Geist Medium"`). Same family, same rendered weight, different file organisation — the
`/privacy` and `/terms` pages come out pixel-identical in layout (same 1440×2623 height,
0.28% of pixels differing on glyph antialiasing alone).

## Auth facts (verified locally, informs R1)

- Local cookie name: **`authjs.session-token`** — unprefixed, because the dev origin is
  `http://localhost`. Production is HTTPS, so `@auth/core`'s
  `defaultCookies(useSecureCookies ?? url.protocol === 'https:')` (`lib/init.js:69`)
  makes it **`__Secure-authjs.session-token`** there.
- The JWE salt **defaults to the cookie name** (`@auth/core/jwt.js:86`) and feeds the
  HKDF info string (`jwt.js:122`). Cookie name drift ⇒ wrong key ⇒ silent `null`.
  This is why the port reads sessions through the Auth.js *session action* rather than
  hand-decoding with `getToken`.
- Token value begins `eyJhbGciOiJkaXIi` = `{"alg":"dir"` — a JWE, as expected.
- Auth.js also sets `authjs.csrf-token` and `authjs.callback-url`, both HttpOnly.
- Sign-in over plain HTTP works via `POST /api/auth/callback/credentials` with a
  `csrfToken` from `GET /api/auth/csrf` — useful for verification without a browser.

Session cookie **values** are deliberately not committed here; regenerate one with that
two-request sequence when needed.

### Resolved in 3.2 — cookie compatibility is proven, not assumed

Both stacks were run side by side (Next :3100, Start :3001) against the same local
Postgres and the same `AUTH_SECRET`, and cookies were passed between them.

| Test | Next :3100 | Start :3001 |
|---|---|---|
| Read a **Next-issued** cookie | user id `ab89c55c…` | **same user id** |
| Read a **Start-issued** cookie (minted by the `signIn` server fn) | **same user id** | same user id |
| `x-forwarded-proto: https`, unprefixed cookie | `null` | `null` |
| `x-forwarded-proto: https`, `__Secure-` name but http-derived salt | `null` | `null` |

Rows 3 and 4 are the negative controls, and they earned their keep: **row 3 failed the
first time**, on Start's `/api/auth/*` mount. `@auth/core` reads the protocol straight
off `request.url` (`lib/init.js:69`), and Next quietly rebuilds `NextRequest.url` from
the forwarded headers while Nitro passes the transport URL through untouched. So behind
a TLS-terminating proxy — i.e. in production — that route would have looked for
`authjs.session-token` while the browser held `__Secure-authjs.session-token`, reading
as signed-out on every request, and a future Google callback would have written a
non-`Secure` cookie. Fixed by rewriting the request origin in
`src/routes/api.auth.$.ts`. Nothing about a plain login test would have surfaced this;
the negative control did.

Row 4 confirms finding B empirically: the right cookie name with the wrong salt still
decrypts to nothing, because **the salt is the cookie name**.

Two further checks, run behind simulated TLS termination
(`x-forwarded-proto: https`), since that is the shape that actually ships:

- Both stacks issue `__Host-authjs.csrf-token`, `__Secure-authjs.callback-url` and
  `__Secure-authjs.session-token`, the last with `Secure`, and read it back.
- `getServerSession()` — the path every page load uses, and the one with no Next
  counterpart to compare against — resolves that production-shaped cookie, and
  resolves to `null` without the forwarded header. The negative half matters: it
  proves the protocol plumbing is live rather than passing by accident.

The strongest single piece of evidence is the JWE header. Both stacks emit
`{"alg":"dir","enc":"A256CBC-HS512","kid":"VhpO1XY3qm-qCCzXWURaN1F6FfMTvdNWyxcYCmHin-r1…"}`
— an identical `kid`, which is a thumbprint **of the derived key**. Same key material,
same salt, same HKDF. `@auth/core` is pinned to `0.41.3`, the exact version `next-auth`
resolves, so pnpm gives both stacks one physical copy of that code rather than two that
merely agree today.

Error paths were checked at the same time, and none of them mints a cookie: bad password
→ "Email or password is incorrect" (deliberately not saying which field, so the form is
not an account-enumeration oracle), duplicate email → "An account with this email already
exists", 5-character password → "Password must be at least 12 characters". Sign-out
clears the cookie and the server agrees (`session: null`).

Reproduced at the time with `scripts/check-auth-compat.mjs`. **That script has been
deleted**: it drove the Next stack on :3100 and the Start stack on :3001 and compared
them, and the Next stack no longer exists, so it could never run again. The table above
is its output and is the part worth keeping. The behaviour it proved — that the origin
rewrite in `src/routes/api.auth.$.ts` is what makes the `__Secure-` cookie name resolve
behind a TLS-terminating proxy — is now only covered by the comments in that file, so
do not remove them casually.

## Server functions (settles R8 and the superjson→Seroval question, in 3.3)

The 84 server functions were exercised from a real browser against the seeded data,
through a throwaway `/scratch-fn` route (deleted before the commit). **A browser, not a
server-side call**, because that is the only place two of these failures exist:

- **R8 — a mis-registered server-function id.** The `.fn.ts` convention exists to prevent
  it, and `vite build` passes either way; `vite dev` throws `Invalid server function ID`
  at call time. A create + delete round trip through `values.fn.ts` returned 200s, so the
  ids register.
- **Auth.** Signed out, the first call threw `UNAUTHORIZED: Not signed in` with HTTP
  **401** — the middleware, not a service, and not a 200 with an empty body.

What the run proved, and what would otherwise have been guesswork:

| Check | Result |
|---|---|
| `.default({})` validators called with **no argument** | `listPeople()` → 5, `listPeople({ includeArchived: true })` → 6 |
| A `Date` sent **in** through a GET payload (the URL) | `getWeeklyRetrospectiveData` matched the seeded row — `sync=yes` |
| `Date`s coming **back** | `weekDate` and `scheduledAt` both `instanceof Date` on the client |
| `AppError` across the wire | HTTP 404 + `parseAppError` → `{ code: 'NOT_FOUND', message: 'Value not found or access denied' }` |

The people row is the load-bearing one. The seed has exactly one archived person, so 5-vs-6
is the difference between the default being applied and being silently dropped — and a
dropped default reads as a working list, just with an archived person in it.

Two things the run corrected:

- **`getPerson` with a bogus id does not throw** — it returns `null`, which is the
  pre-existing contract, so it is useless as an error probe. `createValueBehavior` with a
  bad `valueId` is the one that throws NOT_FOUND.
- A near-miss `weekStart` returns an **empty but valid** payload rather than an error, so
  "it didn't throw" proves nothing about date fidelity. The seeded row is at
  `2026-07-27T03:00:00Z` (local midnight Monday), and matching it exactly is the assertion.

Client bundle after `pnpm build:start`: no `drizzle-orm`, `@auth/core`, `bcryptjs` or
`postgres`, no `AUTH_SECRET`/`DATABASE_URL`, and no service-layer strings.

## Screenshots — `screens/`

29 full-page images: 12 app tabs × light/dark, plus the 5 public pages
(`landing`, `login`, `register`, `privacy`, `terms`). Captured against the dataset from
`scripts/seed-dev-data.ts`, so every tab shows populated UI rather than an empty state.

Regenerate the "after" side and diff:

```bash
env -u DATABASE_URL npx tsx scripts/seed-dev-data.ts   # same deterministic dataset
scripts/capture-screens.sh /tmp/after 3100
for f in .golden/screens/*.png; do
  cmp -s "$f" "/tmp/after/$(basename "$f")" || echo "CHANGED: $(basename "$f")"
done
```

Expect *some* pixel drift — font rasterisation after the `@fontsource` swap, and
anti-aliasing on the React Flow canvas. Judge the images, don't trust `cmp` alone; it's
a "look at this one" signal, not a pass/fail gate.

**The stable floor is 27/29.** `objectives-light` and `objectives-dark` always differ:
React Flow animates its dashed edges, so the dash phase is wherever it happened to be
when the shot was taken. Any *other* file changing is worth opening. If a third file
shows up, look at it before assuming it's noise.

Pulse used to be a third permanent false positive. The seed anchored its relative dates
to `Date.now()`, so re-seeding shifted every "in N days" label. The anchor is now rounded
down to local midnight, which makes same-day re-seeds byte-identical while still letting
the horizon buckets track real time across days. Two consequences worth knowing:

- **Re-seeding on a later day legitimately changes the Pulse images.** Re-capture the
  baseline (`scripts/capture-screens.sh .golden/screens 3100`) when that happens, rather
  than reading the diff as a regression.
- Pulse's greeting is clock-based (`Good morning` / `afternoon` / `evening`), so a
  baseline captured in the morning won't match an afternoon run. That one is inherent;
  ignore it, or re-capture in the same half of the day.

**Browser: Chromium, not Chrome.** `npx playwright install chrome` needs sudo and
fails here; `chromium` is installed and is equivalent for before/after comparison as
long as both runs use it. `scripts/capture-screens.sh` pins `--browser chromium` so
this can't drift between runs.

Theme comes from the `anansi:theme` localStorage key injected via Playwright's
storage state — **not** `--color-scheme`. The app toggles a `[data-theme]` attribute
and uses zero Tailwind `dark:` variants, so the media query would have no effect.

## What the seed deliberately exercises

Written so each tab has something real to render, and so the edge cases that break in
refactors are present: goal importance across all three bands (Low ≤33.3 / Medium /
High ≥66.6) via the connection weights; a cross-link so the graph isn't a pure tree and
the progress DFS's cycle guard is exercised; tasks in **every** horizon bucket (past,
month, quarter, year, later, and `scheduledAt IS NULL` backlog); people in all four
board categories plus one archived (so archived-exclusion is visible — People reads 5,
not 6); groups tagging **both** people and tasks, the cross-entity property; an overdue
next bid, a completed one, and one with no due date; an important date inside Pulse's
30-day window with a `year` so the "turning N" math shows; two unscoped tracking items
and one archived; a weekly sync with one **deliberately blank** item so the header
reads `4/5 filled`; and Self list items across all 8 `kind`s including all 5
`patternCategory` values.

## Remaining gap

No production cookie/secret capture — dropped per the decision that a single re-login
is acceptable, which downgrades R1 from a deploy gate to a low risk.

## Local dev setup that produced this

```bash
docker run -d --name anansi-pg -e POSTGRES_USER=anansi -e POSTGRES_PASSWORD=anansi \
  -e POSTGRES_DB=anansi -p 5432:5432 -v anansi-pgdata:/var/lib/postgresql/data postgres:17
# DATABASE_URL=postgresql://anansi:anansi@localhost:5432/anansi   (in .env)
```

**Gotcha:** a stale `DATABASE_URL` is exported in the ambient shell environment, and
`dotenv` does not override already-set vars — so `npm run db:migrate` and `next dev`
both silently kept hitting the dead Supabase host. Prefix commands with
`env -u DATABASE_URL` so `.env` wins. `drizzle-kit migrate` also exits 1 while
swallowing the underlying error, which made this hard to see; the drizzle-orm migrator
(the code path `start.mjs` uses) reports it properly.

---

## The cutover (3.4 + 3.5): what the browser found that the build did not

Every check below ran against `pnpm dev` (Vite), signed in as the test user. That
matters: **`vite build` passed cleanly through two of the three defects here.** A green
build is not evidence that this app runs.

| Check | Result |
|---|---|
| 14 URLs hard-reloaded (12 tabs + `/app` + an unknown slug) | 200 each, sidebar present, zero console errors |
| 10 tabs reached by **client-side** navigation | no `Invalid server function ID` — settles R8 for the read path |
| 6 writes through the UI (values, groups, bucket list, tracking items, self items, task deep-link) | all persisted; 21 server-fn calls, zero 5xx |
| `/app` signed out | **307 to `/login?next=%2Fapp` in the HTTP response** — the client-side auth flash is gone |
| `.well-known/oauth-authorization-server`, `.well-known/oauth-protected-resource`, `POST /api/mcp` 401 body | byte-identical to the Phase 0 capture, modulo origin |
| `/oauth/register` | 201, then **429 after 5** — rate limit intact |
| `/oauth/authorize` with no session | 307 to `/login?next=<the full authorize url>` |
| `/oauth/authorize` with an unknown client | **200 inline error, no redirect** — the open-redirect guard holds |

### Three defects, all invisible to `vite build`

**1. `import "server-only"` (R2, predicted).** 13 files under `src/lib/mcp/`. The build
tolerated it; `vite dev` returned **500 on every single request** —
`"This module cannot be imported from a Client Component module"`, thrown on the server
it was meant to protect. Its package exports map the `react-server` condition to an
empty module and everything else to a bare `throw`, and Vite's SSR pass does not apply
that condition. Replaced by a `no-restricted-imports` rule in `eslint.config.mjs`.

**2. dnd-kit hydration mismatch (R9-class, not predicted).** `<DndContext>` derives
`aria-describedby="DndDescribedBy-N"` from a **module-level counter**. A long-lived
server process and a fresh browser tab do not agree on `N`, so React reported a
mismatch on every draggable card on `/app/relationships`. Never visible under Next
because that board was never server-rendered. Fixed with an explicit `id` on all three
`DndContext` instances.

**3. A generic helper silently erased every search param.** Wrapping zod in a
`tolerantSearch<T extends z.ZodType>(...)` helper made TanStack's
`ResolveSearchValidatorInputFn` fall through to `AnySchema` (`{}`), so `useSearch()` and
every `navigate()` to those routes lost their params. The error surfaces at the
*navigation site*, not at the route that broke it. Two contributing causes, and the
second is the one that matters: zod's `.catch()` makes the schema input `unknown`
(which alone breaks it), and a route file that both defines a validator and calls
`Route.useSearch()` is circular with `routeTree.gen.ts` — TypeScript resolves that for
an **inline function literal** but bails for a **generic call expression**. All five
search validators are now hand-written inline functions, which is also tolerant for
free.

## The flip (3.6)

Next, tRPC, superjson, `server-only`, `eslint-config-next` and Tailwind v3 are
uninstalled. The app builds and runs on Vite + Nitro alone, and the image is deployable.

| Check | Result |
|---|---|
| `pnpm format` / `lint` / `typecheck` / `build` | clean; zero warnings |
| 29 screenshots vs the Phase 0 Next baseline | **27 at ≤0.82% of pixels differing**; `objectives-*` at ~5.5% (the documented React Flow dash-phase false positive). Every image identical in dimensions, including the 7837px landing page. |
| `.output/public/` grep for `drizzle-orm\|@auth/core\|bcryptjs\|postgres` | empty |
| `.output/public/` grep for the build-time env placeholders | empty |
| 6 security headers on `/`, `/login`, `/api/healthz`, `POST /api/mcp`, a 404, a 307 | 6/6 each |
| 6 security headers on real `_serverFn` responses (browser, client-side nav) | 6/6 each |
| MCP 401 body + `WWW-Authenticate` | byte-identical to `mcp-401.txt` modulo origin |
| both `.well-known` docs **from inside the container** | identical modulo origin |
| `/oauth/register` ×7 | 201 ×5 then **429** |
| container: `/api/healthz`, `/login`, `/app` signed out, `icon.png`, `apple-icon.png` | `{"status":"ok"}`, 200, **307 → `/login?next=%2Fapp`**, 200 (70 KB), 200 (8 KB) |
| container `HEALTHCHECK` | `healthy`, failing streak 0 |
| container user | `uid=1001(anansi)` — non-root |
| `MIGRATE_ONLY=1` | exit 0, no listener |
| missing `DATABASE_URL` / `AUTH_SECRET` | exit 1 each, before any connection |

### Tailwind v4: what actually changed

The catastrophic failure mode (`@source` omitted → the utility layer silently empties
while the build still passes) did not happen; the emitted CSS is 63 KB and contains
`xl:grid-cols-4`, `line-clamp-2`, `md:px-12` and friends, all of which exist only in
`src/components` and `src/routes`. But four real behaviour changes were found by
grepping the **built** stylesheet rather than by reading the upgrade guide:

- **`flex-shrink-0` emits nothing in v4.** Not renamed-with-an-alias — absent. Three
  call sites were silently dead until renamed to `shrink-0`.
- **`backdrop-blur-sm` is 8px in v4, 4px in v3.** The whole `-sm`/`-xs` scale shifted, so
  the old name keeps working and quietly doubles. Three modals; renamed to
  `backdrop-blur-xs`.
- **v4's preflight dropped `button { cursor: pointer }`.** 164 buttons, 8 with an
  explicit `cursor-pointer` — so ~156 buttons would have stopped looking clickable.
  Restored in `@layer base`.
- **`::placeholder` went from gray-400 to `currentColor` at 50%.** 55 placeholders, 19
  with an explicit colour. Set once to `--ink-4`, which is what the token ladder has
  always said placeholders should be — so this ends up more consistent than v3 was.

`outline-none` (33 sites) was renamed to `outline-hidden`: v4 redefined `outline-none`
as `outline-style: none`, and `outline-hidden` is the spelling that preserves v3's
transparent-outline behaviour, which is the one that keeps focus visible in
forced-colors mode.

Also verified: bare `border` in v4 inherits `currentColor` where v3 defaulted to
gray-200. 11 className strings use a border width with no static colour — **all 11 supply
it through an interpolated expression**, so nothing regressed. Worth re-checking if
someone adds a plain `border` later.

### One defect found, in the supply chain rather than the code

Restoring `minimumReleaseAge` after the dependency swap failed:
`enhanced-resolve@5.24.4` (a transitive dep of `@tailwindcss/vite`, published 3 days
earlier) was inside the cooldown window. **The pre-existing comment in
`pnpm-workspace.yaml` claimed `--frozen-lockfile` was unaffected by the policy — that is
wrong.** pnpm 11 re-verifies every lockfile entry on every install, so this would have
broken CI and the Docker build on the first run after merge, with an error naming a
package nobody chose. Fixed with an `overrides:` pin to 5.24.3, and the comment now
describes both enforcement points. Note the ordering trap: the policy check runs
*before* resolution, so adding the pin needs one install with the cooldown commented out
before it can take effect.

## The end-to-end MCP + OAuth run

The one gate the migration plan named that a build, a curl sweep and a browser sweep
all *cannot* reach: an actual OAuth 2.1 client walking DCR → consent → PKCE code →
token → tool calls. It was left until last, and it is the step that found the worst
defect of the whole migration.

`.golden/verify-mcp-tools.sh <token> 5173` → **OK: 51 tools, identical to golden.**
Zero drift after the entire dispatch layer moved from tRPC's `createCaller` to direct
in-process service calls. (That script has since been replaced by
`pnpm check:mcp-tools` — see below.)

Results, all green: 19 OAuth checks (DCR public-client shape, consent screen contents,
cross-origin decision POST → 403, approve → 303, PKCE S256 enforced, prior consent
auto-approving on the second round, 1h access token, rotating refresh, single-use
codes) and 46 MCP checks (one read + one write across all 10 domains, the
`create_person` URL-emoji gate that exists only at the MCP layer, `_meta.trpc_code`
still exactly `NOT_FOUND`, refresh rotation invalidating the prior access token,
revoke → 401).

### The defect: `Response.redirect()` headers are immutable

**Every OAuth consent decision 500'd** — approve, deny, and the no-session bounce, i.e.
the whole path by which any MCP client obtains a token. The app was, in the state
committed as "phase 3.6 complete", impossible to connect a client to.

The cause was in the security-headers work from that same commit. `Response.redirect()`
returns a response whose headers guard is **immutable** per spec, so `headers.set()` on
one throws `TypeError: immutable`. Since the headers are applied by *global* request
middleware, that TypeError became a 500 on three routes that were themselves correct.

What makes it worth recording is the shape of its hiding place. It survived
`pnpm build`, `pnpm lint`, `pnpm typecheck`, a 29-screenshot visual diff, a 14-URL tab
sweep, a 21-call server-fn write sweep, and an explicit "are the 6 headers present?"
check run against pages, server routes, redirects, 404s and `_serverFn` responses in
both dev and the container. **All of those passed because none of them hit a route that
builds its response with `Response.redirect()`** — the three that do are all in
`oauth.authorize.decision.ts`, reachable only by completing a consent form. The header
check even covered "redirects", but those were router redirects, which Start builds
itself with mutable headers. Close enough to look covered; not the same code path.

Fixed at the middleware layer rather than at the three call sites, because the property
belongs to the middleware: `applySecurityHeaders` now returns the response, mutating in
place when it can and rebuilding it when the guard forbids that. A response returned
straight from `fetch()` carries the same immutable guard, so a future proxy route would
otherwise have rediscovered this the same expensive way. The rebuilt 303 is asserted to
carry both its `Location` and all 6 headers.

### Two expectations in the plan that were wrong about the app

Both were checked against pre-migration git history rather than "fixed", and both turned
out to be behaviour the migration had preserved exactly:

- **`get_person` with a bogus id returns `null`, it does not throw `NOT_FOUND`.** The
  original router had `if (!row) return null`. The plan's error-path check was pointed
  at the wrong tool; `add_value_behavior` with a bad `valueId` is the one that throws.
  Both are now asserted, so a future "helpful" change to make `get_person` throw shows
  up as the wire-contract break it would be.
- **`delete_goal` is a soft archive.** It flips `status` to `archived`, hard-deletes
  connections and archives tracking items. The row survives and reads filter it out.
  Identical to the original tRPC procedure. CLAUDE.md's `goals` table entry had omitted
  the `status` column entirely, which is what made the leftover rows look like a bug;
  fixed there.

A third finding that is purely a property of the server, worth stating because it looks
like a failure the first time you hit it: **a failed PKCE verification burns the auth
code.** `consumeAuthCode` consumes atomically *before* checking the challenge, which is
what denies an attacker a brute-force window against a live code. A test that probes a
wrong verifier therefore needs its own authorization round.

---

## The catalog gate today: `pnpm check:mcp-tools`

`verify-mcp-tools.sh` is gone. It asserted the right thing but cost too much to run:
it curled a live server with a bearer token, so exercising the invariant meant booting
the app, having a database, registering an OAuth client and completing a browser
consent flow. CLAUDE.md said the diff "must be exactly zero after any change here" and
nothing enforced it, which made it a comment rather than a gate.

`scripts/check-mcp-tools.ts` replaces it and runs in CI on every PR. The catalog is a
pure function of tool *registration* — handlers close over the `McpCtx`, but titles,
descriptions and `inputSchema`s do not — so it builds the server with a fake user id
and drives a real `Client` over `InMemoryTransport`. No server, no database, no token.

It goes through a real client rather than reading the registry because the interesting
part is exactly what the SDK does on the way out: converting each Zod raw shape into
JSON Schema. Reaching into internals would skip the conversion and check nothing that
matters — as the zod 4 bump proved.

The live HTTP path (bearer auth, transport, real tool calls verified against the
database) is covered by `scripts/mcp-smoke.sh`, which is where it belongs.

To re-baseline deliberately: `pnpm check:mcp-tools --update`. It never self-updates on
failure; an oracle that rewrites itself asserts nothing.

## Re-baselined once, for zod 4

The zod 3 → 4 upgrade changed the emitted JSON Schema. Two of the changes were defects
and were fixed in the source; the rest were cosmetic and the baseline moved.

**Fixed, not accepted:**

- **`z.coerce.date()` throws.** Zod 3 quietly rendered it as
  `{ type: 'string', format: 'date-time' }`; zod 4 refuses with *"Date cannot be
  represented in JSON Schema"* — thrown from inside `tools/list`, so the entire catalog
  500s and every connected client loses all 51 tools at once. `tsc` and `vite build`
  both pass. Fixed by `isoDate` in `src/lib/mcp/tools/fields.ts`: a plain string
  carrying `.meta({ format: 'date-time' })`, which reproduces the old output exactly.
  Coercion still happens one layer down, where every handler re-parses `args` with the
  canonical schema from `~/lib/api/types`.
- **`additionalProperties: false` vanished from 44 of 51 tools.** Zod 3 rendered
  `z.object()` closed; zod 4 renders it as nothing. That keyword is what tells a model
  not to invent parameters, and some providers require it for strict tool calling.
  Fixed by `toolInput()` / `closedObject()` in the same file. Note these use
  `.meta({ additionalProperties: false })` and **not** `z.strictObject()`: strict also
  emits the keyword, but it changes runtime behaviour from *stripping* unknown keys to
  *rejecting* them, so a model that tacked on one stray field would go from a
  successful call to a failed one.

**Accepted, and the reason the file moved.** Twenty properties changed representation
without changing meaning. Fighting these would mean writing worse zod — avoiding
`z.number().int()`, hand-overriding metadata — to satisfy a snapshot:

| n | change | equivalent? |
|---|---|---|
| 13 | `.nullable()`: `{"type":["string","null"]}` → `{"anyOf":[{"type":"string"},{"type":"null"}]}` | yes, identical JSON Schema semantics |
| 5 | `z.number().int()`: bare `{"type":"integer"}` → adds safe-integer `minimum`/`maximum` | yes, and strictly more accurate about what zod validates |
| 2 | literal union: `{"enum":[1,2,3]}` → `{"anyOf":[{"const":1},…]}` | yes |

What was verified to be unchanged before re-baselining, and what the check still
guards: **51 tools, identical names, zero drift in titles, descriptions, annotations,
`required` arrays, or property key sets.**
