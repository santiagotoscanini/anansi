import { NextResponse, type NextRequest } from "next/server";
import { auth } from "~/lib/auth";
import { validateAuthorize, buildRedirect } from "~/lib/mcp/oauth/authorize-validation";
import { recordConsent } from "~/lib/mcp/oauth/consent";
import { mintAuthCode } from "~/lib/mcp/oauth/codes";
import { appendAudit } from "~/lib/mcp/oauth/audit";
import { resolveOrigin } from "~/lib/mcp/oauth/metadata";
import { clientIpFromHeaders } from "~/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CSRF guard: the consent POST is a same-origin form submission, so any Origin
// header other than our own means the form was posted from a third-party page.
// Browsers always send Origin on POSTs across modern engines — if absent, we
// fall back to Referer's origin.
function isSameOriginRequest(req: NextRequest): boolean {
  const expected = resolveOrigin(req);
  const origin = req.headers.get("origin");
  if (origin && origin === expected) return true;
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      const r = new URL(referer);
      return `${r.protocol}//${r.host}` === expected;
    } catch {
      return false;
    }
  }
  return false;
}

// Reads form data into a flat string map. Discards array-shaped fields — we
// never send any from ConsentScreen.
async function readForm(req: NextRequest): Promise<Record<string, string>> {
  const form = await req.formData();
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  let body: Record<string, string>;
  try {
    body = await readForm(req);
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Re-validate the exact same params the authorize page received. If the
  // user tampered with the form (or the client mutated something mid-flow),
  // bail.
  const validation = await validateAuthorize(body);
  if (!validation.ok) {
    return NextResponse.json({ error: "invalid_request", description: validation.err }, { status: 400 });
  }
  const { client, redirectUri, codeChallenge, codeChallengeMethod, scope, state } = validation.req;

  // Session check happens AFTER param validation so a missing-session error
  // doesn't reveal whether the client_id was valid.
  const session = await auth();
  const sessionUserId = session?.user?.id ?? null;
  if (!sessionUserId) {
    return NextResponse.redirect(
      `${resolveOrigin(req)}/login?next=${encodeURIComponent(`/oauth/authorize?${new URLSearchParams(body).toString()}`)}`,
      303,
    );
  }

  const decision = body.decision === "approve" ? "approve" : "deny";
  const ip = clientIpFromHeaders(req.headers);

  if (decision === "deny") {
    await appendAudit({
      event: "authorize_denied",
      userId: sessionUserId,
      clientId: client.clientId,
      ip,
      meta: { scope },
    });
    // RFC 6749 §4.1.2.1 error response on the redirect_uri.
    return NextResponse.redirect(
      buildRedirect(redirectUri, {
        error: "access_denied",
        error_description: "The user denied the authorization request",
        state,
      }),
      303,
    );
  }

  await recordConsent(sessionUserId, client.clientId, scope);
  const code = await mintAuthCode({
    clientId: client.clientId,
    userId: sessionUserId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    scope,
  });

  await appendAudit({
    event: "consent_granted",
    userId: sessionUserId,
    clientId: client.clientId,
    ip,
    meta: { scope },
  });

  // 303 See Other so the browser GETs the redirect_uri — POST→GET conversion
  // is what we want here.
  return NextResponse.redirect(buildRedirect(redirectUri, { code, state }), 303);
}
