// The landing page's "look inside" window — a hand-built, to-scale drawing
// of the Pulse screen, NOT a screenshot. Same technique as hermes/santree:
// the content is authored at a fixed 1280×800 desktop canvas and scaled as
// one unit by pure CSS (`.demo-fit` / `.demo-canvas` in globals.css — a
// container query divides the frame's width by the design width, so there
// is no measurement, no hook, and no hydration step).
//
// The window chrome (traffic lights + mono title strip) sits OUTSIDE the
// scaled canvas on purpose: it stays 1px-crisp at every scale, and it
// survives the phone treatment — below `sm` the canvas stops shrinking and
// starts cropping (see `--demo-focus`), which would otherwise slice the
// title bar mid-word.
//
// The result is a PICTURE: role="img" with a written aria-label, pointer
// events disabled inside, spans instead of buttons, so nothing here is
// mistaken for the app. Layout, spacing and row anatomy are copied from
// the real AppShell + Pulse (goldens: .golden/screens/pulse-{light,dark}.png);
// the journal content is invented. Chrome labels reuse the app's own
// `dashboard.*` / `pulse.*` keys — the mock speaks whichever language the
// page does, and can't drift from the real nav. Everything invented lives
// under `landing.demo.*` in both locale files.
//
// Colors are exclusively the app's own CSS vars, so the window renders the
// real light theme on the light landing and the real dark theme on the dark
// one — the same flip the goldens document. Even the traffic lights are
// tokens (--rust / --amber / --moss): anansi happens to own the exact triad.

import {
  Activity,
  Calendar,
  CalendarDays,
  Check,
  ChevronRight,
  ChevronUp,
  ChevronsLeft,
  Gift,
  Hourglass,
  ImagePlus,
  ListChecks,
  ListTodo,
  Mountain,
  Network,
  Palette,
  Plus,
  Target,
  Trophy,
  UserCircle2,
  Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BrandLockup } from '~/components/goals/Brand'

// Design-canvas geometry. Width matches the app's own desktop baseline;
// SIDEBAR_W is the app's SIDEBAR_DEFAULT_PX (224). Height is tuned so the
// sidebar shows the whole nav (through the Groups rows) and the third
// prompt card crops at the bottom edge, the way a real screenshot would.
const CANVAS_W = 1280
const CANVAS_H = 880
const SIDEBAR_W = 224
// Phone crop starts just past the sidebar: greeting + prompts lead.
const PHONE_FOCUS = 234

export default function AppDemo() {
  const { t } = useTranslation()
  return (
    <div
      role="img"
      aria-label={t('landing.demo.ariaLabel')}
      className="demo-frame relative w-full overflow-hidden rounded-2xl"
      style={{ background: 'var(--canvas)' }}
    >
      {/* Title strip — unscaled, stays crisp at every width. */}
      <div
        aria-hidden
        className="flex h-9 items-center gap-2.5 px-4"
        style={{ background: 'var(--paper-deep)', borderBottom: '1px solid var(--hairline)' }}
      >
        <span className="flex gap-[7px]">
          <span className="h-[11px] w-[11px] rounded-full" style={{ background: 'var(--rust)' }} />
          <span className="h-[11px] w-[11px] rounded-full" style={{ background: 'var(--amber)' }} />
          <span className="h-[11px] w-[11px] rounded-full" style={{ background: 'var(--moss)' }} />
        </span>
        <span
          className="flex-1 truncate text-center"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em', color: 'var(--ink-3)' }}
        >
          {t('landing.demo.windowTitle')}
        </span>
        <span className="w-[53px]" />
      </div>

      {/* The scaling box — aspect-locked window onto the fixed canvas. */}
      <div
        className="demo-fit relative w-full overflow-hidden"
        style={{
          ['--demo-w' as string]: CANVAS_W,
          ['--demo-h' as string]: CANVAS_H,
          ['--demo-focus' as string]: PHONE_FOCUS,
        }}
      >
        <div
          aria-hidden
          className="demo-canvas pointer-events-none flex select-none"
          style={{ width: CANVAS_W, height: CANVAS_H, background: 'var(--paper)', color: 'var(--ink)' }}
        >
          <DemoSidebar />
          <DemoPulse />
        </div>
      </div>
    </div>
  )
}

// ---- Sidebar — the real AppShell nav, drawn at rest ----

function DemoSidebar() {
  const { t } = useTranslation()
  return (
    <aside
      className="flex h-full shrink-0 flex-col"
      style={{ width: SIDEBAR_W, background: 'var(--paper-deep)', borderRight: '1px solid var(--hairline)' }}
    >
      <div className="flex items-center justify-between px-5 py-5">
        <BrandLockup size={20} />
        <ChevronsLeft className="h-4 w-4" style={{ color: 'var(--ink-3)' }} />
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-hidden px-3">
        <NavRow icon={Activity} label={t('dashboard.nav.pulse')} active />

        <SectionLabel>{t('dashboard.sections.compass')}</SectionLabel>
        <NavRow icon={UserCircle2} label={t('dashboard.nav.self')} />
        <NavRow icon={Palette} label={t('dashboard.nav.values')} />
        <NavRow icon={Mountain} label={t('dashboard.nav.bucket')} />

        <SectionLabel>{t('dashboard.sections.goals')}</SectionLabel>
        <NavRow icon={Target} label={t('dashboard.nav.objectives')} />
        <NavRow icon={Hourglass} label={t('dashboard.nav.horizons')} />
        <NavRow icon={ListTodo} label={t('dashboard.nav.tasks')} />
        <NavRow icon={Trophy} label={t('dashboard.nav.progress')} />

        <SectionLabel>{t('dashboard.sections.sync')}</SectionLabel>
        <NavRow icon={Calendar} label={t('dashboard.nav.sync')} />
        <NavRow icon={ListChecks} label={t('dashboard.nav.trackingItems')} />

        <SectionLabel>{t('dashboard.sections.connections')}</SectionLabel>
        <NavRow icon={Users} label={t('dashboard.nav.people')} count={5} />
        <NavRow icon={Network} label={t('dashboard.nav.relationships')} />

        <div className="mt-4 mb-1 flex items-center justify-between px-2">
          <span className="text-[10px] font-medium tracking-[0.12em] uppercase" style={{ color: 'var(--ink-3)' }}>
            {t('dashboard.sections.groups')}
          </span>
          <Plus className="h-3.5 w-3.5" style={{ color: 'var(--ink-3)' }} />
        </div>
        <GroupRow label={t('dashboard.uncategorized')} count={1} />
        <GroupRow label={t('landing.demo.groupFamily')} count={3} dotColor="var(--clay)" />
      </nav>

      {/* User pill */}
      <div className="px-3 py-3" style={{ borderTop: '1px solid var(--hairline)' }}>
        <div className="flex items-center gap-3 px-2 py-2">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px]"
            style={{ background: 'var(--ink)', color: 'var(--paper)' }}
          >
            {t('landing.demo.userInitial')}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px]" style={{ color: 'var(--ink)' }}>
              {t('landing.demo.userName')}
            </span>
            <span className="block truncate text-[10px]" style={{ color: 'var(--ink-3)' }}>
              {t('landing.demo.userEmail')}
            </span>
          </span>
          <ChevronUp className="h-4 w-4 shrink-0" style={{ color: 'var(--ink-3)' }} />
        </div>
      </div>
    </aside>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mt-4 mb-1 px-2 text-[10px] font-medium tracking-[0.12em] uppercase"
      style={{ color: 'var(--ink-3)' }}
    >
      {children}
    </div>
  )
}

function NavRow({
  icon: Icon,
  label,
  active = false,
  count,
}: {
  icon: typeof Target
  label: string
  active?: boolean
  count?: number
}) {
  return (
    <span
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px]"
      style={{
        color: active ? 'var(--clay-deep)' : 'var(--ink-2)',
        background: active ? 'var(--clay-soft)' : 'transparent',
        fontWeight: active ? 500 : 400,
      }}
    >
      <Icon className="h-[15px] w-[15px] shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: active ? 'var(--clay-deep)' : 'var(--ink-3)',
          }}
        >
          {count}
        </span>
      )}
    </span>
  )
}

function GroupRow({ label, count, dotColor }: { label: string; count: number; dotColor?: string }) {
  return (
    <span
      className="flex items-center justify-between rounded-lg px-3 py-2 text-[13px]"
      style={{ color: 'var(--ink-2)' }}
    >
      <span className="flex items-center gap-3">
        <span
          className="h-2 w-2 rounded-full"
          style={dotColor ? { backgroundColor: dotColor } : { border: '1px solid var(--ink-4)' }}
        />
        <span>{label}</span>
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)' }}>{count}</span>
    </span>
  )
}

// ---- Main pane — the Pulse screen, mid-week, mostly filled in ----

function DemoPulse() {
  const { t } = useTranslation()
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {/* Pulse hero — eyebrow + greeting + italic subtitle, progress right */}
      <header className="px-12 pt-14 pb-8" style={{ borderBottom: '1px solid var(--hairline)' }}>
        <div className="flex flex-wrap items-baseline justify-between gap-6">
          <div className="min-w-0 flex-1">
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: '0.08em',
                color: 'var(--ink-3)',
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              {t('landing.demo.eyebrowDate')}
            </div>
            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 52,
                fontWeight: 400,
                lineHeight: 1.18,
                letterSpacing: '-0.02em',
                color: 'var(--ink)',
                paddingBottom: 8,
              }}
            >
              {t('pulse.greetingAfternoon')}, <span className="brand-em">{t('pulse.greetingSuffix')}</span>
            </h3>
            <p
              style={{
                fontFamily: 'var(--font-text)',
                fontStyle: 'italic',
                fontSize: 19,
                color: 'var(--ink-2)',
                marginTop: 12,
                lineHeight: 1.4,
                maxWidth: 580,
              }}
            >
              {t('pulse.subtitle')}
            </p>
          </div>
          <div
            className="flex items-center gap-3"
            style={{ color: 'var(--ink-3)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
          >
            <span>
              <span style={{ color: 'var(--ink)' }}>{4}</span>/{5} {t('pulse.filledProgress')}
            </span>
            <span style={{ width: 96, height: 4, background: 'var(--vellum)', borderRadius: 99, overflow: 'hidden' }}>
              <span style={{ display: 'block', width: '80%', height: '100%', background: 'var(--clay)' }} />
            </span>
            <span>{80}%</span>
          </div>
        </div>
      </header>

      {/* 2-column body — 1.4fr / 1fr, same split as the real Pulse. */}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* LEFT — the week so far */}
        <section className="overflow-hidden px-10 py-7" style={{ borderRight: '1px solid var(--hairline)' }}>
          <div className="mb-4 flex items-baseline justify-between">
            <SecLabel>{t('pulse.weekSoFar')}</SecLabel>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>
              {t('pulse.autoSaved')}
            </span>
          </div>
          <div className="space-y-3">
            <PromptCard
              title={t('landing.demo.prompt1Title')}
              tag={t('landing.demo.prompt1Tag')}
              hint={t('landing.demo.prompt1Hint')}
              body={t('landing.demo.prompt1Body')}
              withAttach
            />
            <PromptCard
              title={t('landing.demo.prompt2Title')}
              tag={t('landing.demo.prompt2Tag')}
              hint={t('landing.demo.prompt2Hint')}
              body={t('landing.demo.prompt2Body')}
            />
            {/* Third card crops at the canvas edge — a real screenshot would too. */}
            <PromptCard
              title={t('landing.demo.prompt3Title')}
              tag={t('landing.demo.prompt3Tag')}
              hint={t('landing.demo.prompt3Hint')}
              body={t('landing.demo.prompt3Body')}
            />
          </div>
        </section>

        {/* RIGHT — Upcoming + On the horizon, on paper-deep */}
        <aside className="overflow-hidden px-8 py-7" style={{ background: 'var(--paper-deep)' }}>
          <div className="mb-2 flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5" style={{ color: 'var(--ink-3)' }} />
            <SecLabel>{t('pulse.upcoming')}</SecLabel>
          </div>
          <p
            className="mb-4"
            style={{ fontFamily: 'var(--font-text)', fontStyle: 'italic', fontSize: 13, color: 'var(--ink-3)' }}
          >
            {t('pulse.upcomingHelp')}
          </p>
          <ul className="m-0 list-none p-0">
            <UpcomingRow
              kind="bid"
              title={t('landing.demo.up1Title')}
              person={t('landing.demo.up1Person')}
              when={t('pulse.inDays', { count: 3 })}
              tone="clay"
            />
            <UpcomingRow
              kind="date"
              title={t('landing.demo.up2Title')}
              suffix={t('pulse.turning', { n: 70 })}
              person={t('landing.demo.up2Person')}
              when={t('pulse.inDays', { count: 11 })}
            />
            <UpcomingRow
              kind="bid"
              title={t('landing.demo.up3Title')}
              person={t('landing.demo.up3Person')}
              when={t('pulse.inDays', { count: 12 })}
            />
            <UpcomingRow
              kind="bid"
              title={t('landing.demo.up4Title')}
              person={t('landing.demo.up4Person')}
              when={t('pulse.inDays', { count: 19 })}
              last
            />
          </ul>

          <div className="mt-8">
            <div className="mb-3 flex items-center gap-2">
              <Hourglass className="h-3.5 w-3.5" style={{ color: 'var(--ink-3)' }} />
              <SecLabel>{t('pulse.onTheHorizon')}</SecLabel>
            </div>
            <div
              style={{
                background: 'var(--canvas)',
                border: '1px solid var(--hairline)',
                borderRadius: 14,
                padding: 14,
                boxShadow: 'var(--shadow-sm)',
                marginBottom: 8,
              }}
            >
              <div className="mb-2 flex items-baseline justify-between">
                <span
                  className="inline-flex items-center gap-2"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: 'var(--clay)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--clay)' }} />
                  {t('pulse.thisMonth')}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-2)' }}>{2}</span>
              </div>
              <HorizonRow emoji="🌊" title={t('landing.demo.month1')} date={t('landing.demo.month1Date')} />
              <HorizonRow emoji="✒️" title={t('landing.demo.month2')} date={t('landing.demo.month2Date')} />
            </div>
            <span
              className="mb-1.5 flex w-full items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs"
              style={{ border: '1px dashed var(--hairline-2)', color: 'var(--ink-3)' }}
            >
              <ChevronRight className="h-3 w-3" /> {t('pulse.thisQuarter', { count: 2 })}
            </span>
            <span
              className="flex w-full items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs"
              style={{ border: '1px dashed var(--hairline-2)', color: 'var(--ink-3)' }}
            >
              <ChevronRight className="h-3 w-3" /> {t('pulse.thisYear', { count: 1 })}
            </span>
          </div>
        </aside>
      </div>
    </div>
  )
}

function SecLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-ui)',
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--ink-3)',
      }}
    >
      {children}
    </div>
  )
}

function PromptCard({
  title,
  tag,
  hint,
  body,
  withAttach = false,
}: {
  title: string
  tag: string
  hint: string
  body: string
  withAttach?: boolean
}) {
  return (
    <div
      style={{
        background: 'var(--canvas)',
        border: '1px solid var(--hairline)',
        borderRadius: 14,
        padding: 18,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-1 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full"
          style={{ border: '1.5px solid var(--moss)', background: 'var(--moss)', color: 'var(--paper)' }}
        >
          <Check size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 19, lineHeight: 1.3, color: 'var(--ink)' }}>
              {title}
            </span>
            <span
              className="rounded-full px-2 py-0.5"
              style={{
                background: 'var(--clay-soft)',
                color: 'var(--clay-deep)',
                fontSize: 10,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                fontWeight: 500,
              }}
            >
              {tag}
            </span>
          </div>
          <p
            className="mt-1"
            style={{ fontFamily: 'var(--font-text)', fontStyle: 'italic', fontSize: 13, color: 'var(--ink-3)' }}
          >
            {hint}
          </p>
          <div
            className="mt-3 rounded-md p-3 text-sm"
            style={{
              background: 'var(--paper-deep)',
              border: '1px solid var(--hairline)',
              color: 'var(--ink)',
              fontFamily: 'var(--font-text)',
              lineHeight: 1.55,
            }}
          >
            {body}
          </div>
          {withAttach && (
            <span
              className="mt-2 flex h-12 w-12 items-center justify-center rounded-md"
              style={{ border: '1px dashed var(--hairline-2)', color: 'var(--ink-3)' }}
            >
              <ImagePlus className="h-4 w-4" />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function UpcomingRow({
  kind,
  title,
  suffix,
  person,
  when,
  tone = 'rest',
  last = false,
}: {
  kind: 'date' | 'bid'
  title: string
  suffix?: string
  person: string
  when: string
  /** clay = coming up soon; rest = quiet metadata gray */
  tone?: 'clay' | 'rest'
  last?: boolean
}) {
  return (
    <li className="flex items-start gap-3 py-3" style={{ borderBottom: last ? 'none' : '1px solid var(--hairline)' }}>
      {kind === 'date' ? (
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}
        >
          <CalendarDays className="h-3 w-3" />
        </span>
      ) : (
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ background: 'var(--plum-soft)', color: 'var(--plum)' }}
        >
          <Gift className="h-3 w-3" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[13px]" style={{ color: 'var(--ink)', fontWeight: 500 }}>
          {title}
          {suffix && (
            <span className="ml-1.5" style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 400 }}>
              · {suffix}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs" style={{ color: 'var(--ink-3)' }}>
          {person} · <span style={{ color: tone === 'clay' ? 'var(--clay)' : 'var(--ink-3)' }}>{when}</span>
        </span>
      </span>
    </li>
  )
}

function HorizonRow({ emoji, title, date }: { emoji: string; title: string; date: string }) {
  return (
    <div className="flex items-center gap-2 py-1 text-[13px]" style={{ color: 'var(--ink)' }}>
      <span className="leading-none">{emoji}</span>
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <span
        className="shrink-0 tabular-nums"
        style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)' }}
      >
        {date}
      </span>
    </div>
  )
}
