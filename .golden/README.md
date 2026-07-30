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

## Known gaps in this oracle

- **No screenshots.** The Supabase project referenced by the old `DATABASE_URL` was
  deleted (`XX000: tenant/user postgres.<ref> not found`), so local dev now runs against
  an empty Postgres container and screenshots would capture empty states — a weak
  regression signal. Playwright MCP additionally wants a Chrome install that isn't
  present. Consequence: **the golden `tools/list` diff, `procedures.tsv`, and
  typecheck/build carry the regression-detection weight** for Phase 3.4.
- No production cookie/secret capture — dropped per the decision that a single
  re-login is acceptable, which downgrades R1 from a deploy gate to a low risk.

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
