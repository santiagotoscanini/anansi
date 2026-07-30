import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import ScaffoldNotice from '~/components/ScaffoldNotice'
import { safeNext } from '~/lib/safe-next'

// The `?next=` target is sanitized in the VALIDATOR, not at the redirect
// site. That way every consumer of `Route.useSearch().next` — the sign-in
// success handler in 3.2, the already-authenticated bounce, anything added
// later — receives an already-safe value, and there is no path by which an
// unsanitized one reaches a navigation.
//
// The transform must map absent → absent rather than absent → '/app'. The
// router normalises the URL to whatever the validator returns, so defaulting
// here makes a plain visit to /login answer 307 to /login?next=%2Fapp: an
// extra round trip and a redirect target sitting in the URL bar of every
// sign-in page. Consumers supply the fallback instead (`next ?? '/app'`),
// which is a literal and needs no sanitizing.
export const Route = createFileRoute('/login')({
  validateSearch: z
    .object({
      next: z
        .string()
        .optional()
        .transform((v) => (v === undefined ? undefined : safeNext(v))),
    })
    // A malformed query string should render the sign-in page, not a route
    // error — this is a public, unauthenticated entry point.
    .catch({ next: undefined }),
  component: () => <ScaffoldNotice route="/login" blockedOn="phase 3.2" />,
})
