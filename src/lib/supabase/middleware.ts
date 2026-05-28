import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Runs on every request matched by the root `middleware.ts`. The cookie
// adapter MUST mirror the request's cookies into the same `response` object
// that we return — Supabase's getUser() will rotate tokens on refresh, and
// those refreshed cookies have to ride on the response or the next request
// will use the stale token and bounce the user to /login.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Trigger refresh if the access token has expired. Don't gate routing on
  // this — the app's auth state is owned by client-side queries (auth.me)
  // and per-route handlers. Middleware's only job is keeping cookies fresh.
  await supabase.auth.getUser();

  return response;
}
