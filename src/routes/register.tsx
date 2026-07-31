import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { RegisterScreen } from '~/components/auth/AuthScreens'
import LegalFooter from '~/components/LegalFooter'
import { safeNext } from '~/lib/safe-next'
import { authModeQueryOptions, sessionQueryOptions } from '~/lib/queries/session'

// Same sanitize-in-the-validator contract as /login — see the note there,
// including why an absent `next` must not be defaulted to '/app' and why this
// is a hand-written function rather than a zod schema.
export const Route = createFileRoute('/register')({
  validateSearch: (search: Record<string, unknown>): { next?: string } => ({
    next: typeof search.next === 'string' ? safeNext(search.next) : undefined,
  }),

  beforeLoad: async ({ context, search }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions())
    if (session) throw redirect({ href: search.next ?? '/app' })

    // Where an IdP exists, creating accounts is ITS job — and an open
    // registration page on a publicly-exposed app is a standing invitation.
    // Gated at the route rather than by hiding the link, because the link is
    // not the only way to reach a URL. `signUp` / `registerUser` stay in the
    // codebase: dev and seeding still use them.
    const { oidcEnabled } = await context.queryClient.ensureQueryData(authModeQueryOptions())
    if (oidcEnabled) throw redirect({ to: '/login', search: { next: search.next } })
  },

  component: RegisterPage,
})

function RegisterPage() {
  const { next } = Route.useSearch()
  const navigate = useNavigate()

  return (
    <>
      <RegisterScreen
        onSwitchToLogin={() => void navigate({ to: '/login', search: { next } })}
        onSuccess={() => void navigate({ href: next ?? '/app' })}
      />
      <LegalFooter />
    </>
  )
}
