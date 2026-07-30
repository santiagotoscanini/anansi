/* eslint-disable i18next/no-literal-string -- scaffolding page, deleted in phase 3.4 before any user sees it */
import { createFileRoute } from '@tanstack/react-router'
import { BrandLockup } from '~/components/goals/Brand'

// TEMPORARY. The real landing page is src/app/page.tsx (1253 lines), which
// reads `isAuthenticated` from GoalsContext — so it cannot move until the
// session query exists (3.2) and the context is dissolved (3.4). Porting it
// with a hardcoded `isAuthenticated` would ship a page whose primary CTA is
// wrong, which is worse than an obvious placeholder.
//
// What this page IS for: verifying migration risk R3. globals.css terminates
// every font stack in `Georgia, serif` / `ui-sans-serif`, so a wrong family
// name in src/styles/fonts.css renders as a silent fallback rather than an
// error. Every one of the five typefaces is exercised below, in the weights
// and styles the app actually uses, so DevTools → Rendered Fonts on this one
// page covers the whole type stack.
export const Route = createFileRoute('/')({
  component: ScaffoldHome,
})

// The five roles, matching the --font-* variables globals.css builds.
const SPECIMENS = [
  {
    role: 'brand',
    face: 'Cormorant Garamond',
    css: 'var(--font-brand)',
    // Italic + the swash feature the wordmark depends on. If this line
    // renders upright, or the `i` has no swash, the italic subsets are
    // missing and the lockup above is silently wrong too.
    style: { fontStyle: 'italic', fontWeight: 500, fontFeatureSettings: "'kern','liga','calt','swsh'" },
  },
  { role: 'display', face: 'Instrument Serif', css: 'var(--font-display)', style: { fontWeight: 400 } },
  { role: 'text', face: 'Newsreader', css: 'var(--font-text)', style: { fontWeight: 400 } },
  { role: 'ui', face: 'Geist', css: 'var(--font-ui)', style: { fontWeight: 400 } },
  { role: 'mono', face: 'Geist Mono', css: 'var(--font-mono)', style: { fontWeight: 400 } },
] as const

function ScaffoldHome() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16" style={{ color: 'var(--ink)' }}>
      <BrandLockup size={28} />

      <p
        className="mt-8"
        style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em', color: 'var(--ink-3)' }}
      >
        TANSTACK START SHELL · PHASE 3.1
      </p>
      <p className="mt-3" style={{ fontFamily: 'var(--font-text)', fontSize: 16, color: 'var(--ink-2)' }}>
        The real landing page still lives on Next at <code>pnpm dev</code>. This route exists to prove the shell boots
        and the self-hosted type stack resolves.
      </p>

      <div className="mt-12 space-y-6">
        {SPECIMENS.map((s) => (
          <div key={s.role} style={{ borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)' }}>
              --font-{s.role} → {s.face}
            </div>
            <div style={{ fontFamily: s.css, fontSize: 30, lineHeight: 1.3, ...s.style }}>
              Anansi weaves the web — 0123456789
            </div>
          </div>
        ))}
      </div>

      <nav
        className="mt-16 flex gap-6 pt-8"
        style={{
          borderTop: '1px solid var(--hairline)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
        }}
      >
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/login">Sign in</a>
        <a href="/register">Register</a>
      </nav>
    </main>
  )
}
