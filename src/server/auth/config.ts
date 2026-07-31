import { DrizzleAdapter } from '@auth/drizzle-adapter'
import Credentials from '@auth/core/providers/credentials'
import type { AuthConfig } from '@auth/core'
import type { OIDCConfig } from '@auth/core/providers'
import type { Profile } from '@auth/core/types'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '~/lib/data'
import { accounts, users } from '~/lib/data/schema'
import { env, oidcEnabled } from '~/lib/env'

// Auth.js v5 on @auth/core directly — the framework-agnostic core that the
// next-auth package wraps. Using it directly is what keeps the auth SDK out
// of the browser bundle entirely: sign-in runs in a server function, not in
// a client-side provider.
//
// Exactly ONE provider is ever active, chosen by whether an IdP is configured:
// Pocket ID (OIDC) when it is, the Credentials provider when it isn't. See
// `providers` below for why it is either/or rather than both. No magic links,
// no email verification, no password reset — those all require an email
// transport we don't ship.
//
// Session strategy is JWT (signed cookie) — required when using an adapter with
// Credentials, since Auth.js can't persist a DB session row from inside
// authorize(). The adapter is still wired so the `accounts` table is ready the
// day a social provider lands.
//
// ─────────────────────────────────────────────────────────────────────────────
// DO NOT set `cookies`, `useSecureCookies`, `jwt.encode`, `jwt.decode`, or
// `session.maxAge` here.
//
// The session cookie is a JWE whose key is
//   hkdf(sha256, secret, salt, `Auth.js Generated Encryption Key (${salt})`, 64)
// and `salt` DEFAULTS TO THE COOKIE NAME (@auth/core/jwt.js:86, :122). The
// cookie name in turn comes from `defaultCookies(useSecureCookies ?? url.protocol
// === 'https:')` (@auth/core/lib/init.js:69) — so it is
// `authjs.session-token` over http and `__Secure-authjs.session-token` over
// https. Any of the settings above changes the name, the salt, or the key
// material, and the failure mode is not an error: decryption silently yields
// null and every existing session evaporates. Leaving them unset is what keeps
// this byte-compatible with the cookies Next is issuing today.
// ─────────────────────────────────────────────────────────────────────────────
/** The last path segment of the redirect URI registered at the IdP, if any. */
function providerIdFromRedirectUri(): string | undefined {
  if (!env.OIDC_REDIRECT_URI) return undefined
  return new URL(env.OIDC_REDIRECT_URI).pathname.split('/').filter(Boolean).pop()
}

/**
 * The OIDC provider's id — which is HALF OF THE REDIRECT URI registered at the
 * identity provider, not a naming preference.
 *
 * Auth.js builds its callback path as `${basePath}/callback/${provider.id}`, so
 * `pocket-id` here is exactly what makes the callback land on the
 * `…/api/auth/callback/pocket-id` that Pocket ID is registered to redirect to.
 * Change it and the IdP rejects the authorize request with an
 * invalid-redirect-uri error, which reads like an IdP outage rather than a typo
 * on our side.
 *
 * Derived from `OIDC_REDIRECT_URI` first, because that env var IS the registered
 * contract and is therefore the more authoritative of the two — deriving rather
 * than restating it is what makes drift between them impossible.
 * `OIDC_PROVIDER_ID` is the fallback for a deployment that sets one and not the
 * other, and the literal is the last resort so the id is stable in dev.
 *
 * Exported because actions.ts needs the same value to address the signin
 * endpoint, and a second copy of this string is a second place for it to rot.
 */
export const oidcProviderId = providerIdFromRedirectUri() ?? env.OIDC_PROVIDER_ID ?? 'pocket-id'

/**
 * Pocket ID as a plain OIDC provider.
 *
 * Discovery is LAZY and must stay that way: passing `issuer` (rather than a
 * hand-written `authorization`/`token`/`userinfo` triple) makes @auth/core fetch
 * `/.well-known/openid-configuration` on the first authorize request, not at
 * module import. An app that reaches the IdP during startup crash-loops on a
 * cold boot whenever the IdP happens to come up second.
 *
 * Returns null when the IdP is not configured, which is the whole of local dev.
 * Built as a function rather than a const so the four required values are
 * narrowed to `string` in one place.
 */
function pocketIdProvider(): OIDCConfig<Profile> | null {
  if (!oidcEnabled) return null

  return {
    id: oidcProviderId,
    name: env.OIDC_PROVIDER_NAME ?? 'Pocket ID',
    type: 'oidc',
    issuer: env.OIDC_ISSUER_URL,
    clientId: env.OIDC_CLIENT_ID,
    clientSecret: env.OIDC_CLIENT_SECRET,
    authorization: { params: { scope: env.OIDC_SCOPES ?? 'openid profile email groups' } },
    // PKCE is enabled on this client at the IdP, so send it. `state` on top
    // because the callback arrives cross-site and the state cookie is the only
    // thing tying it back to the browser that started the flow.
    checks: ['pkce', 'state'],

    // The adapter writes `name` (NOT NULL) and `image` on account creation.
    // `avatarUrl` is deliberately absent: that column is the app's canonical
    // avatar and the UI reads it, so letting the IdP's `picture` reach it would
    // silently overwrite an avatar the user uploaded here on every sign-in.
    profile: (p) => ({
      id: p.sub!,
      name: p.name ?? p.preferred_username ?? p.email!,
      email: p.email!,
      // `Profile['picture']` is typed `any` upstream, so narrow rather than
      // spread an unchecked value into a column.
      image: typeof p.picture === 'string' ? p.picture : null,
    }),

    // Links the OIDC identity onto a PRE-EXISTING users row with the same
    // email instead of creating a second, empty account. That is what carries
    // the current user's goals across this migration.
    //
    // Safe *here* and only here: Pocket ID is the only provider on this
    // deployment (see `providers` below) and it verifies the address itself, so
    // there is no second, unverified issuer that could assert someone else's
    // email and inherit their data. Adding a second provider means revisiting
    // this line first.
    allowDangerousEmailAccountLinking: true,
  }
}

const pocketId = pocketIdProvider()

/**
 * Email + password against `users.passwordHash`.
 *
 * The only provider where there is no IdP, and unreachable where there is —
 * see `providers` below. `passwordHash` is left in the schema and
 * `changePassword` left in the service layer either way: the column simply goes
 * dormant on an SSO deployment, and nothing about seeding or the dev flow has
 * to know which mode it is running in.
 */
const credentialsProvider = Credentials({
  name: 'credentials',
  credentials: {
    email: { label: 'Email', type: 'email' },
    password: { label: 'Password', type: 'password' },
  },
  async authorize(credentials) {
    const parsed = z
      .object({
        email: z.string().email(),
        password: z.string().min(1),
      })
      .safeParse(credentials)
    if (!parsed.success) return null

    const { email, password } = parsed.data
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    })
    if (!user?.passwordHash) return null

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return null

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.avatarUrl,
    }
  },
})

export const authConfig = {
  // @auth/core defaults basePath to `/auth`; next-auth forces `/api/auth`
  // (next-auth/lib/env.js:36). Setting it explicitly is what keeps the public
  // /api/auth/* contract — and, through defaultCookies, the cookie name.
  basePath: '/api/auth',

  // next-auth reads AUTH_SECRET from the environment for us. Nothing does that
  // here, so pass it explicitly — as a string, matching next-auth's shape
  // (@auth/core's own setEnvDefaults would wrap it in an array; both derive the
  // same key, but there is no reason to introduce the difference).
  secret: env.AUTH_SECRET,

  // The app is always behind a proxy it owns (nginx on s2-server) or on
  // localhost. Setting this here rather than via AUTH_TRUST_HOST removes an
  // undocumented deploy-time env dependency: without it @auth/core refuses to
  // infer the URL from the Host header in production and every request fails
  // with UntrustedHost.
  trustHost: true,

  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
  }),
  // EITHER/OR, never both. Where an IdP exists it is the only door: a second
  // password path on a publicly-exposed surface is a second thing to attack and
  // a second thing to keep patched, and it would defeat the group restriction
  // the IdP enforces. Where there is no IdP — `pnpm dev`, the Playwright flows,
  // scripts/capture-screens.sh — the credentials provider is the only door, and
  // the shape of everything downstream is unchanged.
  //
  // Swapping providers does NOT change the session cookie's name, salt or key
  // material (all of that comes from basePath + secret + protocol, see above),
  // so sessions issued before this deploy keep working after it.
  providers: pocketId ? [pocketId] : [credentialsProvider],
  callbacks: {
    // Add the user id to the JWT on sign-in so the session callback can
    // surface it to getServerSession() (and ultimately every service call).
    jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  debug: false,
} satisfies AuthConfig
