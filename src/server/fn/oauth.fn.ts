import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '~/lib/data'
import { users } from '~/lib/data/schema'
import { appendAudit } from '~/lib/mcp/oauth/audit'
import { buildRedirect, validateAuthorize } from '~/lib/mcp/oauth/authorize-validation'
import { mintAuthCode } from '~/lib/mcp/oauth/codes'
import { hasExistingConsent } from '~/lib/mcp/oauth/consent'
import { getServerSession } from '~/server/auth/session'

// EXPORTS ONLY SERVER FUNCTIONS — see the `.fn.ts` convention note in
// CLAUDE.md. A plain runtime value exported here makes the Start compiler treat
// the module as mixed and mis-register every function id in it.

/**
 * Everything `/oauth/authorize` decides, in one server call.
 *
 * The whole decision has to live server-side, not in the route loader: a
 * TanStack loader runs on the client as well, and neither `getServerSession`
 * nor `mintAuthCode` can. Splitting it would also mean two round trips to
 * answer one question.
 *
 * Four outcomes, matching the Next server component this replaces:
 *   1. Invalid request → `error`. Rendered INLINE. Never a redirect: at this
 *      point the redirect_uri has not been verified against the client's
 *      registered set, so redirecting to it is exactly the open-redirect the
 *      validation exists to prevent.
 *   2. No session → `redirect` to /login?next=<this url>, so the flow resumes
 *      after sign-in with its query params intact.
 *   3. Session + prior consent for an equal-or-wider scope → mint a code and
 *      `redirect` straight to the client's callback.
 *   4. Session, no consent → `consent`, and the screen renders.
 */
export const resolveAuthorize = createServerFn({ method: 'GET' })
  .validator(z.record(z.string(), z.string()))
  .handler(async ({ data: raw }) => {
    const validation = await validateAuthorize(raw)
    if (!validation.ok) {
      const err = validation.err
      return {
        kind: 'error' as const,
        title: err.kind === 'display' ? err.title : 'Authorization error',
        description: err.description,
        status: err.kind === 'display' ? err.status : 400,
      }
    }
    const { client, redirectUri, codeChallenge, codeChallengeMethod, scope, state } = validation.req

    const session = await getServerSession()
    const sessionUserId = session?.user?.id ?? null

    if (!sessionUserId) {
      const qs = new URLSearchParams()
      qs.set('client_id', client.clientId)
      qs.set('redirect_uri', redirectUri)
      qs.set('response_type', 'code')
      qs.set('code_challenge', codeChallenge)
      qs.set('code_challenge_method', codeChallengeMethod)
      qs.set('scope', scope)
      if (state) qs.set('state', state)
      return {
        kind: 'redirect' as const,
        url: `/login?next=${encodeURIComponent(`/oauth/authorize?${qs.toString()}`)}`,
      }
    }

    // The email drives "Signed in as …" on the consent screen. Read from the
    // users row rather than the cookie: the cookie's copy is frozen at
    // sign-in, and consenting to share an account under a stale address is
    // exactly the wrong place for that to be out of date.
    const [userRow] = await db.select({ email: users.email }).from(users).where(eq(users.id, sessionUserId)).limit(1)
    const userEmail = userRow?.email ?? session?.user?.email ?? '(unknown)'

    if (await hasExistingConsent(sessionUserId, client.clientId, scope)) {
      const code = await mintAuthCode({
        clientId: client.clientId,
        userId: sessionUserId,
        redirectUri,
        codeChallenge,
        codeChallengeMethod,
        scope,
      })
      await appendAudit({
        event: 'consent_auto',
        userId: sessionUserId,
        clientId: client.clientId,
        meta: { scope },
      })
      return { kind: 'redirect' as const, url: buildRedirect(redirectUri, { code, state }) }
    }

    await appendAudit({
      event: 'authorize_started',
      userId: sessionUserId,
      clientId: client.clientId,
      meta: { scope, redirectUri },
    })

    // Every param is echoed back so the decision route can re-validate the
    // same intent from the form body. A mid-flow query-string tamper changes
    // one of these and re-validation catches it.
    return {
      kind: 'consent' as const,
      clientName: client.clientName,
      scope,
      userEmail,
      hiddenFields: {
        client_id: client.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        scope,
        state: state ?? undefined,
      },
    }
  })
