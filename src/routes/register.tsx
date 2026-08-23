import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { RegisterScreen } from '~/components/auth/AuthScreens'
import LegalFooter from '~/components/LegalFooter'
import { safeNext } from '~/lib/safe-next'
import { authModeQueryOptions, sessionQueryOptions } from '~/lib/queries/session'

// Registration. Open alongside the IdP — the iris "two-halves" hybrid — and
// invite-gated when the deployment sets INVITE_CODE. An IdP being configured
// no longer closes this page: the two doors are kept apart by `OIDC_EMAILS`
// instead (an address reserved for the IdP is refused by `registerUser`, with
// a message pointing at the single sign-on button). That refusal is a security
// control, not a validation nicety — see the comment on
// `allowDangerousEmailAccountLinking` in server/auth/config.ts.
//
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

    return await context.queryClient.ensureQueryData(authModeQueryOptions())
  },

  component: RegisterPage,
})

function RegisterPage() {
  const { next } = Route.useSearch()
  const { inviteRequired } = Route.useRouteContext()
  const navigate = useNavigate()

  return (
    <>
      <RegisterScreen
        inviteRequired={inviteRequired}
        onSwitchToLogin={() => void navigate({ to: '/login', search: { next } })}
        onSuccess={() => void navigate({ href: next ?? '/app' })}
      />
      <LegalFooter />
    </>
  )
}
