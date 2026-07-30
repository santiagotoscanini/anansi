/* eslint-disable i18next/no-literal-string -- legal copy, untranslated by design until reviewed */

// Public privacy policy. Linked from the landing page footer and the
// auth-page legal footer. No client state, no scripts, no analytics tag
// bleed from the rest of the app.
//
// Rendered by BOTH stacks during the TanStack Start migration —
// src/app/privacy/page.tsx (Next) and src/routes/privacy.tsx (Start) are
// both one-line wrappers around this component, so the two render byte-
// identical output and the screenshot diff stays meaningful. That is also
// why the footer links below are plain <a> rather than a router Link: it is
// the one element that has no shared spelling across the two routers. The
// cost is a full page load between three leaf legal pages.
//
// This is a STARTER document. Note that its description of the
// infrastructure is now WRONG — it still names Supabase Auth, Supabase
// Storage and Vercel, none of which the app uses since the Auth.js + `files`
// table + self-hosted migration. Fixing the copy is a content decision, not
// a migration one, so it is deliberately left alone here.
// Before accepting paid users or EU traffic, have a lawyer in your
// jurisdiction review it. The "Contact" line is the only place where a
// concrete email address should be substituted in — search for
// `privacy@…` to find it.

export const privacyMetadata = {
  title: 'Privacy · Anansi',
  description: 'How Anansi handles your data.',
}

export default function PrivacyContent() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 md:py-24" style={{ color: 'var(--ink)' }}>
      <header className="mb-12">
        <p
          className="mb-4"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
          }}
        >
          Privacy
        </p>
        <h1
          className="mb-4"
          style={{ fontFamily: 'var(--font-display)', fontSize: 44, lineHeight: 1.1, color: 'var(--ink)' }}
        >
          What Anansi does with your data.
        </h1>
        <p style={{ fontFamily: 'var(--font-text)', fontSize: 16, lineHeight: 1.65, color: 'var(--ink-2)' }}>
          Anansi is a place to talk about your life — your goals, the people in it, the patterns you notice in yourself.
          That makes the data inside unusually personal. This page explains exactly what we keep, where it lives, and
          what you can do about it.
        </p>
        <p
          className="mt-6"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--ink-3)' }}
        >
          Last updated: 2026-05-14
        </p>
      </header>

      <Section title="What you put in">
        <p>
          Everything you write into Anansi — goals, tasks, weekly retrospectives, people you reflect on, appreciation
          notes, &ldquo;my needs&rdquo; entries, legacy messages, self-reflection prompts, the Self page&apos;s living
          portrait, bucket-list items, group tags, and any files you attach to a weekly sync.
        </p>
        <p>
          We don&apos;t look at it. There is no human review of your content, no model training on your content, and no
          advertising or recommendation system built on top of it.
        </p>
      </Section>

      <Section title="What we collect automatically">
        <ul>
          <li>
            <strong>Account identity</strong> — your name, email address, and a hashed password (stored and verified by
            our authentication provider, Supabase Auth; we never see the plaintext).
          </li>
          <li>
            <strong>Session cookies</strong> — HttpOnly cookies that keep you signed in. Strictly necessary for the app
            to work.
          </li>
          <li>
            <strong>Server logs</strong> — request paths, status codes, and approximate timing. We do not log request
            bodies or response bodies. Logs are retained for operational debugging and rotated.
          </li>
          <li>
            <strong>Aggregate analytics</strong> — page-view counts and rough performance metrics via Vercel Web
            Analytics and Vercel Speed Insights. Both are cookieless. Neither identifies you personally to us.
          </li>
        </ul>
      </Section>

      <Section title="Where your data lives">
        <ul>
          <li>
            <strong>Database</strong> — Postgres managed by Supabase, in the region selected for our project.
          </li>
          <li>
            <strong>File uploads</strong> — your avatar, photos of people, and weekly-sync attachments live in Supabase
            Storage in the same region. Avatars and people photos are stored in public buckets behind unguessable URLs
            scoped to your user id; sync attachments live in a private bucket and are served via short-lived signed URLs
            (1 hour).
          </li>
          <li>
            <strong>Hosting</strong> — the Anansi web app is served by Vercel.
          </li>
          <li>
            <strong>Email</strong> — sign-up confirmations, password resets, and email-change confirmations are sent
            through Supabase&apos;s email provider.
          </li>
        </ul>
        <p>
          Encryption: traffic to and from Anansi uses TLS. Data at rest in Supabase and Vercel is encrypted by those
          providers under their default policies.
        </p>
      </Section>

      <Section title="Who else sees it">
        <p>
          The list of parties with access to your data is short and listed above: Supabase (database, auth, storage,
          email) and Vercel (hosting, analytics). We do not sell your data, share it with advertisers, or send it to
          third parties for profiling.
        </p>
        <p>
          If we are ever legally compelled to disclose data — a court order, a valid subpoena — we will comply and,
          where the law allows, notify the affected user.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          Anansi sets only cookies that are strictly necessary to operate the service: the HttpOnly session cookies
          issued by Supabase Auth, and a small cookie remembering your interface language preference. We do not use
          cookies for analytics, advertising, or profiling. Because all of our cookies are essential, no consent banner
          is shown.
        </p>
      </Section>

      <Section title="Your rights">
        <ul>
          <li>
            <strong>Export</strong> — Profile → Backups exports every row we hold about you, plus your binary
            attachments, as a single JSON file. No request needed.
          </li>
          <li>
            <strong>Correct or update</strong> — every field you can read on a screen is editable on that screen.
          </li>
          <li>
            <strong>Delete</strong> — you can delete individual entries at any time. To delete your entire account and
            all associated data, contact us (see below). Account deletion is irreversible and removes your database rows
            and storage objects within a few days of the request.
          </li>
        </ul>
        <p>
          Depending on where you live (the EU, the UK, California, and others), you may have additional rights —
          including the right to object, the right to data portability, and the right to lodge a complaint with your
          local data protection authority. The export and delete paths above are intended to satisfy portability and
          erasure requests; for anything else, contact us.
        </p>
      </Section>

      <Section title="Children">
        <p>
          Anansi is not intended for children under 16. If you believe a child has signed up, contact us and we&apos;ll
          remove the account.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          Material changes will be announced inside the product before they take effect, and the &ldquo;Last
          updated&rdquo; date at the top of this page will move. Continued use after that date means you accept the
          change. If you don&apos;t, you can export and delete your account first.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Privacy questions, deletion requests, data subject access requests: <code>privacy@anansi.app</code> (replace
          once a real address is in place).
        </p>
      </Section>

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
        <a href="/">Home</a>
        <a href="/terms">Terms</a>
        <a href="/login">Sign in</a>
      </nav>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2
        className="mb-3"
        style={{ fontFamily: 'var(--font-display)', fontSize: 22, lineHeight: 1.25, color: 'var(--ink)' }}
      >
        {title}
      </h2>
      <div
        className="space-y-3"
        style={{ fontFamily: 'var(--font-text)', fontSize: 16, lineHeight: 1.65, color: 'var(--ink-2)' }}
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
  )
}
