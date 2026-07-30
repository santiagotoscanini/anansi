import Link from 'next/link'

/* eslint-disable i18next/no-literal-string -- legal page link labels, EN-only until reviewed */

// Tiny legal footer for public-facing pages (landing, login, register,
// password-recovery). Renders fixed at the bottom-right so it never
// blocks the form panel above it. Server component — no client hooks,
// safe to drop into any page.
export default function LegalFooter() {
  return (
    <div
      className="pointer-events-none fixed bottom-3 right-4 z-50 flex gap-4"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--ink-3)',
      }}
    >
      <Link href="/privacy" className="pointer-events-auto hover:text-[var(--ink)]">
        Privacy
      </Link>
      <Link href="/terms" className="pointer-events-auto hover:text-[var(--ink)]">
        Terms
      </Link>
    </div>
  )
}
