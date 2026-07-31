import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { LoginScreen, SignInErrorScreen } from '~/components/auth/AuthScreens'
import LegalFooter from '~/components/LegalFooter'
import { safeNext } from '~/lib/safe-next'
import { authModeQueryOptions, sessionQueryOptions } from '~/lib/queries/session'
import { startOidcSignIn } from '~/server/fn/auth.fn'

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
// `error` is written by @auth/core, not by us: every failed sign-in is
// redirected to `pages.signIn` — which config.ts sets to this route — with the
// error type in the query string (index.js:139). Under SSO that param is the
// difference between a sign-in error page and an infinite loop; see beforeLoad.
export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { next?: string; error?: string } => ({
    next: typeof search.next === 'string' ? safeNext(search.next) : undefined,
    error: typeof search.error === 'string' ? search.error : undefined,
  }),

  // Already signed in? Never render the form. This runs on the server during
  // SSR, so a returning user gets a redirect in the HTTP response rather than
  // the flash of a login page the useEffect check in the Next version produced.
  // The `next` support is what lets /oauth/authorize send an unauthenticated
  // MCP client here and resume afterwards.
  beforeLoad: async ({ context, search }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions())
    if (session) throw redirect({ href: search.next ?? '/app' })

    const mode = await context.queryClient.ensureQueryData(authModeQueryOptions())

    // No IdP configured (all of local dev) — the password form below is the
    // whole of sign-in and nothing about this route has changed.
    if (!mode.oidcEnabled) return mode

    // THE LOOP GUARD. @auth/core sends a failed sign-in back here with
    // `?error=`; bouncing straight to the IdP again would send an account it
    // refuses — a user outside the `admins` group, say — round and round
    // between the two hosts with nothing on screen. Render the failure instead
    // and let the user choose to retry.
    if (search.error) return mode

    // Mint the authorize URL. This is a write: it sets the `state` and PKCE
    // cookies the callback is checked against, and they ride out on this
    // response (Start merges set-cookie into non-2xx responses, so the redirect
    // below keeps them).
    let url: string
    try {
      ;({ url } = await startOidcSignIn({ data: { next: search.next } }))
    } catch {
      // Discovery failed or the IdP is unreachable. Land on our own error
      // screen rather than a route error boundary — this is the one auth
      // surface an unauthenticated visitor sees, so it should read like a page.
      throw redirect({ to: '/login', search: { next: search.next, error: 'Unreachable' } })
    }

    // Absolute URL, so TanStack turns this into a full-page navigation rather
    // than a router push — which is required: it is a different origin.
    throw redirect({ href: url })
  },

  component: LoginPage,
})

function LoginPage() {
  const { next, error } = Route.useSearch()
  const { oidcEnabled, providerName } = Route.useRouteContext()
  const navigate = useNavigate()

  // Under SSO this component is only ever reached with an `?error=` — every
  // other path through beforeLoad throws a redirect before rendering.
  if (oidcEnabled) {
    return (
      <>
        <SignInErrorScreen
          code={error ?? 'Unknown'}
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
        onSwitchToRegister={() => void navigate({ to: '/register', search: { next } })}
        onSuccess={() => void navigate({ href: next ?? '/app' })}
      />
      <LegalFooter />
    </>
  )
}
