'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { GoalsProvider, useGoals } from '~/contexts/GoalsContext'
import { RegisterScreen } from '~/components/auth/AuthScreens'
import { Toaster } from 'react-hot-toast'
import LegalFooter from '~/components/LegalFooter'

// Same `?next=` sanitization as /login — only relative same-origin paths are
// honored. Blocks `//evil` (protocol-relative) and absolute external URLs.
function safeNext(next: string | null): string {
  if (!next?.startsWith('/')) return '/app'
  if (next.startsWith('//')) return '/app'
  return next
}

function RegisterPageInner() {
  const router = useRouter()
  const params = useSearchParams()
  const next = safeNext(params.get('next'))
  const { isAuthenticated, isLoading } = useGoals()

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace(next)
  }, [isAuthenticated, isLoading, router, next])

  return (
    <>
      <Toaster position="top-right" />
      <RegisterScreen
        onSwitchToLogin={() => router.push(`/login?next=${encodeURIComponent(next)}`)}
        onSuccess={() => router.push(next)}
      />
      <LegalFooter />
    </>
  )
}

export default function RegisterPage() {
  return (
    <GoalsProvider>
      <RegisterPageInner />
    </GoalsProvider>
  )
}
