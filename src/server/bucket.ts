import { memoryObjectStore, objectStoreFromEnv, type ObjectStore } from './object-store'

// Anansi's bucket: the bytes of every uploaded file (services/files.ts says
// what goes in it). ./object-store is the fleet's canonical S3 module, a
// verbatim copy: change it in daedalus and copy it in again, never here.
//
// The platform injects the five S3_* variables when Object storage is on.
// They are read from process.env here, not declared in ~/lib/env:
// `objectStoreFromEnv` checks them itself (all five or none, and a partial set
// throws naming the missing ones).

const globalForBucket = globalThis as unknown as { anansiBucket?: ObjectStore }

/**
 * The bucket the platform injected, or an in-memory store when there is none
 * (`pnpm dev`, the tests).
 *
 * ⚠ The production refusal is start.mjs's, not this function's: the image's
 * only entry point refuses to boot without the five S3_* variables, so a
 * deployed server never reaches the memory store. It is deliberately not keyed
 * on NODE_ENV here — the box runs `pnpm run ci` inside the image, after the
 * build, with NODE_ENV=production and no bucket, and the tests must pass there.
 *
 * Cached on globalThis for the same reason as the database client: vite dev's
 * HMR re-evaluates this module, and a fresh memory store per edit would forget
 * every file uploaded so far.
 */
export function bucket(): ObjectStore {
  if (globalForBucket.anansiBucket) return globalForBucket.anansiBucket
  const store = objectStoreFromEnv(process.env) ?? memoryObjectStore()
  globalForBucket.anansiBucket = store
  return store
}
