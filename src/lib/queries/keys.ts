// Every TanStack Query key in the app, in one file.
//
// This replaces tRPC's `utils.<router>.<procedure>.invalidate()`, which derived
// keys from the procedure path so they could never be wrong. Hand-written keys
// can be, and the failure is quiet: a mutation invalidates a key nothing is
// subscribed to, the UI keeps rendering stale data, and nothing errors. Keeping
// them all here means an invalidation site is one grep from the query that
// produces it.
//
// `as const` throughout so a typo in a key is a type error at the call site
// rather than a cache miss at runtime.
export const qk = {
  /** Signed in or not. Cookie-only, so it changes only on sign-in/out. */
  session: ['session'] as const,
} as const
