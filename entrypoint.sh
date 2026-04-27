#!/bin/sh
# Container boot: apply pending migrations, then exec the Next server as PID 1.
# - `set -eu` so any failure (or undefined var) kills the script before we try
#   to start the app on a half-migrated DB.
# - ERR trap prints which line died so the container logs are useful.
# - `exec` hands the process group to node, which means SIGTERM from Docker
#   reaches Next directly and graceful shutdown actually works.
set -eu
trap 'echo "[entrypoint] failed at line ${LINENO}" >&2' ERR

echo "[entrypoint] applying database migrations…"
npx drizzle-kit migrate

echo "[entrypoint] starting application…"
exec node server.js
