import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "~/lib/supabase/server";

// OAuth callback. The flow is:
//   1. Client calls supabase.auth.signInWithOAuth({ provider: 'google', ... })
//      with redirectTo = `${origin}/auth/callback?next=/app`.
//   2. Provider authenticates the user and Supabase redirects here with a
//      `code` parameter.
//   3. We swap the code for a session — Supabase writes the access/refresh
//      tokens onto the response as HttpOnly cookies via our server client's
//      cookie adapter.
//   4. Redirect to `next` (or /app as default).
//
// On any error we kick the user back to /login with an `?error=...` flag so
// the UI can surface a toast.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // `next` is opaque to us — always treat it as a relative path. If it ever
  // starts with anything other than "/" we ignore it (defence against an
  // attacker crafting an OAuth link that uses our origin as an open redirect).
  const rawNext = searchParams.get("next") ?? "/app";
  const next = rawNext.startsWith("/") ? rawNext : "/app";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=oauth_no_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[/auth/callback] exchangeCodeForSession failed:", error.message);
    return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
