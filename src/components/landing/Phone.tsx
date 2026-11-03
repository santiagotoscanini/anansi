// "On your iPhone", drawn as the app's pose camera: the 3:4 viewfinder with
// the outline you drew once (head and shoulders, white), last week's picture
// faded underneath (the clay silhouette, a little off so the gap reads), and
// the controls the real screen has: Outline, Last time, Timer, the shutter.
// ios/Packages/AnansiKit/Sources/AnansiFeature/PoseCameraView.swift is the
// screen; keep the chips' wording in step with it.
//
// A picture, like AppDemo and Transcript: role="img" + a written label, and
// nothing inside is focusable.

import { useTranslation } from 'react-i18next'

// One outline, drawn in the frame's own units (75 × 100 = 3:4): the head, the
// neck, the line of the shoulders down to the frame's lower edge.
const BODY = 'M 26 94 C 26 76, 30 70, 37.5 68 C 45 70, 49 76, 49 94'
const SHOULDERS = 'M 8 100 C 9 84, 16 74, 30 70 L 33 64 M 67 100 C 66 84, 59 74, 45 70 L 42 64'

export default function Phone() {
  const { t } = useTranslation()
  const chips = [
    { label: t('landing.iphone.chipOutline'), on: true },
    { label: t('landing.iphone.chipGhost'), on: true },
    { label: t('landing.iphone.chipTimer'), on: false },
  ]

  return (
    <div role="img" aria-label={t('landing.iphone.figureAria')} className="mx-auto w-full max-w-[340px]">
      <div
        aria-hidden
        className="relative overflow-hidden"
        style={{
          aspectRatio: '9 / 19.5',
          background: '#0d0a08',
          borderRadius: 48,
          border: '10px solid #1f1a16',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div
          className="absolute top-2 left-1/2 h-6 w-24 -translate-x-1/2 rounded-full"
          style={{ background: '#000' }}
        />

        <div className="flex h-full flex-col px-3 pt-12 pb-5">
          <div className="mb-3 text-center">
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: '#f3ede6' }}>
              {t('landing.iphone.itemTitle')}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'rgba(243, 237, 230, 0.6)',
              }}
            >
              {t('landing.iphone.lineUp')}
            </div>
          </div>

          <div className="relative overflow-hidden" style={{ aspectRatio: '3 / 4', borderRadius: 14 }}>
            <svg viewBox="0 0 75 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
              <defs>
                <radialGradient id="phone-light" cx="50%" cy="35%" r="75%">
                  <stop offset="0%" stopColor="#5a4a3e" />
                  <stop offset="100%" stopColor="#1d1611" />
                </radialGradient>
              </defs>
              <rect width="75" height="100" fill="url(#phone-light)" />
              {/* Last week's picture, faded: the same pose a little to the left. */}
              <g transform="translate(-2.5 1.5)" opacity="0.38" fill="var(--clay)">
                <ellipse cx="37.5" cy="42" rx="11" ry="14" />
                <path d={`${BODY} Z`} />
                <path d="M 6 100 C 8 82, 16 72, 37.5 69 C 59 72, 67 82, 69 100 Z" />
              </g>
              {/* The outline drawn once, over the live camera. */}
              <g fill="none" stroke="#f3ede6" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round">
                <ellipse cx="37.5" cy="42" rx="11" ry="14" />
                <path d={SHOULDERS} />
              </g>
            </svg>
          </div>

          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {chips.map((chip) => (
              <span
                key={chip.label}
                className="rounded-full px-2.5 py-1"
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: 11,
                  fontWeight: 500,
                  background: chip.on ? 'var(--clay)' : 'rgba(255, 255, 255, 0.15)',
                  color: chip.on ? '#fdf9f4' : '#f3ede6',
                }}
              >
                {chip.label}
              </span>
            ))}
          </div>

          <div className="mx-auto mt-5 flex w-3/4 items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ border: '1.5px solid rgba(243, 237, 230, 0.7)' }} />
            <span className="relative h-1 flex-1 rounded-full" style={{ background: 'rgba(255, 255, 255, 0.2)' }}>
              <span className="absolute inset-y-0 left-0 w-[38%] rounded-full" style={{ background: 'var(--clay)' }} />
              <span
                className="absolute top-1/2 left-[38%] h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ background: '#f3ede6' }}
              />
            </span>
          </div>

          <div className="mt-auto flex justify-center">
            <span
              className="flex h-16 w-16 items-center justify-center rounded-full"
              style={{ border: '4px solid #f3ede6' }}
            >
              <span className="h-12 w-12 rounded-full" style={{ background: '#f3ede6' }} />
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
