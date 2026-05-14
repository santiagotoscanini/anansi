import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role Supabase client. Bypasses RLS — only ever construct from a
// trusted server context (tRPC procedure, route handler) AFTER you've
// verified the caller via `supabase.auth.getUser()` and you control the
// storage path being written.
//
// Why we need this rather than the cookie-bound `@supabase/ssr` client:
// Supabase Storage doesn't propagate the user's session JWT claims into
// the Postgres RLS evaluator on projects using the new `sb_publishable_…`
// asymmetric-JWT scheme. The session client carries a valid JWT, but
// `auth.uid()` evaluates as null inside the storage.objects policy and
// every owner-folder check fails. The bug is on Supabase's side; until
// it's fixed, server-side storage ops have to use the service role.
//
// Security model: identical to the rest of the app. Drizzle already
// connects to Postgres as the `postgres` role and ownership is enforced
// at the tRPC layer (`WHERE user_id = ctx.user.userId`). Storage ops
// follow the same shape — the path always starts with a server-verified
// `ctx.user.userId`, so a forged path can't reach another user's folder.
// The RLS policies on storage.objects remain in place as defense-in-depth
// for any session-client caller that comes along later.
export function createServiceRoleClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
