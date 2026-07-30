// Container entry point. Runs at every `docker run` of the anansi image.
//
// Two phases, single Node process:
//   1. Apply outstanding Drizzle migrations against $DATABASE_URL. Idempotent —
//      Drizzle reads the `drizzle.__drizzle_migrations` ledger and skips
//      anything already applied, so re-runs are free.
//   2. import the Next standalone server (./server.js). It starts listening
//      synchronously at import time and the process stays alive serving HTTP.
//
// Doing both in one process keeps signal handling clean (SIGTERM from the
// container runtime goes to a single PID and the server shuts down cleanly).
// If migrations fail, we exit non-zero BEFORE booting the server so the
// container restarts and surfaces the failure to whoever's watching.
//
// Extending later: drop new pre-start work here (cache warmups, healthcheck
// pings, secret rotations…) above the `import("./server.js")` line.

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('[start] DATABASE_URL is not set — refusing to boot')
  process.exit(1)
}

// AUTH_SECRET signs the Auth.js JWT session cookie. next-auth v5 errors on
// the first session read without it in production; preflight here so the
// container fails fast at boot rather than on the first sign-in attempt.
if (!process.env.AUTH_SECRET) {
  console.error('[start] AUTH_SECRET is not set — refusing to boot (generate with: openssl rand -base64 32)')
  process.exit(1)
}

console.log('[start] applying migrations…')
const sql = postgres(DATABASE_URL, {
  // One-shot connection, no need for a pool. `prepare: false` keeps us
  // compatible with Supabase's transaction-mode pooler.
  max: 1,
  prepare: false,
})
try {
  await migrate(drizzle(sql), { migrationsFolder: './drizzle/migrations' })
  console.log('[start] migrations up to date')
} catch (err) {
  console.error('[start] migration failed:', err)
  process.exit(1)
} finally {
  await sql.end()
}

// MIGRATE_ONLY=1 short-circuits before the server starts. Useful as a
// systemd ExecStartPre on NixOS when you want migrations to land BEFORE the
// long-running app service comes up (so a failed migration doesn't get
// papered over by a healthy-looking server boot).
if (process.env.MIGRATE_ONLY === '1') {
  console.log('[start] MIGRATE_ONLY set — exiting before server start')
  process.exit(0)
}

console.log('[start] launching next server…')
// Next's standalone server.js starts listening on import. Awaiting the
// dynamic import keeps `start.mjs` as the single process running in the
// container — no fork, no parent/child signal forwarding shenanigans.
await import('./server.js')
