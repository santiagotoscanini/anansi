'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { GoalsProvider, useGoals } from '~/contexts/GoalsContext'
import { LoginScreen } from '~/components/auth/AuthScreens'
import { Toaster } from 'react-hot-toast'
import LegalFooter from '~/components/LegalFooter'
import { safeNext } from '~/lib/safe-next'

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
