import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import { env } from '../env'

/**
 * A single pooled client per process.
 *
 * Cached on globalThis because a dev server's HMR re-evaluates this module on
 * every edit to anything in its import graph. Without the cache each reload
 * opens a fresh pool of 10 and never closes the old one, so a long editing
 * session walks into Postgres's connection limit and the app starts failing
 * for reasons that look nothing like the edit that caused them.
 */
const globalForDb = globalThis as unknown as { anansiPg?: ReturnType<typeof postgres> }

const client =
  globalForDb.anansiPg ??
  postgres(env.DATABASE_URL, {
    max: 10, // maximum pool size
    idle_timeout: 20, // close idle connections after 20s
    connect_timeout: 10, // give up connecting after 10s
    prepare: false, // better behaviour through connection poolers
  })

if (env.NODE_ENV !== 'production') globalForDb.anansiPg = client

export const db = drizzle(client, { schema })
