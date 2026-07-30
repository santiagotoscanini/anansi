/* eslint-disable i18next/no-literal-string -- scaffolding, deleted in phase 3.2 before any user sees it */

// Placeholder for a route whose real implementation is blocked on a later
// migration phase. Exists so the route tree is complete and navigable from
// 3.1 onward — an incomplete tree hides routing problems (a bad path, a
// missing search-param validator) until the phase that would surface them.
export default function ScaffoldNotice({ route, blockedOn }: { route: string; blockedOn: string }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16" style={{ color: 'var(--ink)' }}>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em', color: 'var(--ink-3)' }}>
        {route.toUpperCase()} · NOT YET MIGRATED
      </p>
      <h1 className="mt-3" style={{ fontFamily: 'var(--font-display)', fontSize: 34, lineHeight: 1.15 }}>
        Lands in {blockedOn}.
      </h1>
      <p className="mt-4" style={{ fontFamily: 'var(--font-text)', fontSize: 16, color: 'var(--ink-2)' }}>
        Until then this route works on Next at <code>pnpm dev</code>.
      </p>
      <nav
        className="mt-12 flex gap-6 pt-8"
        style={{
          borderTop: '1px solid var(--hairline)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
        }}
      >
        <a href="/">Home</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
      </nav>
    </main>
  )
}
