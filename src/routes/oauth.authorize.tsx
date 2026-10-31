/* eslint-disable i18next/no-literal-string -- the OAuth consent + error pages are English-only for v1, same as ConsentScreen.tsx. */

import { createFileRoute, redirect } from '@tanstack/react-router'
import { ConsentScreen } from '~/components/oauth/ConsentScreen'
import { resolveAuthorize } from '~/server/fn/oauth.fn'

// /oauth/authorize. All four branches are decided by one server function —
// see the note on `resolveAuthorize` for why none of it can live in the loader.
//
// `staleTime: Infinity` + `shouldReload: false` because the loader mints an
// authorization code on the auto-approve path, and a re-run would mint a
// second one. Belt and braces: codes are single-use with a 60s TTL, so a stray
// mint is wasted rather than dangerous. This route is only ever reached by a
// full browser navigation from an MCP client, so there is nothing to gain from
// revalidating it anyway.
export const Route = createFileRoute('/oauth/authorize')({
  validateSearch: (search: Record<string, unknown>): Record<string, string> => {
    // Passed through verbatim to validateAuthorize, which is the thing that
    // actually knows which params are required and what they may contain.
    // Coercing here would only obscure its error messages.
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(search)) {
      if (typeof v === 'string') out[k] = v
    }
    return out
  },
  staleTime: Infinity,
  shouldReload: false,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const result = await resolveAuthorize({ data: deps })
    if (result.kind === 'redirect') throw redirect({ href: result.url })
    return result
  },
  component: AuthorizePage,
})

function AuthorizePage() {
  const result = Route.useLoaderData()

  if (result.kind === 'error') {
    return <ErrorPage title={result.title} description={result.description} status={result.status} />
  }

  return (
    <ConsentScreen
      clientName={result.clientName}
      scope={result.scope}
      returnsTo={result.returnsTo}
      userEmail={result.userEmail}
      hiddenFields={result.hiddenFields}
    />
  )
}

// Rendered inline, never as a redirect — see resolveAuthorize's case 1.
function ErrorPage({ title, description, status }: { title: string; description: string; status: number }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        fontFamily: 'var(--font-ui, system-ui, sans-serif)',
        background: 'var(--paper-deep, #f7f3ec)',
        color: 'var(--ink, #1c1815)',
      }}
    >
      <div style={{ maxWidth: 460, textAlign: 'center' }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
            marginBottom: 12,
          }}
        >
          Error {status}
        </div>
        <h1 style={{ fontFamily: 'var(--font-display, serif)', fontSize: 28, margin: 0, marginBottom: 12 }}>{title}</h1>
        <p style={{ color: 'var(--ink-2, #4a4540)', fontSize: 14, lineHeight: 1.6 }}>{description}</p>
      </div>
    </div>
  )
}
