import NextAuth, { type NextAuthConfig } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '~/lib/data'
import { accounts, users } from '~/lib/data/schema'

// Auth.js v5 — Credentials provider only for v1. Google is scaffolded but
// commented out (re-enable by `import Google from "next-auth/providers/google"`,
// adding it to `providers`, and setting AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET).
// No magic links, no email verification, no password reset — those flows all
// require an email transport which we don't ship in v1.
//
// Session strategy is JWT (signed cookie) — required when using an adapter
// with Credentials, since Auth.js can't persist a DB session row from inside
// the authorize() callback. The adapter is still wired so the `accounts`
// table is ready the day a social provider lands.
const config = {
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
    // surface it to the server-side `auth()` resolver (and ultimately tRPC ctx).
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
} satisfies NextAuthConfig

export const { handlers, auth, signIn, signOut } = NextAuth(config)
