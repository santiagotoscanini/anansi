'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { GoalsProvider, useGoals } from '~/contexts/GoalsContext'
import { LoginScreen } from '~/components/auth/AuthScreens'
import { Toaster } from 'react-hot-toast'
import LegalFooter from '~/components/LegalFooter'

// Sanitize the `?next=` redirect target so it can only point back into this
// app (relative path, no scheme/host). Mirrors the same guard /auth/callback
// uses — defence against an attacker dropping a /login?next=https://evil link.
function safeNext(next: string | null): string {
  if (!next?.startsWith('/')) return '/app'
  // Block protocol-relative URLs (`//evil.com`) which browsers treat as
  // absolute. Single-leading-slash + non-slash second char is safe.
  if (next.startsWith('//')) return '/app'
  return next
}

function LoginPageInner() {
  const router = useRouter()
  const params = useSearchParams()
  const next = safeNext(params.get('next'))
  const { isAuthenticated, isLoading } = useGoals()

  // If you're already logged in and land on /login, bounce to `next` (or /app).
  // Cookie-based auth means a returning user just sees a flash of the login
  // form otherwise. The `next` support is what lets /oauth/authorize redirect
  // here for unauthenticated MCP-OAuth users and resume after sign-in.
  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace(next)
  }, [isAuthenticated, isLoading, router, next])

  return (
    <>
      <Toaster position="top-right" />
      <LoginScreen onSwitchToRegister={() => router.push('/register')} onSuccess={() => router.push(next)} />
      <LegalFooter />
    </>
  )
}

export default function LoginPage() {
  return (
    <GoalsProvider>
      <LoginPageInner />
    </GoalsProvider>
  )
}
