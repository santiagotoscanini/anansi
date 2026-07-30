import { DrizzleAdapter } from '@auth/drizzle-adapter'
import Credentials from '@auth/core/providers/credentials'
import type { AuthConfig } from '@auth/core'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '~/lib/data'
import { accounts, users } from '~/lib/data/schema'
import { env } from '~/lib/env'

// Auth.js v5 on @auth/core directly — the framework-agnostic core that
// next-auth wraps. src/lib/auth/index.ts (the Next config) is still live and
// must stay behaviourally identical to this file until Next is deleted in 3.6;
// @auth/core is pinned to the exact version next-auth resolves so both stacks
// share ONE physical copy of the JWE/HKDF code.
//
// Credentials provider only for v1. Google is scaffolded but commented out
// (re-enable by importing @auth/core/providers/google, adding it to
// `providers`, and setting AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET). No magic links,
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
  providers: [
    // Google, // uncomment after setting AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET
    Credentials({
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
    }),
  ],
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
