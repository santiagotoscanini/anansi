import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkRateLimit, clientIpFromHeaders } from "~/lib/rate-limit";
import { consumeAuthCode } from "~/lib/mcp/oauth/codes";
import { getClient } from "~/lib/mcp/oauth/clients";
import { verifyPkceS256 } from "~/lib/mcp/oauth/pkce";
import { issueTokenPair, rotateRefreshToken } from "~/lib/mcp/oauth/tokens";
import { appendAudit } from "~/lib/mcp/oauth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RFC 6749 token endpoint. Public clients (PKCE) only — no client_secret.
// Two grant types: `authorization_code` and `refresh_token`. Anything else
// returns RFC 6749 `unsupported_grant_type`.

const codeGrantSchema = z.object({
  grant_type: z.literal("authorization_code"),
  code: z.string().min(1),
  code_verifier: z.string().min(43).max(128),
  redirect_uri: z.string().url(),
  client_id: z.string().min(1),
});

const refreshGrantSchema = z.object({
  grant_type: z.literal("refresh_token"),
  refresh_token: z.string().min(1),
  client_id: z.string().min(1),
});

function err(error: string, description?: string, status = 400) {
  return NextResponse.json(
    {
      error,
      ...(description ? { error_description: description } : {}),
    },
    {
      status,
      // Per RFC 6749 §5.2: token errors should not be cached.
      headers: { "cache-control": "no-store", pragma: "no-cache" },
    },
  );
}

async function readBody(req: NextRequest): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type") ?? "";
  const out: Record<string, string> = {};
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    for (const [k, v] of new URLSearchParams(text).entries()) out[k] = v;
    return out;
  }
  if (contentType.includes("application/json")) {
    const parsed: unknown = await req.json();
    if (parsed && typeof parsed === "object") {
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "string") out[k] = v;
      }
    }
    return out;
  }
  // Fall back to form-data multipart (rare for token endpoints, but harmless).
  try {
    const form = await req.formData();
    for (const [k, v] of form.entries()) {
      if (typeof v === "string") out[k] = v;
    }
  } catch {
    /* ignore */
  }
  return out;
}

export async function POST(req: NextRequest) {
  const ip = clientIpFromHeaders(req.headers);

  // Per-IP rate limit. Brute-forcing auth codes or refresh tokens is the
  // realistic attack here. 20/min is plenty for a single Claude client
  // (refreshes happen ~hourly) and tight enough to discourage scripted abuse.
  const rl = checkRateLimit("mcp_token", `ip:${ip}`, { limit: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", error_description: "too many token requests" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } },
    );
  }

  const body = await readBody(req);
  const grantType = body.grant_type;
  if (grantType !== "authorization_code" && grantType !== "refresh_token") {
    return err("unsupported_grant_type", `unsupported grant_type: ${grantType ?? "(missing)"}`);
  }

  if (grantType === "authorization_code") {
    const parsed = codeGrantSchema.safeParse(body);
    if (!parsed.success) {
      return err("invalid_request", parsed.error.issues[0]?.message);
    }
    const { code, code_verifier, redirect_uri, client_id } = parsed.data;

    // Client must exist and the redirect_uri must still match its registered
    // set — guards against a misconfigured client trying to swap callbacks
    // between authorize and token.
    const client = await getClient(client_id);
    if (!client) return err("invalid_client", `unknown client_id: ${client_id}`, 401);

    // Single-use consumption is atomic via the SET consumed_at = now()
    // WHERE consumed_at IS NULL clause — replay = null return = invalid_grant.
    const consumed = await consumeAuthCode({ code, clientId: client_id, redirectUri: redirect_uri });
    if (!consumed) return err("invalid_grant", "code not found, expired, already used, or redirect_uri mismatch");

    if (!verifyPkceS256(code_verifier, consumed.codeChallenge)) {
      return err("invalid_grant", "PKCE verification failed");
    }

    const tokenPair = await issueTokenPair({
      userId: consumed.userId,
      clientId: client_id,
      scope: consumed.scope,
    });

    await appendAudit({
      event: "token_issued",
      userId: consumed.userId,
      clientId: client_id,
      ip,
      meta: { scope: consumed.scope, grant: "authorization_code" },
    });

    return NextResponse.json(
      {
        access_token: tokenPair.accessToken,
        token_type: tokenPair.tokenType,
        expires_in: tokenPair.expiresIn,
        refresh_token: tokenPair.refreshToken,
        scope: tokenPair.scope,
      },
      { headers: { "cache-control": "no-store", pragma: "no-cache" } },
    );
  }

  // grant_type=refresh_token
  const parsed = refreshGrantSchema.safeParse(body);
  if (!parsed.success) {
    return err("invalid_request", parsed.error.issues[0]?.message);
  }
  const { refresh_token, client_id } = parsed.data;

  const result = await rotateRefreshToken(refresh_token, client_id);
  if (!result) {
    await appendAudit({
      event: "token_refresh_failed",
      clientId: client_id,
      ip,
    });
    return err("invalid_grant", "refresh token unknown, expired, revoked, or client mismatch");
  }

  await appendAudit({
    event: "token_refreshed",
    userId: result.userId,
    clientId: client_id,
    ip,
    meta: { scope: result.tokenPair.scope },
  });

  return NextResponse.json(
    {
      access_token: result.tokenPair.accessToken,
      token_type: result.tokenPair.tokenType,
      expires_in: result.tokenPair.expiresIn,
      refresh_token: result.tokenPair.refreshToken,
      scope: result.tokenPair.scope,
    },
    { headers: { "cache-control": "no-store", pragma: "no-cache" } },
  );
}
