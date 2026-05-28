import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server-side Supabase client. Reads/writes cookies via Next's request-scoped
// `cookies()` store. The `setAll` write is wrapped in try/catch because
// server components are disallowed from mutating cookies — that's expected;
// the project's `middleware.ts` is the authoritative writer of refreshed
// tokens, and this client's writes from server components silently fail
// without breaking the read path.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a server component — write was a no-op. Middleware
          // will refresh on the next request boundary.
        }
      },
    },
  });
}
