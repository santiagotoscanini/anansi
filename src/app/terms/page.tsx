/* eslint-disable i18next/no-literal-string -- legal copy, untranslated by design until reviewed */
import Link from "next/link";

// Public Terms of Service. Sibling of /privacy. Like the privacy page,
// this is starter content based on what Anansi actually does — read it
// before linking publicly and adjust the governing-law clause to your
// jurisdiction. The "Contact" line needs a real email.

export const metadata = {
  title: "Terms · Anansi",
  description: "The agreement between you and Anansi.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 md:py-24" style={{ color: "var(--ink)" }}>
      <header className="mb-12">
        <p
          className="mb-4"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
          }}
        >
          Terms of Service
        </p>
        <h1
          className="mb-4"
          style={{ fontFamily: "var(--font-display)", fontSize: 44, lineHeight: 1.1, color: "var(--ink)" }}
        >
          The agreement between you and Anansi.
        </h1>
        <p style={{ fontFamily: "var(--font-text)", fontSize: 16, lineHeight: 1.65, color: "var(--ink-2)" }}>
          By creating an Anansi account or using the service, you agree to these terms. They are short on purpose; if
          anything below isn&apos;t acceptable to you, please don&apos;t sign up — and if you already have an account,
          you can export your data and close it at any time.
        </p>
        <p
          className="mt-6"
          style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "var(--ink-3)" }}
        >
          Last updated: 2026-05-14
        </p>
      </header>

      <Section title="What Anansi is">
        <p>
          Anansi is a personal operating system for goals, relationships, and values. The service consists of the Anansi
          web application and the underlying account, database, and storage that hold the data you put into it. We may
          add, change, or remove features over time; we&apos;ll try not to break things that matter to you, but this is
          a single-operator product and not all changes will be announced in advance.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          You need an account to use Anansi. You&apos;re responsible for keeping your sign-in credentials private and
          for everything that happens under your account. If you suspect someone else has access, change your password
          immediately and contact us.
        </p>
        <p>You must be at least 16 years old to create an account. One account per person.</p>
      </Section>

      <Section title="Your content is yours">
        <p>
          Everything you write into Anansi belongs to you. We don&apos;t claim ownership of your goals, retrospectives,
          notes about people, photos, or any other content. We hold a strictly limited license to process and display
          your content back to you — to operate the service, in other words — and nothing more. We do not train models
          on your content and do not share it with anyone outside the infrastructure providers listed in our Privacy
          policy.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>Don&apos;t use Anansi to do things that are illegal where you are, or that harm other people. Concretely:</p>
        <ul>
          <li>No uploading content you don&apos;t have the right to upload.</li>
          <li>No probing, scanning, or otherwise attacking the service or its infrastructure.</li>
          <li>No using Anansi to harass, threaten, or target anyone — including in private notes about them.</li>
          <li>No automated scraping or programmatic access outside the documented backup export.</li>
          <li>No attempts to circumvent any account limits, rate limits, or storage quotas the service applies.</li>
        </ul>
        <p>
          We may suspend or terminate accounts that violate these rules. We&apos;ll try to give you a chance to export
          your data first when the situation allows.
        </p>
      </Section>

      <Section title="Service availability">
        <p>
          We aim to keep Anansi available and responsive, but the service is provided &ldquo;as is.&rdquo; We don&apos;t
          commit to a specific uptime, response time, or feature set. Scheduled maintenance, outages upstream of us
          (Supabase, Vercel), and unexpected bugs will happen.
        </p>
      </Section>

      <Section title="Payment, if and when it exists">
        <p>
          Anansi is currently free to use. If we introduce paid tiers in the future, the pricing and what each tier
          includes will be shown before you commit, and you will not be charged retroactively for usage incurred on a
          free tier.
        </p>
      </Section>

      <Section title="Ending the agreement">
        <p>
          You can stop using Anansi at any time. To close your account and have your data deleted, contact us — see the
          Privacy policy for details. We may close your account if you violate these terms or if we discontinue the
          service. If we discontinue, we&apos;ll give as much advance notice as we can and a window to export your data.
        </p>
      </Section>

      <Section title="No warranty">
        <p>
          Anansi is provided without warranties of any kind, express or implied, including merchantability, fitness for
          a particular purpose, and non-infringement. We do our best to keep your data safe, but you should keep your
          own backups using the Profile → Backups export — especially before any major change.
        </p>
      </Section>

      <Section title="Limitation of liability">
        <p>
          To the maximum extent permitted by law, the total liability of Anansi and its operator for any claim arising
          from your use of the service is limited to the greater of (a) the amount you paid for the service in the
          twelve months before the claim arose, or (b) one hundred euros. We will not be liable for indirect,
          incidental, special, consequential, or punitive damages, including loss of profits, data, or goodwill.
        </p>
      </Section>

      <Section title="Governing law">
        <p>
          These terms are governed by the laws of the jurisdiction in which Anansi&apos;s operator is established. The
          specific jurisdiction and any required dispute-resolution clause will be substituted in before paid plans are
          offered; until then, the parties will attempt to resolve any dispute by good-faith negotiation.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          We may update these terms. Material changes will be announced inside the product before they take effect, and
          the &ldquo;Last updated&rdquo; date at the top of this page will move. Continued use after that date means you
          accept the change.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about these terms, account issues, abuse reports: <code>hello@anansi.app</code> (replace once a real
          address is in place).
        </p>
      </Section>

      <nav
        className="mt-16 flex gap-6 pt-8"
        style={{
          borderTop: "1px solid var(--hairline)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
        }}
      >
        <Link href="/">Home</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/login">Sign in</Link>
      </nav>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2
        className="mb-3"
        style={{ fontFamily: "var(--font-display)", fontSize: 22, lineHeight: 1.25, color: "var(--ink)" }}
      >
        {title}
      </h2>
      <div
        className="space-y-3"
        style={{ fontFamily: "var(--font-text)", fontSize: 16, lineHeight: 1.65, color: "var(--ink-2)" }}
      >
        {children}
      </div>
      <style>{`
        section ul { list-style: disc; padding-left: 1.25rem; }
        section li { margin-bottom: 0.5rem; }
        section strong { color: var(--ink); font-weight: 500; }
        section code { font-family: var(--font-mono); font-size: 0.85em; }
        section a { text-decoration: underline; text-underline-offset: 2px; }
      `}</style>
    </section>
  );
}
