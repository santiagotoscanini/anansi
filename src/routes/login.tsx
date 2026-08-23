import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { LoginScreen, SignInErrorScreen } from '~/components/auth/AuthScreens'
import LegalFooter from '~/components/LegalFooter'
import { safeNext } from '~/lib/safe-next'
import { authModeQueryOptions, sessionQueryOptions } from '~/lib/queries/session'

// EMAIL-FIRST SIGN-IN — the iris "two-halves" hybrid.
//
// Both doors are open at once: the operator signs in through Pocket ID,
// everyone else with email + password. Step 1 of the form takes an address and
// nothing else; a server function answers which door it goes through, and the
// form either hands off to the IdP or reveals the password field in place.
//
// Note what does NOT happen here any more: no automatic bounce to the IdP in
// beforeLoad. The email decides the door, so the redirect can only be minted
// after step 1, in the component. That also dissolves the old redirect loop —
// `?error=` (written by @auth/core on every failed sign-in, since
// `pages.signIn` points here) now renders an error screen whose retry lands on
// the form rather than re-entering an automatic bounce.

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
// from every `navigate()` to this route.
export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { next?: string; error?: string } => ({
    next: typeof search.next === 'string' ? safeNext(search.next) : undefined,
    error: typeof search.error === 'string' ? search.error : undefined,
  }),

  // Already signed in? Never render the form. This runs on the server during
  // SSR, so a returning user gets a redirect in the HTTP response rather than
  // the flash of a login page. The `next` support is what lets /oauth/authorize
  // send an unauthenticated MCP client here and resume afterwards — honoured by
  // BOTH doors: the password path navigates to it on success, and the OIDC path
  // threads it through `startOidcSignIn` into Auth.js's post-callback redirect.
  beforeLoad: async ({ context, search }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions())
    if (session) throw redirect({ href: search.next ?? '/app' })

    return await context.queryClient.ensureQueryData(authModeQueryOptions())
  },

  component: LoginPage,
})

function LoginPage() {
  const { next, error } = Route.useSearch()
  const { oidcEnabled, providerName } = Route.useRouteContext()
  const navigate = useNavigate()

  // The IdP bounced a sign-in back with `?error=`. Render the failure and let
  // the user choose to retry — the retry clears the param and lands on the
  // form, so an account the IdP refuses can still take the password door.
  if (error) {
    return (
      <>
        <SignInErrorScreen
          code={error}
          providerName={providerName}
          onRetry={() => void navigate({ to: '/login', search: { next } })}
        />
        <LegalFooter />
      </>
    )
  }

  return (
    <>
      {/* `href`, not `to`, for the success target: `next` is an arbitrary
          (already sanitized) path out of the query string, so it cannot be
          checked against the typed route tree. */}
      <LoginScreen
        oidcEnabled={oidcEnabled}
        providerName={providerName}
        next={next}
        onSwitchToRegister={() => void navigate({ to: '/register', search: { next } })}
        onSuccess={() => void navigate({ href: next ?? '/app' })}
      />
      <LegalFooter />
    </>
  )
}
