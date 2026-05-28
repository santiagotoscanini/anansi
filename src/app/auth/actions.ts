"use server";

import { headers } from "next/headers";
import { createClient } from "~/lib/supabase/server";

// Server actions for every browser-initiated auth operation. Replaces the
// previous browser-side @supabase/ssr client, which required the publishable
// key to be inlined at build time as NEXT_PUBLIC_*. With auth done here, all
// Supabase credentials stay server-only and the Docker image becomes fully
// runtime-configurable.
//
// Each action returns a serializable `{ ok, error? }` shape so call sites can
// surface toasts without throwing across the server/client boundary. Cookies
// (access + refresh) are set by the @supabase/ssr server client through the
// cookie adapter in src/lib/supabase/server.ts.

type Result<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

// Build an absolute origin from the forwarded request headers so OAuth /
// email-confirmation links resolve to the same host the user is on. Mirrors
// the resolveOrigin helper in src/lib/mcp/oauth/metadata.ts.
async function resolveOrigin(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return `${proto}://${host}`;
}

export async function signInWithPasswordAction(email: string, password: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signUpAction(
  name: string,
  email: string,
  password: string,
): Promise<Result<{ needsConfirmation: boolean }>> {
  const supabase = await createClient();
  const origin = await resolveOrigin();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // `name` is read by the on_auth_user_created trigger in migration
      // 0019_supabase_auth.sql to populate public.users.name.
      data: { name },
      emailRedirectTo: `${origin}/auth/confirm?next=/app`,
    },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { needsConfirmation: !data.session } };
}

// Google / Apple — wired here so the call sites don't have to change shape
// when either provider gets enabled in the Supabase dashboard. Currently they
// short-circuit with a polite "not configured" message.
export async function signInWithGoogleAction(): Promise<Result> {
  return { ok: false, error: "Google sign-in is not configured yet." };
  // To enable, restore:
  //   const supabase = await createClient();
  //   const origin = await resolveOrigin();
  //   const { data, error } = await supabase.auth.signInWithOAuth({
  //     provider: "google",
  //     options: { redirectTo: `${origin}/auth/callback?next=/app` },
  //   });
  //   if (error) return { ok: false, error: error.message };
  //   return { ok: true, data: { url: data.url } };
}

export async function signInWithAppleAction(): Promise<Result> {
  return { ok: false, error: "Apple sign-in is not configured yet." };
}

export async function sendPasswordResetAction(email: string): Promise<Result> {
  const supabase = await createClient();
  const origin = await resolveOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password`,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signOutAction(): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Password change while logged in. We re-authenticate with the current
// password first (Supabase's updateUser doesn't ask for it natively) so a
// stolen session cookie can't rotate the password without the original
// credential — same UX guarantee the prior browser-side flow gave.
export async function changePasswordAction(currentPassword: string, newPassword: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "Not signed in." };

  const reauth = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
  if (reauth.error) return { ok: false, error: "Current password is incorrect" };

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Recovery-flow password set. The user has already clicked the email link
// (which goes through /auth/confirm → verifyOtp), so a session exists; we
// just need to update the password. No re-auth here — the link click IS the
// proof of intent.
export async function setRecoveryPasswordAction(newPassword: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Recovery session has expired. Request a new link." };

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
