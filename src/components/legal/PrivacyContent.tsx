/* eslint-disable i18next/no-literal-string -- legal copy, untranslated by design until reviewed */

// Public privacy policy. Linked from the landing page footer and the
// auth-page legal footer. No client state, no scripts, no analytics tag
// bleed from the rest of the app.
//
// EVERY CLAIM ON THIS PAGE IS TRACEABLE TO CODE OR TO THE DEPLOYMENT.
// It was rewritten on 2026-08-22 to replace a starter document that still
// described Supabase Auth, Supabase Storage, Vercel hosting and Vercel
// analytics, none of which this app has ever used since the Auth.js +
// `files` table + self-hosted migration. If you change any of the
// following, this page goes stale and has to move with it:
//
//   - the auth provider          → src/server/auth/config.ts
//   - where uploaded bytes go    → src/lib/data/schema.ts (`files`)
//   - who may read a file        → src/routes/api.files.$id.ts
//   - outbound browser requests  → any new CDN / font host / SDK
//   - the MCP surface            → src/routes/api.mcp.ts, src/lib/mcp/**
//
// Two things stated here are deliberately unflattering and must not be
// softened without the underlying fact changing first: nothing is
// encrypted at rest, and there is no off-site backup.
//
// The footer links are plain <a> rather than router Links. That is a
// leftover from the dual-stack migration and costs a full page load
// between the three leaf legal pages; harmless, so left alone.
//
// Before accepting paid users or EU traffic, have a lawyer in your
// jurisdiction review it.

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
          Anansi is a place to talk about your life: your goals, the people in it, the patterns you notice in yourself.
          That makes the data inside unusually personal. This page says what is stored, where it sits, what leaves the
          machine, and what happens when you want it gone. It describes this deployment, not an intention.
        </p>
        <p
          className="mt-6"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--ink-3)' }}
        >
          Last updated: 2026-08-22
        </p>
      </header>

      <Section title="Who runs this">
        <p>
          Anansi is not a hosted product and there is no company behind it. This copy runs as a single container on a
          home server, owned and administered by one person, next to that person&apos;s other self-hosted services. Your
          data never reaches a cloud provider&apos;s database, because there is no cloud provider.
        </p>
        <p>
          The honest consequence: the person who administers that server has root on it. They can read the database and
          open your files. Self-hosting removes the vendors, it does not remove the operator. Trusting Anansi means
          trusting whoever handed you the account.
        </p>
      </Section>

      <Section title="What you put in">
        <p>
          Everything you write into Anansi: goals, tasks, weekly retrospectives, the people you reflect on, appreciation
          notes, &ldquo;my needs&rdquo; entries, legacy messages, self-reflection prompts, the Self page, bucket-list
          items, group tags, and any file you attach to a weekly sync.
        </p>
        <p>
          Nothing reads it except the app rendering your own pages. There is no model training on your content, no
          recommendation system, no advertising, and no automated scanning of any kind.
        </p>
      </Section>

      <Section title="Signing in">
        <p>
          Sign-in goes through Pocket ID, an identity provider running on the same server. It is passkey-only. There is
          no password to type and Anansi never receives one. Pocket ID hands back three things: your name, your email
          address, and a stable identifier for your account. Those are what Anansi stores about your identity.
        </p>
        <p>
          Your session is a cookie. It is HttpOnly, encrypted with a key derived from a server-side secret, and it
          carries your user id. There is no session table and no server-side session store.
        </p>
        <p>
          One leftover worth naming: the database still has a password column from an earlier email-and-password mode.
          Where it holds anything it holds a bcrypt hash, never a plaintext password, and it is not used to sign in
          here. Creating an account inside Anansi is closed; accounts come from Pocket ID.
        </p>
      </Section>

      <Section title="Where your data lives">
        <ul>
          <li>
            <strong>Database:</strong> one Postgres database on a cluster shared with the other apps on the same server.
            Your rows are keyed to your user id and every query filters on it.
          </li>
          <li>
            <strong>Files:</strong> your avatar, photos of people, and sync attachments are stored as raw bytes in a
            database table. There is no uploads directory, no object store, no bucket, public or otherwise.
          </li>
          <li>
            <strong>Serving those files:</strong> one route, <code>/api/files/&#123;id&#125;</code>. It requires a
            signed-in session and matches the file against your user id in the same lookup, so a file belonging to
            someone else returns the same not-found response as a file that does not exist. There are no signed URLs and
            no unguessable public links, because there is nothing public to link to.
          </li>
        </ul>
      </Section>

      <Section title="What leaves this machine">
        <p>Two things, and this is the whole list.</p>
        <ul>
          <li>
            <strong>Cloudflare.</strong> Reaching Anansi from outside the house goes through a Cloudflare tunnel.
            Cloudflare terminates TLS at its edge, which means it can see the requests passing through it. On the local
            network the browser talks to the server directly and Cloudflare is not in the path.
          </li>
          <li>
            <strong>jsDelivr.</strong> The emoji picker loads its emoji images from a public CDN the first time you open
            it. That request carries your IP address to a host Anansi does not control. None of your entries go with it.
          </li>
        </ul>
        <p>
          There is no analytics, no telemetry, no error-reporting service, no tag manager, and no advertising code.
          Fonts are bundled into the app and served from the same server as the pages, so opening Anansi does not tell a
          font host that you did.
        </p>
      </Section>

      <Section title="Connecting Claude">
        <p>
          Anansi speaks Model Context Protocol, so you can connect it to a Claude client. If you do, that client reads
          and writes your Anansi data, and whatever it reads travels to Anthropic as part of the conversation. That is
          the feature working as designed, and it is also the largest opening in everything above. It stays closed until
          you connect it.
        </p>
        <p>
          Anansi issues those tokens itself rather than delegating to anyone. An access token lasts an hour, a refresh
          token lasts thirty days and is replaced on every use, and both are stored as hashes rather than as the token.
          Revoking the connection from your Claude client ends the access.
        </p>
      </Section>

      <Section title="Encryption">
        <p>In transit, traffic is TLS, and the session cookie is encrypted on top of that.</p>
        <p>
          At rest, nothing is encrypted. The database is plain Postgres on an unencrypted filesystem, and your uploaded
          files sit as plain bytes in a table with no encryption applied to them. Anyone holding the disks, or holding
          root on the server, can read all of it. This page is not going to imply otherwise.
        </p>
      </Section>

      <Section title="Backups">
        <p>
          The filesystem takes automatic snapshots of the application state: several within the past hour, one an hour
          for a day, one a day for a week. Those snapshots are replicated to a second set of disks inside the same
          machine.
        </p>
        <p>
          That is the entire backup story. There is no off-site copy. One fire, one theft, or one bad command with root
          takes the original and the replica together. The snapshots are not encrypted either.
        </p>
      </Section>

      <Section title="Logs">
        <p>
          Anansi itself logs a handful of lines at startup and nothing per request. It does not log request bodies or
          response bodies, so nothing you write appears in a log.
        </p>
        <p>
          The reverse proxy in front of it writes one line per request: the path, the status code, how long it took,
          your browser&apos;s user agent, your IP address, and the country code Cloudflare attaches. Those lines go to a
          log store on the same server and are deleted after thirty days. The paths carry page names, record ids and
          week dates, never the text of an entry.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          The session cookie that keeps you signed in, plus small preference cookies remembering your language, your
          theme, and your sidebar width. Sign-in briefly sets two more, which the login flow discards when it finishes.
          None of them are used for analytics, advertising, or profiling, so there is no consent banner.
        </p>
      </Section>

      <Section title="Getting your data out">
        <p>
          Profile → Backups produces a single JSON file holding every row Anansi has for you, with your uploaded files
          embedded in it. No request, no queue, no waiting. Importing a file replaces your current data with its
          contents.
        </p>
        <p>Every field you can read on a screen is editable on that screen.</p>
      </Section>

      <Section title="Deletion and retention">
        <p>You can delete any individual entry from the screen it appears on, and that removes the row.</p>
        <p>
          There is no button that deletes your whole account. Everything Anansi stores hangs off your user row and is
          set to cascade from it, so removing that row does remove all of it, but today that is a manual action by
          whoever runs the server. Ask them. Then allow about a week for the snapshots described above to age past it.
        </p>
        <p>
          Nothing expires on its own. Anansi runs no retention timer and no automatic cleanup. What you write stays
          until you or the administrator delete it.
        </p>
      </Section>

      <Section title="Who else sees it">
        <p>
          No one is sent your data for profiling, and none of it is sold or shared with advertisers. The parties who can
          see something are the ones named above: the server&apos;s administrator, Cloudflare for requests arriving from
          outside the house, jsDelivr for the fact that a browser at your IP opened an emoji picker, and Anthropic if
          and only if you connect a Claude client.
        </p>
        <p>
          If a disclosure is ever legally compelled, it will be complied with and, where the law allows, the affected
          user will be told.
        </p>
      </Section>

      <Section title="Children">
        <p>Anansi is not intended for anyone under 16.</p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          When this page changes, the date at the top moves with it. If a change is material you will hear about it
          inside the product before it takes effect. If you do not like it, export first and then ask for the account to
          go.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          There is no support address. Anansi is run by one person and you got your account from them, so that is the
          channel for a deletion request, a data request, or a question about anything on this page.
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
