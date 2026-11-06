import { memoryObjectStore, objectStoreFromEnv, type ObjectStore } from './object-store'

// Anansi's bucket: the bytes of every uploaded file (services/files.ts says
// what goes in it). ./object-store is the fleet's canonical S3 module, a
// verbatim copy: change it in daedalus and copy it in again, never here.
//
// The platform injects the five S3_* variables when Object storage is on.
// They are read from process.env here, not declared in ~/lib/env:
// `objectStoreFromEnv` checks them itself (all five or none, and a partial set
// throws naming the missing ones), and scripts/migrate-bytea-to-s3.ts builds
// its store the same way without importing the env schema.

const globalForBucket = globalThis as unknown as { anansiBucket?: ObjectStore }

/**
 * The bucket the platform injected, or an in-memory store in dev and tests.
 *
 * ⚠ NO FALLBACK IN PRODUCTION. Without the S3_* variables a production build
 * throws here instead of keeping uploads in memory, where the next restart
 * would lose them. start.mjs refuses to boot without them first, so this is
 * the second line, not the first.
 *
 * Cached on globalThis for the same reason as the database client: vite dev's
 * HMR re-evaluates this module, and a fresh memory store per edit would forget
 * every file uploaded so far.
 */
export function bucket(): ObjectStore {
  if (globalForBucket.anansiBucket) return globalForBucket.anansiBucket
  const fromEnv = objectStoreFromEnv(process.env)
  if (!fromEnv && process.env.NODE_ENV === 'production') {
    throw new Error('object storage is not configured: the S3_* variables are unset')
  }
  const store = fromEnv ?? memoryObjectStore()
  globalForBucket.anansiBucket = store
  return store
}
