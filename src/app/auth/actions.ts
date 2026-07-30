'use server'

import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { signIn, signOut, auth } from '~/lib/auth'
import { db } from '~/lib/data'
import { users } from '~/lib/data/schema'

// Server actions that wrap Auth.js for the browser-initiated auth flows.
// Each returns a serializable { ok, error? } so call sites can render toasts
// without throwing across the server/client boundary.
//
// v1: email/password only — no Google, no magic links, no email confirmation,
// no password reset. Adding any of those means wiring an email transport
// and switching the providers list in src/lib/auth/index.ts.

type Result<T = unknown> = { ok: true; data?: T } | { ok: false; error: string }

export async function signInWithPasswordAction(email: string, password: string): Promise<Result> {
  try {
    await signIn('credentials', { email, password, redirect: false })
    return { ok: true }
  } catch {
    // Auth.js throws on bad credentials. Don't leak which field was wrong.
    return { ok: false, error: 'Email or password is incorrect' }
  }
}

export async function signUpAction(name: string, email: string, password: string): Promise<Result> {
  const trimmedName = name.trim()
  const normalizedEmail = email.trim().toLowerCase()
  if (!trimmedName) return { ok: false, error: 'Name is required' }
  if (password.length < 12) return { ok: false, error: 'Password must be at least 12 characters' }

  const existing = await db.query.users.findFirst({ where: eq(users.email, normalizedEmail) })
  if (existing) return { ok: false, error: 'An account with this email already exists' }

  const passwordHash = await bcrypt.hash(password, 10)
  await db.insert(users).values({
    name: trimmedName,
    email: normalizedEmail,
    passwordHash,
  })

  try {
    await signIn('credentials', { email: normalizedEmail, password, redirect: false })
    return { ok: true }
  } catch {
    return { ok: false, error: 'Account created, but sign-in failed. Try logging in.' }
  }
}

export async function signOutAction(): Promise<Result> {
  await signOut({ redirect: false })
  return { ok: true }
}

// Password change while logged in. Re-auth with bcrypt against the stored
// hash before writing the new one — same UX guarantee as the previous
// Supabase flow, no session round-trip required.
export async function changePasswordAction(currentPassword: string, newPassword: string): Promise<Result> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: 'Not signed in.' }

  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) })
  if (!user?.passwordHash) return { ok: false, error: 'No password set on this account.' }

  const ok = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!ok) return { ok: false, error: 'Current password is incorrect' }

  if (newPassword.length < 12) return { ok: false, error: 'New password must be at least 12 characters' }

  const passwordHash = await bcrypt.hash(newPassword, 10)
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, user.id))
  return { ok: true }
}

// Google / Apple / password-reset call sites still exist in components. We
// keep these stub actions to avoid a wider UI refactor; they short-circuit
// with a polite "not configured" message and the UI surfaces it as a toast.
// Wire-up TODO when an email provider lands or Google is enabled.
//
// export async function signInWithGoogleAction(): Promise<Result> {
//   return { ok: false, error: "Google sign-in is not configured yet." };
// }
