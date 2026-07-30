# Phase 0 baseline oracle

Captured before the TanStack Start migration, on branch `tanstack-start-migration`.
Every later phase is diffed against these. Regenerate nothing here — if a diff appears,
the diff is the finding.

## Artifacts

| File | What it is | Used by |
|---|---|---|
| `mcp-tools.json` | `tools/list` result: all **51** tools with full `inputSchema`, sorted by name | **Phase 1c gate** — the diff after pointing MCP at services must be exactly zero. Re-checked at 3.5 and 3.6. |
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
