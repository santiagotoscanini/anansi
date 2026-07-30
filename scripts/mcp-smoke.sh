#!/usr/bin/env bash
# End-to-end MCP smoke test: one read + create/update/delete per domain, with
# every mutation verified against the database rather than trusting the tool's
# own success message.
#
# This script exists because three ad-hoc versions of it reported success while
# doing nothing. Each trap is easy to re-introduce, so they are written down:
#
#   1. zsh does NOT word-split unquoted parameter expansions the way bash does.
#      Building "tool {json}" strings and splitting with `set -- $c` silently
#      passes the entire string as the tool name. Tools here are always invoked
#      with separate explicit arguments.
#   2. A JSON-RPC level failure has no `.result` at all, so a check written as
#      `if .result.isError` reads null and reports success. `run` treats
#      anything that is not an explicit non-error result as a failure.
#   3. `FAILED=1` inside `$(command substitution)` runs in a SUBSHELL and never
#      reaches the parent, so the script prints FAIL and exits 0. The failure
#      count therefore lives in a temp file, not a variable.
#   4. A helper that prints status to stdout pollutes the value its caller is
#      capturing. All human-readable output here goes to stderr; stdout carries
#      only the tool's JSON payload.
#   5. `{"a":"1","b":"2"}` written inline is BRACE EXPANSION, not a JSON literal:
#      bash expands `{A,B}` into two separate words, so the tool silently
#      receives fragments. Every argument payload below is therefore built with
#      `jq -n`, which also guarantees the JSON is well-formed and correctly
#      escaped. Never inline a brace-and-comma payload here.
#
# Usage: scripts/mcp-smoke.sh <bearer-token> [port]
set -uo pipefail

TOKEN="${1:?usage: mcp-smoke.sh <bearer-token> [port]}"
PORT="${2:-3000}"
URL="http://localhost:${PORT}/api/mcp"
FAILFILE=$(mktemp)
trap 'rm -f "$FAILFILE"' EXIT

# Runs a tool. stdout: the JSON payload (or "null"). stderr: the status line.
run() {
  local tool="$1" args="$2" response verdict
  response=$(curl -s -X POST "$URL" \
    -H "authorization: Bearer ${TOKEN}" \
    -H 'content-type: application/json' \
    -H 'accept: application/json, text/event-stream' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"${tool}\",\"arguments\":${args}}}")

  verdict=$(jq -r '
    if .error then "ERR rpc: " + (.error.message // "unknown")
    elif .result == null then "ERR no result field"
    elif .result.isError then "ERR tool: " + (.result.content[0].text // "")
    else "OK" end' <<<"$response" 2>/dev/null || echo "ERR unparseable response")

  if [ "$verdict" = "OK" ]; then
    printf '  %-26s ok\n' "$tool" >&2
    jq -r '.result.content[0].text' <<<"$response"
  else
    printf '  %-26s FAIL  %s\n' "$tool" "${verdict:0:70}" >&2
    echo x >>"$FAILFILE"
    echo "null"
  fi
}

# Extracts .id from a payload, flagging a failure if it isn't there.
idof() {
  local id
  id=$(jq -r '.id // empty' <<<"$1" 2>/dev/null)
  if [ -z "$id" ]; then
    echo "    (no id in payload)" >&2
    echo x >>"$FAILFILE"
    echo "MISSING-ID"
  else
    echo "$id"
  fi
}

check() { # check <label> <actual> <expected>
  if [ "$2" = "$3" ]; then
    printf '  %-26s ok\n' "$1" >&2
  else
    printf '  %-26s FAIL  expected %s, got %s\n' "$1" "$3" "$2" >&2
    echo x >>"$FAILFILE"
  fi
}

sql() { docker exec anansi-pg psql -U anansi -d anansi -tAc "$1" 2>/dev/null | tr -d '[:space:]'; }

# Builds a JSON object from key=value pairs. Values are passed to jq as named
# args so quoting and escaping are jq's problem, not the shell's. A `:=` key
# emits a raw JSON value (number, boolean, null, nested object) instead of a
# string.
j() {
  local filter="{}" i=0 pair key val
  local -a jqargs=()
  for pair in "$@"; do
    key="${pair%%=*}"; val="${pair#*=}"; i=$((i + 1))
    if [[ "$key" == *: ]]; then
      key="${key%:}"
      jqargs+=(--argjson "v$i" "$val")
    else
      jqargs+=(--arg "v$i" "$val")
    fi
    filter="$filter + {\"$key\": \$v$i}"
  done
  jq -nc "${jqargs[@]}" "$filter"
}

echo "== reads ==" >&2
for t in whoami list_goals list_values list_people list_groups list_bucket_list list_self_items list_important_dates; do
  run "$t" '{}' >/dev/null
done

echo "== values ==" >&2
V=$(idof "$(run create_value "$(j name='smoke value' color='#123456')")")
run update_value "$(j id="$V" name='smoke value v2')" >/dev/null
check "update landed in DB" "$(sql "select name from values where id='$V'")" "smokevaluev2"
VB=$(idof "$(run add_value_behavior "$(j valueId="$V" content='smoke behavior')")")
run delete_value_behavior "$(j id="$VB")" >/dev/null
run delete_value "$(j id="$V")" >/dev/null
check "value gone from DB" "$(sql "select count(*) from values where id='$V'")" "0"

echo "== goals + tasks ==" >&2
G=$(idof "$(run create_goal "$(j title='smoke goal' description=d 'position:={"x":1,"y":1}')")")
run update_goal "$(j id="$G" title='smoke goal v2')" >/dev/null
# No referentIds / groupIds / completed passed: this exercises the zod defaults
# the tool's deliberately-looser inputSchema omits. If they stop being applied
# the row comes out malformed, which is exactly what this asserts.
T=$(idof "$(run create_task "$(j goalId="$G" title='smoke task' difficulty:=2)")")
check "task defaults applied" "$(sql "select completed||'/'||difficulty from tasks where id='$T'")" "false/2"
run set_task_scheduled "$(j id="$T" scheduledAt=2026-12-01T00:00:00Z)" >/dev/null
check "scheduledAt persisted" "$(sql "select count(*) from tasks where id='$T' and scheduled_at is not null")" "1"
run update_task "$(j id="$T" goalId="$G" completed:=true)" >/dev/null
run delete_task "$(j id="$T" goalId="$G")" >/dev/null
check "task gone from DB" "$(sql "select count(*) from tasks where id='$T'")" "0"
run delete_goal "$(j id="$G")" >/dev/null
check "goal archived not deleted" "$(sql "select status from goals where id='$G'")" "archived"

echo "== people, bids, dates ==" >&2
P=$(idof "$(run create_person "$(j name='Smoke Person' category=exploring)")")
check "person defaults applied" "$(sql "select board_order from people where id='$P'")" "0"
run update_person "$(j id="$P" appreciation=noted)" >/dev/null
run set_person_category "$(j id="$P" category=long_term)" >/dev/null
check "category persisted" "$(sql "select category from people where id='$P'")" "long_term"
NB=$(idof "$(run create_next_bid "$(j personId="$P" content='smoke bid')")")
run set_next_bid_done "$(j id="$NB" completed:=true)" >/dev/null
check "bid completed" "$(sql "select count(*) from next_bids where id='$NB' and completed_at is not null")" "1"
run delete_next_bid "$(j id="$NB")" >/dev/null
D=$(idof "$(run create_important_date "$(j personId="$P" label='smoke date' month:=6 day:=6)")")
run update_important_date "$(j id="$D" day:=7)" >/dev/null
check "date updated" "$(sql "select day from important_dates where id='$D'")" "7"
run delete_important_date "$(j id="$D")" >/dev/null
run archive_person "$(j id="$P")" >/dev/null
check "person archived" "$(sql "select count(*) from people where id='$P' and archived_at is not null")" "1"

echo "== groups, bucket list, self ==" >&2
GR=$(idof "$(run create_group "$(j name='smoke group' color='#654321')")")
check "group defaults applied" "$(sql "select order_idx from person_groups where id='$GR'")" "0"
run list_group_tasks "$(j groupId="$GR")" >/dev/null
run delete_group "$(j id="$GR")" >/dev/null
BL=$(idof "$(run create_bucket_list_item "$(j content='smoke item')")")
run toggle_bucket_list_done "$(j id="$BL" completed:=true)" >/dev/null
check "bucket item completed" "$(sql "select count(*) from bucket_list_items where id='$BL' and completed_at is not null")" "1"
run delete_bucket_list_item "$(j id="$BL")" >/dev/null
SI=$(idof "$(run create_self_item "$(j kind=energizer content='smoke energizer')")")
run update_self_item "$(j id="$SI" content='smoke energizer v2')" >/dev/null
run delete_self_item "$(j id="$SI")" >/dev/null
check "self item gone" "$(sql "select count(*) from self_list_items where id='$SI'")" "0"

echo "== error taxonomy ==" >&2
code=$(curl -s -X POST "$URL" -H "authorization: Bearer ${TOKEN}" \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_next_bid","arguments":{"personId":"nope","content":"x"}}}' |
  jq -r '.result._meta.trpc_code // "MISSING"')
check "bogus id → NOT_FOUND" "$code" "NOT_FOUND"

echo "== cleanup ==" >&2
sql "delete from goals where title like 'smoke %'; delete from people where name like 'Smoke %';" >/dev/null
check "no residue" "$(sql "select (select count(*) from goals where title like 'smoke %') + (select count(*) from people where name like 'Smoke %')")" "0"

COUNT=$(wc -l <"$FAILFILE" | tr -d ' ')
if [ "$COUNT" -eq 0 ]; then
  echo "MCP smoke: PASS" >&2
  exit 0
fi
echo "MCP smoke: FAIL ($COUNT check(s))" >&2
exit 1
