import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "~/lib/supabase/server";

// Handles email-link callbacks for: signup confirmation, password recovery,
// and email-change confirmation. Each case sets `type` in the URL according
// to Supabase's email template tokens.
//
// Recovery: after verifyOtp({ type: 'recovery' }) succeeds, the user is
// authenticated (Supabase establishes a session from the OTP). We redirect
// to /reset-password where the client uses the live session to call
// supabase.auth.updateUser({ password }).
// Whitelist of types we accept on this route. Keeps the route from
// forwarding arbitrary user-supplied strings to Supabase and pins us to
// the link types our email templates actually issue.
const VALID_TYPES = ["signup", "recovery", "email_change", "magiclink", "invite", "email"] as const;
type ValidType = (typeof VALID_TYPES)[number];
function isValidType(t: string | null): t is ValidType {
  return t !== null && (VALID_TYPES as readonly string[]).includes(t);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const typeParam = searchParams.get("type");
  const rawNext = searchParams.get("next") ?? "/app";
  const next = rawNext.startsWith("/") ? rawNext : "/app";

  if (!token_hash || !isValidType(typeParam)) {
    return NextResponse.redirect(`${origin}/login?error=otp_missing`);
  }
  const type: EmailOtpType = typeParam;

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });

  if (error) {
    console.error("[/auth/confirm] verifyOtp failed:", error.message);
    return NextResponse.redirect(`${origin}/login?error=otp_invalid`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
