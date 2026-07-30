#!/usr/bin/env bash
# The Phase 1c gate: the MCP tool catalog must not drift while dispatch moves
# from tRPC's createCaller to direct service calls.
#
# Both sides go through `jq -S .` before diffing. That is not cosmetic — it is
# what makes the gate reproducible: jq ASCII-escapes non-ASCII characters (the
# em-dashes in several tool descriptions) depending on version and flags, so a
# raw byte diff reports 6 phantom changes that are pure \uXXXX escaping. Sorting
# keys and re-emitting canonicalises both encodings.
#
# Usage: .golden/verify-mcp-tools.sh <bearer-token> [port]
set -euo pipefail

TOKEN="${1:?usage: verify-mcp-tools.sh <bearer-token> [port]}"
PORT="${2:-3000}"
GOLDEN="$(dirname "$0")/mcp-tools.json"

actual=$(
  curl -sf -X POST "http://localhost:${PORT}/api/mcp" \
    -H "authorization: Bearer ${TOKEN}" \
    -H 'content-type: application/json' \
    -H 'accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' |
    jq -S '.result.tools | sort_by(.name)'
)

count=$(jq 'length' <<<"$actual")
if [ "$count" -ne 51 ]; then
  echo "FAIL: expected 51 tools, got ${count}" >&2
  exit 1
fi

if diff <(jq -S . "$GOLDEN") <(printf '%s\n' "$actual"); then
  echo "OK: 51 tools, identical to golden"
else
  echo "FAIL: tool catalog drifted from ${GOLDEN}" >&2
  exit 1
fi
