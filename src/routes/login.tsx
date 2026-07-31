import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { LoginScreen } from '~/components/auth/AuthScreens'
import LegalFooter from '~/components/LegalFooter'
import { safeNext } from '~/lib/safe-next'
import { sessionQueryOptions } from '~/lib/queries/session'

// The `?next=` target is sanitized in the VALIDATOR, not at the redirect
// site. That way every consumer of `Route.useSearch().next` — the sign-in
// success handler, the already-authenticated bounce, anything added later —
// receives an already-safe value, and there is no path by which an
// unsanitized one reaches a navigation.
//
// The transform must map absent → absent rather than absent → '/app'. The
// router normalises the URL to whatever the validator returns, so defaulting
// here makes a plain visit to /login answer 307 to /login?next=%2Fapp: an
// extra round trip and a redirect target sitting in the URL bar of every
// sign-in page. Consumers supply the fallback instead (`next ?? '/app'`),
// which is a literal and needs no sanitizing.
//
// Hand-written rather than a zod schema, and that is deliberate. TanStack
// derives the route's search type from this function's RETURN type, and a
// route file that also calls `Route.useSearch()` is circular with
// routeTree.gen.ts — TypeScript resolves that fine for an inline function
// literal, but bails to `{}` when the validator is the result of a generic
// call. The symptom is every param silently vanishing from `useSearch()` and
// from every `navigate()` to this route. An inline function is also tolerant
// for free: a malformed query string yields `undefined`, not a route error,
// which is what a public entry point should do.
export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { next?: string } => ({
    next: typeof search.next === 'string' ? safeNext(search.next) : undefined,
  }),

  // Already signed in? Never render the form. This runs on the server during
  // SSR, so a returning user gets a redirect in the HTTP response rather than
  // the flash of a login page the useEffect check in the Next version produced.
  // The `next` support is what lets /oauth/authorize send an unauthenticated
  // MCP client here and resume afterwards.
  beforeLoad: async ({ context, search }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions())
    if (session) throw redirect({ href: search.next ?? '/app' })
  },

  component: LoginPage,
})

function LoginPage() {
  const { next } = Route.useSearch()
  const navigate = useNavigate()

  return (
    <>
      {/* `href`, not `to`, for the success target: `next` is an arbitrary
          (already sanitized) path out of the query string, so it cannot be
          checked against the typed route tree. */}
      <LoginScreen
        onSwitchToRegister={() => void navigate({ to: '/register', search: { next } })}
        onSuccess={() => void navigate({ href: next ?? '/app' })}
      />
      <LegalFooter />
    </>
  )
}
