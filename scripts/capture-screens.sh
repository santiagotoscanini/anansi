#!/usr/bin/env bash
# Capture every app tab in light and dark into a directory, for before/after
# visual diffing across the TanStack Start migration.
#
#   scripts/capture-screens.sh .golden/screens          # the pre-migration baseline
#   scripts/capture-screens.sh /tmp/after   3100        # after, then diff the two dirs
#
# Requires: the app running, `santi@test.local` seeded (scripts/seed-dev-data.ts),
# and Playwright's chromium (`npx playwright install chromium`). Uses chromium, not
# Chrome: installing real Chrome needs sudo, and for before/after diffing the only
# thing that matters is that both runs use the same engine.
#
# Theme is driven by the `anansi:theme` localStorage key (the app toggles a
# [data-theme] attribute; it does NOT use Tailwind's dark: variant), so each theme
# gets its own storage-state file rather than relying on --color-scheme.
set -euo pipefail

OUT="${1:?usage: capture-screens.sh <outdir> [port]}"
PORT="${2:-3100}"
BASE="http://localhost:${PORT}"
EMAIL="santi@test.local"
PASSWORD="devpassword12345"

TABS=(objectives horizons tasks pulse sync tracking-items self values progress bucket people relationships)

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

# ── sign in over plain HTTP (no browser needed) ────────────────────────────────
# Auth.js needs a CSRF token from /api/auth/csrf before the credentials callback
# will accept the POST; both cookies land in the same jar.
CSRF="$(curl -sf -c "$TMP/cj" "$BASE/api/auth/csrf" | python3 -c 'import sys,json;print(json.load(sys.stdin)["csrfToken"])')"
curl -sf -o /dev/null -b "$TMP/cj" -c "$TMP/cj" \
  -X POST "$BASE/api/auth/callback/credentials" \
  -H 'content-type: application/x-www-form-urlencoded' \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "email=$EMAIL" \
  --data-urlencode "password=$PASSWORD" \
  --data-urlencode "callbackUrl=$BASE/app"

SESSION="$(awk '$6=="authjs.session-token" {print $7}' "$TMP/cj")"
[ -n "$SESSION" ] || { echo "no session cookie — is the user seeded?" >&2; exit 1; }

# Sanity-check that the cookie actually resolves to a user before burning 24 shots.
curl -sf -b "$TMP/cj" "$BASE/api/auth/session" | grep -q '"id"' \
  || { echo "session cookie did not resolve to a user" >&2; exit 1; }

# ── one storage state per theme ────────────────────────────────────────────────
for THEME in light dark; do
  python3 - "$TMP/state-$THEME.json" "$SESSION" "$THEME" "$BASE" <<'PY'
import json, sys
out, token, theme, base = sys.argv[1:5]
json.dump({
    "cookies": [{
        "name": "authjs.session-token", "value": token,
        "domain": "localhost", "path": "/",
        "expires": -1, "httpOnly": True, "secure": False, "sameSite": "Lax",
    }],
    "origins": [{
        "origin": base,
        "localStorage": [
            {"name": "anansi:theme", "value": theme},
            {"name": "anansi:locale", "value": "en"},
        ],
    }],
}, open(out, "w"))
PY
done

# ── capture ───────────────────────────────────────────────────────────────────
echo "capturing ${#TABS[@]} tabs x 2 themes -> $OUT"
for THEME in light dark; do
  for TAB in "${TABS[@]}"; do
    # --wait-for-timeout because every tab fetches its data client-side after
    # mount; without it we screenshot loading states. Raise it if shots look bare.
    npx playwright screenshot \
      --browser chromium \
      --load-storage "$TMP/state-$THEME.json" \
      --viewport-size 1440,900 \
      --full-page \
      --wait-for-timeout 3500 \
      "$BASE/app/$TAB" "$OUT/${TAB}-${THEME}.png" >/dev/null 2>&1 \
      && echo "  ok   ${TAB}-${THEME}" \
      || echo "  FAIL ${TAB}-${THEME}"
  done
done

# Public pages too — they change in Phase 3.1, before the app shell does.
for PAGE in "" login register privacy terms; do
  NAME="${PAGE:-landing}"
  npx playwright screenshot --browser chromium --viewport-size 1440,900 --full-page \
    --wait-for-timeout 2000 "$BASE/$PAGE" "$OUT/public-${NAME}.png" >/dev/null 2>&1 \
    && echo "  ok   public-${NAME}" || echo "  FAIL public-${NAME}"
done

echo "done: $(find "$OUT" -name '*.png' | wc -l | tr -d ' ') images in $OUT"
