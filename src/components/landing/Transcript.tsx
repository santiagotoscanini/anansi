// "Talk to it through Claude", drawn as the conversation itself: what you
// say, the anansi MCP tools Claude calls (real names from
// .golden/mcp-tools.json, real argument names), and what it says back. The
// first exchange writes the very bid the hero's Pulse window shows under
// Upcoming; the second reads the rest of that column back. Keep the two in
// step when either changes.
//
// A picture, like AppDemo: role="img" + a written label. Rows reveal on a
// scroll-linked timeline where the engine has one (`.transcript-row` in
// globals.css); otherwise, and under reduced motion, they are simply there.

import { useTranslation } from 'react-i18next'

type Row = { kind: 'you' | 'claude'; text: string } | { kind: 'tool'; name: string; args?: string }

export default function Transcript() {
  const { t } = useTranslation()
  const rows: Row[] = [
    { kind: 'you', text: t('landing.claude.say1') },
    { kind: 'tool', name: 'list_people' },
    // Tool names and argument keys are wire identifiers; the bid text is the
    // demo's own string so the two pictures agree in either language.
    { kind: 'tool', name: 'create_next_bid', args: `content: "${t('landing.demo.up1Title')}"  dueAt: 2026-09-20` },
    { kind: 'claude', text: t('landing.claude.reply1') },
    { kind: 'you', text: t('landing.claude.say2') },
    { kind: 'tool', name: 'list_upcoming_next_bids' },
    { kind: 'tool', name: 'list_important_dates' },
    { kind: 'claude', text: t('landing.claude.reply2') },
  ]

  return (
    <div
      role="img"
      aria-label={t('landing.claude.transcriptAria')}
      className="overflow-hidden"
      style={{
        background: 'var(--canvas)',
        border: '1px solid var(--hairline-2)',
        borderRadius: 18,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div
        aria-hidden
        className="flex items-center justify-between px-5 py-3"
        style={{
          borderBottom: '1px solid var(--hairline)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
        }}
      >
        <span>{t('landing.claude.transcriptTitle')}</span>
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--moss)' }} />
          {t('landing.claude.connected')}
        </span>
      </div>

      <ol aria-hidden className="transcript-list m-0 list-none px-5 py-5 md:px-7 md:py-6">
        {rows.map((row, i) => (
          <li key={i} className="transcript-row" style={{ ['--i' as string]: i }}>
            {row.kind === 'tool' ? (
              <div
                className="flex flex-wrap items-baseline gap-x-3 py-1 pl-4"
                style={{
                  borderLeft: '1px solid var(--clay)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  lineHeight: 1.6,
                }}
              >
                <span style={{ color: 'var(--clay-deep)' }}>{row.name}</span>
                {row.args && <span style={{ color: 'var(--ink-3)', overflowWrap: 'anywhere' }}>{row.args}</span>}
              </div>
            ) : (
              <div className={i === 0 ? 'pb-3' : 'pt-4 pb-3'}>
                <div
                  className="mb-1"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--ink-3)',
                  }}
                >
                  {row.kind === 'you' ? t('landing.claude.you') : t('landing.claude.claude')}
                </div>
                <p
                  style={{
                    fontFamily: 'var(--font-text)',
                    fontStyle: row.kind === 'you' ? 'italic' : 'normal',
                    fontSize: 17,
                    lineHeight: 1.5,
                    color: row.kind === 'you' ? 'var(--ink)' : 'var(--ink-2)',
                  }}
                >
                  {row.text}
                </p>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
