/* eslint-disable i18next/no-literal-string -- the OAuth consent screen is English-only for v1; revisit when the consent UX moves through the i18n migration alongside the legal pages. */

// Consent UI for the /oauth/authorize route. Plain HTML: the only
// interactivity is two submit buttons inside a regular <form>, so there is no
// useState, no useEffect and no event handler anywhere in it. That is what
// lets the whole consent step work with JavaScript disabled.
//
// Both buttons submit the SAME form to /oauth/authorize/decision, with the
// difference encoded in the `decision` button's `value` attribute. Cookie
// auth is sent automatically by the browser; CSRF defence happens server-side
// via an Origin/Referer header check.

import { AnansiMark } from '~/components/goals/Brand'

interface Props {
  clientName: string
  scope: string
  returnsTo: string
  hiddenFields: Record<string, string | null | undefined>
  userEmail: string
}

export function ConsentScreen({ clientName, scope, returnsTo, hiddenFields, userEmail }: Props) {
  const scopeList = scope.split(/\s+/).filter(Boolean)
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--paper-deep, #f7f3ec)',
        padding: '48px 24px',
        fontFamily: 'var(--font-ui, system-ui, sans-serif)',
        color: 'var(--ink, #1c1815)',
      }}
    >
      <div
        style={{
          maxWidth: 460,
          width: '100%',
          background: 'var(--canvas, #fdfbf6)',
          border: '1px solid var(--hairline-2, rgba(0,0,0,0.08))',
          borderRadius: 14,
          padding: '40px 36px 32px',
          boxShadow: '0 6px 30px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <AnansiMark size={48} />
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display, serif)',
            fontSize: 26,
            lineHeight: 1.25,
            letterSpacing: '-0.015em',
            textAlign: 'center',
            margin: 0,
            marginBottom: 8,
          }}
        >
          Connect <em style={{ fontStyle: 'italic' }}>{clientName}</em>?
        </h1>
        <p
          style={{
            fontSize: 14,
            color: 'var(--ink-2, #4a4540)',
            lineHeight: 1.55,
            textAlign: 'center',
            margin: 0,
            marginBottom: 24,
          }}
        >
          This will let <strong>{clientName}</strong> read and modify your Anansi data on your behalf. Approving sends
          you back to <strong>{returnsTo}</strong>. If you did not start this, cancel.
        </p>

        <div
          style={{
            background: 'var(--paper-deep, #f7f3ec)',
            border: '1px solid var(--hairline, rgba(0,0,0,0.05))',
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 24,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: 'var(--ink-3, #78716c)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 6,
            }}
          >
            Signed in as
          </div>
          <div style={{ fontSize: 14, marginBottom: 14 }}>{userEmail}</div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--ink-3, #78716c)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 6,
            }}
          >
            Requested access
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
            {scopeList.includes('anansi:read') && <li>Read your goals, tasks, people, values, and reflections</li>}
            {scopeList.includes('anansi:write') && <li>Create, update, and delete the same</li>}
          </ul>
        </div>

        <form
          method="POST"
          action="/oauth/authorize/decision"
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          {Object.entries(hiddenFields).map(([k, v]) =>
            v == null ? null : <input key={k} type="hidden" name={k} value={v} />,
          )}
          <button
            type="submit"
            name="decision"
            value="approve"
            style={{
              height: 44,
              borderRadius: 10,
              border: 'none',
              background: 'var(--ink, #1c1815)',
              color: 'var(--canvas, #fdfbf6)',
              fontFamily: 'var(--font-ui, system-ui, sans-serif)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Approve and connect
          </button>
          <button
            type="submit"
            name="decision"
            value="deny"
            style={{
              height: 44,
              borderRadius: 10,
              border: '1px solid var(--hairline-2, rgba(0,0,0,0.08))',
              background: 'transparent',
              color: 'var(--ink-2, #4a4540)',
              fontFamily: 'var(--font-ui, system-ui, sans-serif)',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </form>

        <p
          style={{
            marginTop: 20,
            fontSize: 11,
            color: 'var(--ink-3, #78716c)',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          You can revoke this connection at any time from your account settings.
        </p>
      </div>
    </div>
  )
}
