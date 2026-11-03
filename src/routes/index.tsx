// Public landing page. One argument in six parts:
//
//   1. hero · the claim, the CTA, and the hand-built Pulse window right
//      under it (AppDemo.tsx), so the product is in the first screen
//   2. the web · the one section whose form is the argument: the Ananse
//      Ntontan mark drawn large, real kinds of record on its ring, threads
//      between the ones the app links (Web.tsx)
//   3. on your iPhone · the phone app (ios/) as a scroll-driven story in a
//      sticky stage (ScanStory.tsx, timeline in scan-story.ts): a note typed,
//      the pose camera scanning a point cloud, captures flying onto the web
//   4. with Claude · the MCP connector, shown as the conversation itself
//      (Transcript.tsx)
//   5. questions · cost, access, privacy, data out. Every answer is checked
//      against code or the legal pages; keep them in step
//   6. coda · the inverted bookend, then a short colophon
//
// The 2026-10 pass cut the manifesto, the six-surface card grid (it
// restated the demo's sidebar), the "whispers" testimonials (they were
// invented) and the separate "why a spider" chapter (folded into the web).
// Do not bring back quotes from people who do not exist.
//
// Auth-aware: the CTAs flip between "Start writing" and "Go to your app".
// The session is resolved in the route loader, so SSR paints the right one.
//
// i18n: prose lives under `landing.*` in src/i18n/locales/{en,es}.json.
// Sentences with a brand-emphasis span use <Trans> with a named `em`
// placeholder so Spanish can reorder freely.

import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { sessionQueryOptions } from '~/lib/queries/session'
import { AnansiMark, BrandLockup } from '~/components/goals/Brand'
import AppDemo from '~/components/landing/AppDemo'
import ScanStory from '~/components/landing/ScanStory'
import Transcript from '~/components/landing/Transcript'
import Web from '~/components/landing/Web'

export const Route = createFileRoute('/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(sessionQueryOptions()),
  component: LandingPage,
})

const FAQ_KEYS = ['free', 'access', 'privacy', 'nudges', 'export', 'iphone', 'claude'] as const

function LandingPage() {
  const { data: session } = useSuspenseQuery(sessionQueryOptions())
  const isAuthenticated = session !== null
  const { t } = useTranslation()
  const ctaHref = isAuthenticated ? '/app' : '/register'
  const ctaLabel = isAuthenticated ? t('landing.cta.signedIn') : t('landing.cta.signedOut')
  const loginHref = isAuthenticated ? '/app' : '/login'
  const loginLabel = isAuthenticated ? t('landing.nav.goToApp') : t('landing.nav.logIn')

  return (
    <div style={{ background: 'var(--paper)', color: 'var(--ink)', minHeight: '100vh' }}>
      <nav className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-6 md:px-16">
        <BrandLockup size={26} />
        <div className="flex items-center gap-4 md:gap-7">
          <a href="#web" className="hidden text-sm md:inline" style={{ color: 'var(--ink-2)' }}>
            {t('landing.nav.web')}
          </a>
          <a href="#iphone" className="hidden text-sm md:inline" style={{ color: 'var(--ink-2)' }}>
            {t('landing.nav.iphone')}
          </a>
          <a href="#claude" className="hidden text-sm md:inline" style={{ color: 'var(--ink-2)' }}>
            {t('landing.nav.claude')}
          </a>
          <a href="#faq" className="hidden text-sm md:inline" style={{ color: 'var(--ink-2)' }}>
            {t('landing.nav.faq')}
          </a>
          <Link
            to={loginHref}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium"
            style={{ background: 'var(--ink)', color: 'var(--paper)' }}
          >
            {loginLabel}
            <ArrowRight size={11} />
          </Link>
        </div>
      </nav>

      <main>
        {/* ============ HERO + the product ============ */}
        <section className="relative overflow-hidden px-6 pt-8 md:px-16 md:pt-12">
          <div
            aria-hidden
            className="pointer-events-none absolute hidden md:block"
            style={{ top: -120, right: -180, opacity: 0.045, color: 'var(--ink)' }}
          >
            <AnansiMark size={760} strokeWidth={1} />
          </div>

          <div className="relative mx-auto max-w-[1280px]">
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(44px, 7.4vw, 104px)',
                fontWeight: 400,
                lineHeight: 0.98,
                letterSpacing: '-0.03em',
                maxWidth: 1080,
                textWrap: 'balance',
              }}
            >
              <Trans i18nKey="landing.hero.title" components={{ em: <BrandEm /> }} />
            </h1>

            <p
              className="landing-rise mt-7 md:mt-9"
              style={{
                ['--rise-delay' as string]: '80ms',
                fontFamily: 'var(--font-text)',
                fontStyle: 'italic',
                fontSize: 'clamp(20px, 2vw, 25px)',
                lineHeight: 1.35,
                color: 'var(--ink-2)',
                maxWidth: 640,
              }}
            >
              {t('landing.hero.lead')}
            </p>
            <div
              className="landing-rise mt-8 flex flex-wrap items-center gap-x-7 gap-y-4"
              style={{ ['--rise-delay' as string]: '160ms' }}
            >
              <Link
                to={ctaHref}
                className="inline-flex h-[50px] w-fit items-center gap-2.5 rounded-full px-7 text-sm font-medium"
                style={{ background: 'var(--ink)', color: 'var(--paper)' }}
              >
                {ctaLabel}
                <ArrowRight size={14} />
              </Link>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-3)',
                }}
              >
                {t('landing.hero.terms')}
              </span>
            </div>

            <div className="landing-rise mt-12 md:mt-14" style={{ ['--rise-delay' as string]: '240ms' }}>
              <AppDemo />
              <p
                className="mt-5"
                style={{
                  fontFamily: 'var(--font-text)',
                  fontStyle: 'italic',
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: 'var(--ink-3)',
                  maxWidth: 720,
                }}
              >
                <span className="mr-2.5 inline-block h-px w-4 align-middle" style={{ background: 'var(--ink-4)' }} />
                {t('landing.demo.caption')}
              </p>
            </div>
          </div>
        </section>

        {/* ============ THE WEB ============ */}
        <section id="web" className="px-6 pt-24 pb-24 md:px-16 md:pt-32 md:pb-32">
          <div className="mx-auto grid max-w-[1280px] gap-14 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-16">
            <div className="md:pt-6">
              <Eyebrow>{t('landing.web.eyebrow')}</Eyebrow>
              <h2 className="mt-6" style={h2Style}>
                <Trans i18nKey="landing.web.title" components={{ em: <BrandEm /> }} />
              </h2>
              <p className="mt-7" style={bodyStyle}>
                {t('landing.web.body1')}
              </p>
              <p className="mt-5" style={bodyStyle}>
                {t('landing.web.body2')}
              </p>
              <p
                className="mt-8 pt-5"
                style={{
                  borderTop: '1px solid var(--hairline)',
                  fontFamily: 'var(--font-text)',
                  fontStyle: 'italic',
                  fontSize: 15,
                  lineHeight: 1.55,
                  color: 'var(--ink-3)',
                }}
              >
                <Trans i18nKey="landing.web.name" components={{ em: <BrandEm /> }} />
              </p>
            </div>
            <Web />
          </div>
        </section>

        {/* ============ ON YOUR IPHONE ============ */}
        <ScanStory />

        {/* ============ WITH CLAUDE ============ */}
        <section
          id="claude"
          className="px-6 py-24 md:px-16 md:py-32"
          style={{ background: 'var(--paper-deep)', borderBlock: '1px solid var(--hairline)' }}
        >
          <div className="mx-auto grid max-w-[1280px] gap-12 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-16">
            <div>
              <Eyebrow>{t('landing.claude.eyebrow')}</Eyebrow>
              <h2 className="mt-6" style={h2Style}>
                {t('landing.claude.title')}
              </h2>
              <p className="mt-7" style={bodyStyle}>
                {t('landing.claude.intro')}
              </p>
              <p className="mt-5" style={{ ...bodyStyle, fontSize: 15, color: 'var(--ink-3)' }}>
                {t('landing.claude.how')}
              </p>
            </div>
            <Transcript />
          </div>
        </section>

        {/* ============ QUESTIONS ============ */}
        <section id="faq" className="px-6 py-24 md:px-16 md:py-32">
          <div className="mx-auto grid max-w-[1280px] gap-12 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-16">
            <div className="self-start md:sticky md:top-12">
              <Eyebrow>{t('landing.faq.eyebrow')}</Eyebrow>
              <h2 className="mt-6" style={h2Style}>
                {t('landing.faq.title')}
              </h2>
            </div>
            <dl className="m-0" style={{ borderTop: '1px solid var(--hairline-2)' }}>
              {FAQ_KEYS.map((key) => (
                <div
                  key={key}
                  className="grid gap-2 py-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-8"
                  style={{ borderBottom: '1px solid var(--hairline)' }}
                >
                  <dt
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 24,
                      lineHeight: 1.2,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {t(`landing.faq.items.${key}.q`)}
                  </dt>
                  <dd className="m-0" style={{ ...bodyStyle, fontSize: 17 }}>
                    {key === 'privacy' ? (
                      <Trans
                        i18nKey="landing.faq.items.privacy.a"
                        components={{
                          a: <Link to="/privacy" className="underline underline-offset-4" />,
                        }}
                      />
                    ) : (
                      t(`landing.faq.items.${key}.a`)
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ============ CODA ============ */}
        <section className="px-6 pb-24 md:px-16">
          <div className="mx-auto max-w-[1280px]">
            <div
              className="relative overflow-hidden px-8 py-20 md:px-18 md:py-24"
              style={{ background: 'var(--surface-inverse)', color: 'var(--on-inverse)', borderRadius: 32 }}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute"
                style={{ top: -100, right: -100, opacity: 0.08, color: 'var(--on-inverse)' }}
              >
                <AnansiMark size={480} strokeWidth={1} />
              </div>
              <div className="relative">
                <h2
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'clamp(40px, 7vw, 84px)',
                    fontWeight: 400,
                    lineHeight: 1.0,
                    letterSpacing: '-0.02em',
                    maxWidth: 920,
                    textWrap: 'balance',
                  }}
                >
                  <Trans
                    i18nKey="landing.coda.title"
                    components={{
                      br: <br />,
                      em: (
                        <span style={{ fontFamily: 'var(--font-brand)', fontStyle: 'italic', color: 'var(--clay)' }} />
                      ),
                    }}
                  />
                </h2>
                <p
                  className="mt-7"
                  style={{
                    fontFamily: 'var(--font-text)',
                    fontStyle: 'italic',
                    fontSize: 'clamp(19px, 1.8vw, 22px)',
                    lineHeight: 1.4,
                    color: 'color-mix(in oklch, var(--on-inverse) 78%, transparent)',
                    maxWidth: 620,
                  }}
                >
                  {t('landing.coda.body')}
                </p>
                <div className="mt-12 flex flex-wrap items-center gap-3.5">
                  <Link
                    to={ctaHref}
                    className="inline-flex h-[52px] items-center gap-2.5 rounded-full px-7 text-sm font-medium"
                    style={{ background: 'var(--clay)', color: 'var(--paper)' }}
                  >
                    {ctaLabel}
                    <ArrowRight size={14} />
                  </Link>
                  {!isAuthenticated && (
                    <Link
                      to="/login"
                      className="inline-flex h-[52px] items-center gap-2.5 rounded-full px-7 text-sm font-medium"
                      // On --surface-inverse, so both values come from --on-inverse:
                      // --paper flips to near-black in dark mode and vanished here.
                      style={{
                        border: '1px solid color-mix(in oklch, var(--on-inverse) 18%, transparent)',
                        color: 'var(--on-inverse)',
                      }}
                    >
                      {t('landing.coda.haveAccount')}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ============ COLOPHON ============ */}
      <footer
        className="mx-auto grid max-w-[1440px] grid-cols-1 gap-10 px-6 py-12 md:grid-cols-[1.6fr_1fr_1fr] md:px-16"
        style={{ borderTop: '1px solid var(--hairline-2)' }}
      >
        <div>
          <div className="mb-3.5">
            <BrandLockup size={22} />
          </div>
          <p
            style={{
              fontFamily: 'var(--font-text)',
              fontStyle: 'italic',
              fontSize: 14,
              color: 'var(--ink-3)',
              lineHeight: 1.55,
              maxWidth: 360,
            }}
          >
            {t('landing.footer.tagline')}
          </p>
        </div>
        <ColophonCol heading={t('landing.footer.headingPages')}>
          {/* eslint-disable-next-line i18next/no-literal-string -- legal page links, EN-only until reviewed */}
          <Link to="/privacy">Privacy</Link>
          {/* eslint-disable-next-line i18next/no-literal-string -- legal page links, EN-only until reviewed */}
          <Link to="/terms">Terms</Link>
        </ColophonCol>
        {/* Font family names are proper nouns, left untranslated by design. */}
        <ColophonCol heading={t('landing.footer.headingSetIn')}>
          {/* eslint-disable-next-line i18next/no-literal-string -- typeface name (proper noun) */}
          <span>Instrument Serif</span>
          {/* eslint-disable-next-line i18next/no-literal-string -- typeface name (proper noun) */}
          <span>Newsreader</span>
          {/* eslint-disable-next-line i18next/no-literal-string -- typeface name (proper noun) */}
          <span>Cormorant Garamond</span>
          {/* eslint-disable-next-line i18next/no-literal-string -- typeface name (proper noun) */}
          <span>Geist · Geist Mono</span>
        </ColophonCol>
        <div
          className="col-span-full flex flex-wrap items-center justify-between gap-3 pt-6"
          style={{
            borderTop: '1px solid var(--hairline)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.08em',
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
          }}
        >
          <span>{t('landing.footer.copy', { year: new Date().getFullYear() })}</span>
          <span>{t('landing.footer.lineage')}</span>
        </div>
      </footer>
    </div>
  )
}

// ---- Shared type styles ----

const h2Style: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'clamp(38px, 5vw, 64px)',
  fontWeight: 400,
  lineHeight: 1.02,
  letterSpacing: '-0.02em',
  textWrap: 'balance',
}

const bodyStyle: React.CSSProperties = {
  fontFamily: 'var(--font-text)',
  fontSize: 19,
  lineHeight: 1.6,
  color: 'var(--ink-2)',
  maxWidth: 520,
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-3.5"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'var(--ink-3)',
      }}
    >
      <span className="inline-block h-px w-7" style={{ background: 'currentColor' }} />
      {children}
    </span>
  )
}

function BrandEm({ children }: { children?: React.ReactNode }) {
  return (
    <em
      style={{
        fontFamily: 'var(--font-brand)',
        fontStyle: 'italic',
        fontWeight: 500,
        color: 'var(--clay-deep)',
        letterSpacing: '-0.01em',
      }}
    >
      {children}
    </em>
  )
}

function ColophonCol({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div>
      <h6
        className="mb-3.5"
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 10,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
          fontWeight: 500,
        }}
      >
        {heading}
      </h6>
      <div className="flex flex-col gap-1.5" style={{ fontSize: 13, color: 'var(--ink-2)' }}>
        {children}
      </div>
    </div>
  )
}
