import { z } from "zod";
import { getClient, isRegisteredRedirectUri, type RegisteredClient } from "./clients";
import { normalizeScope } from "./scopes";

// Shared validator for the /oauth/authorize GET query params and the matching
// /oauth/authorize/decision POST body. Splitting validation out keeps the page
// component and the decision route from drifting.

export const authorizeParamsSchema = z.object({
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  response_type: z.literal("code"),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal("S256"),
  scope: z.string().optional(),
  state: z.string().optional(),
});

export type AuthorizeParams = z.infer<typeof authorizeParamsSchema>;

export interface ValidatedAuthorizeRequest {
  client: RegisteredClient;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  scope: string; // normalized
  state: string | null;
}

// Validation errors come in two flavors:
//
//   `display` — surfaced to the user IN-PAGE (never redirected to the client).
//     Used when redirect_uri / client_id can't be trusted, since redirecting
//     to an unverified URI is an open-redirect risk.
//
//   `redirect` — surfaced by 302ing the client back to its registered
//     redirect_uri with `error=…&error_description=…&state=…` per RFC 6749
//     §4.1.2.1. Used after we've verified the client and redirect_uri.
export type AuthorizeError =
  | { kind: "display"; status: number; title: string; description: string }
  | { kind: "redirect"; error: string; description: string; state: string | null };

export async function validateAuthorize(
  raw: Record<string, string | undefined>,
): Promise<{ ok: true; req: ValidatedAuthorizeRequest } | { ok: false; err: AuthorizeError }> {
  const parsed = authorizeParamsSchema.safeParse(raw);
  if (!parsed.success) {
    // We don't have a verified redirect_uri yet, so render an error page.
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      err: {
        kind: "display",
        status: 400,
        title: "Invalid authorization request",
        description: `${issue?.path.join(".") ?? "request"}: ${issue?.message ?? "malformed"}`,
      },
    };
  }
  const data = parsed.data;

  const client = await getClient(data.client_id);
  if (!client) {
    return {
      ok: false,
      err: {
        kind: "display",
        status: 400,
        title: "Unknown client",
        description: `No registered MCP client with id "${data.client_id}". Re-register at /oauth/register.`,
      },
    };
  }

  if (!isRegisteredRedirectUri(client, data.redirect_uri)) {
    return {
      ok: false,
      err: {
        kind: "display",
        status: 400,
        title: "Invalid redirect_uri",
        description: `The redirect_uri "${data.redirect_uri}" is not registered for this client. Re-register at /oauth/register if you've moved.`,
      },
    };
  }

  return {
    ok: true,
    req: {
      client,
      redirectUri: data.redirect_uri,
      codeChallenge: data.code_challenge,
      codeChallengeMethod: data.code_challenge_method,
      scope: normalizeScope(data.scope),
      state: data.state ?? null,
    },
  };
}

// Build the redirect URL back to the MCP client after authorize-time outcomes.
// Caller decides which (success vs error). We URL-encode and preserve state.
export function buildRedirect(redirectUri: string, params: Record<string, string | null | undefined>): string {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined) url.searchParams.set(k, v);
  }
  return url.toString();
}
