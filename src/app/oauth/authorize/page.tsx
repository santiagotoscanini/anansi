/* eslint-disable i18next/no-literal-string -- OAuth authorize/error pages render as server components, which the project's i18next client-runtime can't reach yet. English-only for v1; same migration path as ConsentScreen.tsx. */

import { redirect } from "next/navigation";
import { auth } from "~/lib/auth";
import { db } from "~/lib/data";
import { users } from "~/lib/data/schema";
import { eq } from "drizzle-orm";
import { ConsentScreen } from "~/components/oauth/ConsentScreen";
import { validateAuthorize, buildRedirect } from "~/lib/mcp/oauth/authorize-validation";
import { hasExistingConsent } from "~/lib/mcp/oauth/consent";
import { mintAuthCode } from "~/lib/mcp/oauth/codes";
import { appendAudit } from "~/lib/mcp/oauth/audit";

export const dynamic = "force-dynamic";

// /oauth/authorize entry point. Handles four cases:
//   1. Invalid request → show an error page (NEVER 302 to an unverified URI).
//   2. No Auth.js session → 302 to /login?next=<original-url> (returns here
//      after sign-in, picks up the query params again).
//   3. Has session AND prior consent for (client, scope) → auto-mint code,
//      302 directly to redirect_uri?code=…&state=…
//   4. Has session, no consent → render ConsentScreen for user to approve.
//
// Server component throughout — the consent screen is plain HTML, so no
// "use client" boundary, no React hydration cost.
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) raw[k] = Array.isArray(v) ? v[0] : v;

  const validation = await validateAuthorize(raw);
  if (!validation.ok) {
    if (validation.err.kind === "display") {
      return (
        <ErrorPage
          title={validation.err.title}
          description={validation.err.description}
          status={validation.err.status}
        />
      );
    }
    // (Redirect-style errors only happen after we've validated the client +
    // redirect_uri, which means we'd never get here pre-session-check.
    // Included for exhaustiveness — same behavior as display.)
    return <ErrorPage title="Authorization error" description={validation.err.description} status={400} />;
  }
  const { client, redirectUri, codeChallenge, codeChallengeMethod, scope, state } = validation.req;

  // Read the Auth.js session. If absent, bounce to /login with `next` set
  // to this URL so we resume after sign-in.
  const session = await auth();
  const sessionUserId = session?.user?.id ?? null;

  if (!sessionUserId) {
    const qs = new URLSearchParams();
    qs.set("client_id", client.clientId);
    qs.set("redirect_uri", redirectUri);
    qs.set("response_type", "code");
    qs.set("code_challenge", codeChallenge);
    qs.set("code_challenge_method", codeChallengeMethod);
    qs.set("scope", scope);
    if (state) qs.set("state", state);
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${qs.toString()}`)}`);
  }

  // Look up the user's email for the consent screen ("Signed in as …") and
  // for audit-log meta.
  const [userRow] = await db.select({ email: users.email }).from(users).where(eq(users.id, sessionUserId)).limit(1);
  const userEmail = userRow?.email ?? session?.user?.email ?? "(unknown)";

  // Auto-approve path: prior consent for an equal-or-wider scope set.
  if (await hasExistingConsent(sessionUserId, client.clientId, scope)) {
    const code = await mintAuthCode({
      clientId: client.clientId,
      userId: sessionUserId,
      redirectUri,
      codeChallenge,
      codeChallengeMethod,
      scope,
    });
    await appendAudit({
      event: "consent_auto",
      userId: sessionUserId,
      clientId: client.clientId,
      meta: { scope },
    });
    redirect(buildRedirect(redirectUri, { code, state }));
  }

  await appendAudit({
    event: "authorize_started",
    userId: sessionUserId,
    clientId: client.clientId,
    meta: { scope, redirectUri },
  });

  // First-time consent — render the screen. ALL params get echoed into hidden
  // form fields so the decision route re-validates the same intent (a
  // mid-flow query-string tamper would change one of these and re-validation
  // would catch it).
  return (
    <ConsentScreen
      clientName={client.clientName}
      scope={scope}
      userEmail={userEmail}
      hiddenFields={{
        client_id: client.clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        scope,
        state: state ?? undefined,
      }}
    />
  );
}

function ErrorPage({ title, description, status }: { title: string; description: string; status: number }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        fontFamily: "var(--font-ui, system-ui, sans-serif)",
        background: "var(--paper-deep, #f7f3ec)",
        color: "var(--ink, #1c1815)",
      }}
    >
      <div style={{ maxWidth: 460, textAlign: "center" }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            marginBottom: 12,
          }}
        >
          Error {status}
        </div>
        <h1 style={{ fontFamily: "var(--font-display, serif)", fontSize: 28, margin: 0, marginBottom: 12 }}>{title}</h1>
        <p style={{ color: "var(--ink-2, #4a4540)", fontSize: 14, lineHeight: 1.6 }}>{description}</p>
      </div>
    </div>
  );
}
