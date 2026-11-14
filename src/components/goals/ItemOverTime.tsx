import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toPlain } from '~/lib/mentions'
import {
  contactSheet,
  dayTime,
  framePositions,
  framesOf,
  monthTicks,
  nearestFrame,
  weeksBetween,
  type Frame,
  type HistoryWeek,
} from '~/lib/over-time'
import { trackingItemHistoryQueryOptions, trackingItemsQueryOptions } from '~/lib/queries/sync'
import MentionText, { useMentionPeople } from './MentionText'
import { Eyebrow } from './ui'

export type OverTimeView = 'play' | 'compare' | 'all'

type Speed = 'slow' | 'normal' | 'fast'
const SPEED_MS: Record<Speed, number> = { slow: 1600, normal: 800, fast: 350 }

// Pictures sit on the same dark ground in both themes: a photo reads best
// against it, and a light stage would glare beside a dim picture.
const STAGE_GROUND = '#14100d'

// The phone's camera frame is 3:4 portrait, so the stage is too; anything
// else is letterboxed inside it. As tall as the window allows, never wider
// than the column.
const stageStyle: CSSProperties = {
  width: 'calc(min(68vh, 720px) * 0.75)',
  maxWidth: '100%',
  aspectRatio: '3 / 4',
  background: STAGE_GROUND,
}

const notesStyle: CSSProperties = {
  fontFamily: 'var(--font-text)',
  fontSize: 16,
  lineHeight: 1.6,
  color: 'var(--ink)',
}

const monoStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
}

/** Formatters for a week's Monday, in the app's language. A day has no time zone, so UTC throughout. */
function useDayFormat() {
  const { i18n } = useTranslation()
  const format = (options: Intl.DateTimeFormatOptions) => {
    const fmt = new Intl.DateTimeFormat(i18n.language, { ...options, timeZone: 'UTC' })
    return (day: string) => fmt.format(new Date(dayTime(day)))
  }
  return {
    full: format({ day: 'numeric', month: 'short', year: 'numeric' }),
    short: format({ day: 'numeric', month: 'short' }),
    month: format({ month: 'short' }),
    monthYear: format({ month: 'long', year: 'numeric' }),
    year: format({ year: 'numeric' }),
  }
}

// One tracking item over time: every picture it was given, week after week.
// Three ways to look: play them as a time-lapse along a timeline that keeps
// the real distance between weeks, hold two of them against each other, or
// see every week on one sheet with the missed ones marked.
//
// The route keys this by item, so picking another item starts clean.
export default function ItemOverTime({ itemId, view }: { itemId: string; view?: OverTimeView }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const day = useDayFormat()
  const { data } = useSuspenseQuery(trackingItemHistoryQueryOptions(itemId))
  const { data: library } = useSuspenseQuery(trackingItemsQueryOptions())

  const frames = framesOf(data.weeks)
  const [index, setIndex] = useState(() => Math.max(0, frames.length - 1))
  // A picture deleted elsewhere can leave the index past the end.
  const current = Math.min(index, Math.max(0, frames.length - 1))

  const available: OverTimeView[] = [
    ...(frames.length >= 1 ? (['play'] as const) : []),
    ...(frames.length >= 2 ? (['compare'] as const) : []),
    'all',
  ]
  const shown: OverTimeView = view && available.includes(view) ? view : (available[0] ?? 'all')

  const go = (next: { item?: string; view?: OverTimeView }) =>
    void navigate({
      to: '/app/tracking-items',
      search: { item: next.item ?? itemId, view: next.view ?? (next.item ? undefined : shown) },
      replace: !next.item,
    })

  // The library holds active items only; an archived one being looked at is added.
  const options = library.some((item) => item.id === itemId)
    ? library
    : [{ id: itemId, title: data.item.title }, ...library]

  const pictures = frames.length
  const first = data.weeks[0]?.week

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
      <header className="px-6 pt-8 pb-6 md:px-12" style={{ borderBottom: '1px solid var(--hairline)' }}>
        <Link
          to="/app/tracking-items"
          className="mb-5 inline-flex items-center gap-1.5 text-sm text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('overTime.back')}
        </Link>
        <Eyebrow>{t('overTime.eyebrow')}</Eyebrow>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 40,
                lineHeight: 1.2,
                letterSpacing: '-0.02em',
                color: 'var(--ink)',
              }}
            >
              {data.item.title}
            </h1>
            {first && (
              <p className="mt-2" style={monoStyle}>
                {t('overTime.weeks', { count: data.weeks.length })}
                {pictures > 0 && <> · {t('overTime.pictures', { count: pictures })}</>}
                {' · '}
                {t('overTime.since', { date: day.full(first) })}
                {data.item.archived && <> · {t('overTime.archived')}</>}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={itemId}
              onChange={(e) => go({ item: e.target.value })}
              aria-label={t('overTime.pickItem')}
              className="max-w-[240px] rounded-lg border border-[var(--hairline-2)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] outline-hidden"
            >
              {options.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
            {available.length > 1 && (
              <Segmented
                label={t('overTime.viewLabel')}
                value={shown}
                options={available.map((v) => ({ value: v, label: t(`overTime.view.${v}`) }))}
                onChange={(v) => go({ view: v })}
              />
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl px-6 py-8 md:px-12">
          {data.weeks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--hairline-2)] p-10 text-center">
              <p style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--ink)' }}>
                {t('overTime.emptyTitle')}
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-[var(--ink-2)]">{t('overTime.emptyBody')}</p>
              <Link
                to="/app/sync"
                className="mt-5 inline-block rounded-lg border border-[var(--hairline-2)] px-3.5 py-2 text-sm text-[var(--ink)] transition-colors hover:bg-[var(--vellum)]"
              >
                {t('overTime.openSync')}
              </Link>
            </div>
          ) : shown === 'play' ? (
            <PlayView title={data.item.title} frames={frames} index={current} onIndex={setIndex} />
          ) : shown === 'compare' ? (
            <CompareView title={data.item.title} frames={frames} />
          ) : (
            <SheetView
              title={data.item.title}
              weeks={data.weeks}
              frames={frames}
              onOpen={(frameIndex) => {
                setIndex(frameIndex)
                go({ view: 'play' })
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-lg p-0.5"
      style={{ background: 'var(--vellum)', border: '1px solid var(--hairline)' }}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className="rounded-md px-3 py-1.5 text-sm transition-colors"
            style={
              active
                ? { background: 'var(--canvas)', color: 'var(--ink)', boxShadow: 'var(--shadow-sm)' }
                : { color: 'var(--ink-3)' }
            }
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function useAlt(title: string) {
  const { t } = useTranslation()
  const day = useDayFormat()
  return (week: string) => t('overTime.pictureAlt', { title, date: day.full(week) })
}

// ── Play ────────────────────────────────────────────────────────────────────

function PlayView({
  title,
  frames,
  index,
  onIndex,
}: {
  title: string
  frames: Frame[]
  index: number
  onIndex: (index: number) => void
}) {
  const { t } = useTranslation()
  const day = useDayFormat()
  const alt = useAlt(title)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<Speed>('normal')
  const last = frames.length - 1
  const frame = frames[index]

  // One step per tick; the timer is re-armed by the step it caused, and the
  // last picture stops it.
  useEffect(() => {
    if (!playing) return
    const timer = setTimeout(() => {
      if (index >= last) setPlaying(false)
      else onIndex(index + 1)
    }, SPEED_MS[speed])
    return () => clearTimeout(timer)
  }, [playing, index, last, speed, onIndex])

  // Fetch every picture once, in order, so the first play does not stutter on
  // the network. The browser keeps them; nothing is held here.
  // Keyed on the urls as one string: `frames` is a new array on every render.
  const urls = frames.map((f) => f.url).join('\n')
  useEffect(() => {
    let cancelled = false
    const queue = urls.split('\n')
    const load = () => {
      const url = queue.shift()
      if (cancelled || !url) return
      const image = new Image()
      image.onload = image.onerror = load
      image.src = url
    }
    load()
    return () => {
      cancelled = true
    }
  }, [urls])

  const step = (delta: number) => {
    setPlaying(false)
    onIndex(Math.min(last, Math.max(0, index + delta)))
  }
  const toggle = () => {
    if (!playing && index >= last) onIndex(0)
    setPlaying(!playing)
  }

  // ← → and space, anywhere on the page except inside a control that uses them.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('input, select, textarea, [role="slider"], [contenteditable="true"]')) return
      if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key === ' ' && !target?.closest('button, a')) {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!frame) return null
  const firstWeek = frames[0]?.week ?? frame.week
  const after = weeksBetween(firstWeek, frame.week)
  // The picture on screen and its neighbours, so a step fades instead of loading.
  const mounted = [index - 1, index, index + 1, index + 2].filter((i) => i >= 0 && i <= last)

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[auto_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)_auto] lg:gap-x-12 lg:gap-y-6">
      <div
        className="relative mx-auto overflow-hidden rounded-2xl lg:row-span-2 lg:mx-0"
        style={{ ...stageStyle, boxShadow: 'var(--shadow-lg)' }}
      >
        {mounted.map((i) => {
          const f = frames[i]
          if (!f) return null
          return (
            <img
              key={f.key}
              src={f.url}
              alt={i === index ? alt(f.week) : ''}
              aria-hidden={i !== index}
              draggable={false}
              className="absolute inset-0 h-full w-full object-contain"
              style={{ opacity: i === index ? 1 : 0, transition: 'opacity 220ms var(--ease)' }}
            />
          )
        })}
      </div>

      <div className="order-3 min-w-0 lg:order-none lg:col-start-2 lg:row-start-1 lg:pt-4">
        <p style={monoStyle} aria-live="polite">
          {t('overTime.frameOf', { index: index + 1, total: frames.length })}
          {' · '}
          {after === 0 ? t('overTime.first') : t('overTime.afterFirst', { count: after })}
        </p>
        <h2
          className="mt-2"
          style={{ fontFamily: 'var(--font-display)', fontSize: 32, lineHeight: 1.2, letterSpacing: '-0.01em' }}
        >
          {t('overTime.weekOf', { date: day.full(frame.week) })}
        </h2>
        {frame.shots > 1 && (
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            {t('overTime.shotOf', { shot: frame.shot, shots: frame.shots })}
          </p>
        )}
        {frame.note && (
          <p className="mt-5 whitespace-pre-wrap" style={notesStyle}>
            <MentionText text={frame.note} link />
          </p>
        )}
        <Link
          to="/app/sync"
          search={{ week: frame.week }}
          className="mt-5 inline-block text-sm text-[var(--ink-3)] underline decoration-[var(--hairline-2)] underline-offset-4 transition-colors hover:text-[var(--ink)]"
        >
          {t('overTime.openWeek')}
        </Link>
      </div>
      <div className="order-2 min-w-0 lg:order-none lg:col-start-2 lg:row-start-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <RoundButton label={t('overTime.previous')} onClick={() => step(-1)} disabled={index === 0}>
              <ChevronLeft className="h-4 w-4" />
            </RoundButton>
            <button
              type="button"
              onClick={toggle}
              disabled={frames.length < 2}
              className="inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-medium transition-opacity disabled:opacity-40"
              style={{ background: 'var(--clay)', color: 'var(--paper)', boxShadow: 'var(--shadow-sm)' }}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {playing ? t('overTime.pause') : t('overTime.play')}
            </button>
            <RoundButton label={t('overTime.next')} onClick={() => step(1)} disabled={index === last}>
              <ChevronRight className="h-4 w-4" />
            </RoundButton>
          </div>
          <Segmented
            label={t('overTime.speed')}
            value={speed}
            options={(['slow', 'normal', 'fast'] as const).map((s) => ({ value: s, label: t(`overTime.speeds.${s}`) }))}
            onChange={setSpeed}
          />
        </div>

        {frames.length > 1 && (
          <Timeline
            frames={frames}
            index={index}
            onPick={(i) => {
              setPlaying(false)
              onIndex(i)
            }}
          />
        )}
      </div>
    </div>
  )
}

function RoundButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--hairline-2)] bg-[var(--canvas)] text-[var(--ink)] transition-colors hover:bg-[var(--vellum)] disabled:opacity-40 disabled:hover:bg-[var(--canvas)]"
    >
      {children}
    </button>
  )
}

// The pictures along real time: a mark per picture, placed by its week's date,
// so a month with four pictures looks full and a month off looks empty. Press
// or drag anywhere to go to the nearest one.
function Timeline({ frames, index, onPick }: { frames: Frame[]; index: number; onPick: (index: number) => void }) {
  const { t } = useTranslation()
  const day = useDayFormat()
  const track = useRef<HTMLDivElement | null>(null)
  const positions = framePositions(frames)
  const first = frames[0]?.week
  const last = frames.at(-1)?.week
  const current = frames[index]
  if (!first || !last || !current) return null
  const ticks = monthTicks(first, last)

  const pick = (clientX: number) => {
    const box = track.current?.getBoundingClientRect()
    if (!box || box.width === 0) return
    onPick(nearestFrame(positions, (clientX - box.left) / box.width))
  }
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pick(e.clientX)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e.clientX)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target =
      e.key === 'ArrowLeft'
        ? index - 1
        : e.key === 'ArrowRight'
          ? index + 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? frames.length - 1
              : null
    if (target === null) return
    e.preventDefault()
    onPick(Math.min(frames.length - 1, Math.max(0, target)))
  }

  return (
    <div className="mt-6">
      <div
        role="slider"
        tabIndex={0}
        aria-label={t('overTime.timeline')}
        aria-valuemin={1}
        aria-valuemax={frames.length}
        aria-valuenow={index + 1}
        aria-valuetext={t('overTime.weekOf', { date: day.full(current.week) })}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
        className="cursor-pointer rounded-xl px-4 pt-4 pb-2 outline-hidden select-none focus-visible:ring-2 focus-visible:ring-[var(--clay)]"
        style={{ background: 'var(--canvas)', border: '1px solid var(--hairline)', touchAction: 'none' }}
      >
        <div ref={track} className="relative h-9">
          <div className="absolute top-1/2 right-0 left-0 h-px" style={{ background: 'var(--hairline-2)' }} />
          {frames.map((frame, i) => (
            <span
              key={frame.key}
              className="absolute top-1/2 rounded-full"
              style={{
                left: `${(positions[i] ?? 0) * 100}%`,
                width: 3,
                height: i === index ? 28 : 12,
                transform: 'translate(-50%, -50%)',
                background: i === index ? 'var(--clay)' : i < index ? 'var(--ink-2)' : 'var(--ink-4)',
                transition: 'height var(--dur-1) var(--ease), background var(--dur-1) var(--ease)',
              }}
            />
          ))}
        </div>
        <div className="relative h-5">
          <span className="absolute left-0" style={monoStyle}>
            {day.short(first)}
          </span>
          {ticks
            // Leave the two ends to the first and last dates.
            .filter((tick) => tick.position > 0.12 && tick.position < 0.88)
            .map((tick) => (
              <span
                key={tick.day}
                className="absolute hidden -translate-x-1/2 sm:block"
                style={{ ...monoStyle, left: `${tick.position * 100}%`, color: 'var(--ink-4)' }}
              >
                {tick.day.slice(5, 7) === '01' ? day.year(tick.day) : day.month(tick.day)}
              </span>
            ))}
          <span className="absolute right-0" style={monoStyle}>
            {day.short(last)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Compare ─────────────────────────────────────────────────────────────────

function CompareView({ title, frames }: { title: string; frames: Frame[] }) {
  const { t } = useTranslation()
  const day = useDayFormat()
  const alt = useAlt(title)
  const [beforeKey, setBeforeKey] = useState(frames[0]?.key)
  const [afterKey, setAfterKey] = useState(frames.at(-1)?.key)
  const [mode, setMode] = useState<'slider' | 'side'>('slider')
  const [split, setSplit] = useState(50)
  const stage = useRef<HTMLDivElement | null>(null)

  const before = frames.find((f) => f.key === beforeKey) ?? frames[0]
  const after = frames.find((f) => f.key === afterKey) ?? frames.at(-1)
  if (!before || !after) return null
  const apart = Math.abs(weeksBetween(before.week, after.week))

  const label = (frame: Frame) =>
    frame.shots > 1 ? `${day.full(frame.week)} (${frame.shot}/${frame.shots})` : day.full(frame.week)

  const drag = (clientX: number) => {
    const box = stage.current?.getBoundingClientRect()
    if (!box || box.width === 0) return
    setSplit(Math.min(100, Math.max(0, ((clientX - box.left) / box.width) * 100)))
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === 'ArrowLeft' ? -2 : e.key === 'ArrowRight' ? 2 : 0
    if (delta === 0) return
    e.preventDefault()
    setSplit((value) => Math.min(100, Math.max(0, value + delta)))
  }

  const chip = 'absolute top-3 rounded-full px-2.5 py-1 text-xs font-medium'
  const chipStyle: CSSProperties = { background: 'rgba(20, 16, 13, 0.72)', color: '#f8f2eb' }
  const picker = (value: string, onChange: (key: string) => void, name: string) => (
    <label className="flex items-center gap-2 text-sm text-[var(--ink-3)]">
      {name}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-[var(--hairline-2)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] outline-hidden"
      >
        {frames.map((frame) => (
          <option key={frame.key} value={frame.key}>
            {label(frame)}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          {picker(before.key, setBeforeKey, t('overTime.before'))}
          {picker(after.key, setAfterKey, t('overTime.after'))}
          <span style={monoStyle}>{apart === 0 ? t('overTime.sameWeek') : t('overTime.apart', { count: apart })}</span>
        </div>
        <Segmented
          label={t('overTime.compareMode')}
          value={mode}
          options={[
            { value: 'slider', label: t('overTime.slider') },
            { value: 'side', label: t('overTime.sideBySide') },
          ]}
          onChange={setMode}
        />
      </div>

      {mode === 'slider' ? (
        <div
          ref={stage}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            drag(e.clientX)
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) drag(e.clientX)
          }}
          className="relative mx-auto cursor-ew-resize overflow-hidden rounded-2xl select-none lg:mx-0"
          style={{ ...stageStyle, boxShadow: 'var(--shadow-lg)', touchAction: 'none' }}
        >
          <img
            src={after.url}
            alt={alt(after.week)}
            draggable={false}
            className="absolute inset-0 h-full w-full object-contain"
          />
          {/* The earlier picture covers the left of the divider. Its own dark ground comes along, so a
              letterboxed picture hides the one beneath instead of showing through its bars. */}
          <div
            className="absolute inset-0"
            style={{ background: STAGE_GROUND, clipPath: `inset(0 ${100 - split}% 0 0)` }}
          >
            <img
              src={before.url}
              alt={alt(before.week)}
              draggable={false}
              className="absolute inset-0 h-full w-full object-contain"
            />
          </div>
          <span className={`${chip} left-3`} style={chipStyle}>
            {day.full(before.week)}
          </span>
          <span className={`${chip} right-3`} style={chipStyle}>
            {day.full(after.week)}
          </span>
          <div
            className="absolute top-0 bottom-0"
            style={{ left: `${split}%`, width: 2, marginLeft: -1, background: '#f8f2eb' }}
          >
            <div
              role="slider"
              tabIndex={0}
              aria-label={t('overTime.divider')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(split)}
              onKeyDown={onKeyDown}
              className="absolute top-1/2 left-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--clay)]"
              style={{ background: '#f8f2eb', color: STAGE_GROUND, boxShadow: '0 2px 10px rgba(0, 0, 0, 0.35)' }}
            >
              <ChevronLeft className="-mr-1 h-4 w-4" />
              <ChevronRight className="-ml-1 h-4 w-4" />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:gap-6">
          {[before, after].map((frame, i) => (
            <figure key={`${i}-${frame.key}`} className="min-w-0">
              <div
                className={`relative overflow-hidden rounded-2xl ${i === 0 ? 'ml-auto' : 'mr-auto'}`}
                style={{ ...stageStyle, boxShadow: 'var(--shadow-md)' }}
              >
                <img
                  src={frame.url}
                  alt={alt(frame.week)}
                  draggable={false}
                  className="absolute inset-0 h-full w-full object-contain"
                />
              </div>
              <figcaption className={`mt-2 ${i === 0 ? 'text-right' : 'text-left'}`} style={monoStyle}>
                {day.full(frame.week)}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}

// ── All weeks ───────────────────────────────────────────────────────────────

function SheetView({
  title,
  weeks,
  frames,
  onOpen,
}: {
  title: string
  weeks: HistoryWeek[]
  frames: Frame[]
  onOpen: (frameIndex: number) => void
}) {
  const { t } = useTranslation()
  const day = useDayFormat()
  const alt = useAlt(title)
  const people = useMentionPeople()
  const frameIndex = new Map(frames.map((frame, i) => [frame.key, i] as const))
  const tile = 'relative block w-full overflow-hidden rounded-lg'
  const caption: CSSProperties = { ...monoStyle, fontSize: 10 }

  // An item with notes and no pictures reads as a list: nothing to lay out as tiles.
  if (frames.length === 0) {
    return (
      <div className="max-w-2xl space-y-10">
        {contactSheet(weeks).map((month) => (
          <section key={month.month}>
            <h2
              className="mb-4"
              style={{ fontFamily: 'var(--font-display)', fontSize: 24, letterSpacing: '-0.01em', color: 'var(--ink)' }}
            >
              {day.monthYear(`${month.month}-01`)}
            </h2>
            <ul className="space-y-4">
              {month.entries.map((entry) =>
                entry.kind === 'gap' ? (
                  <li
                    key={`gap-${entry.from}`}
                    className="rounded-lg px-4 py-2 text-xs text-[var(--ink-4)]"
                    style={{ border: '1px dashed var(--hairline-2)' }}
                  >
                    {t('overTime.gap', { count: entry.weeks })}
                  </li>
                ) : (
                  <li key={entry.week.syncItemId} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4">
                    <Link
                      to="/app/sync"
                      search={{ week: entry.week.week }}
                      className="pt-1 transition-colors hover:text-[var(--ink)]"
                      style={monoStyle}
                    >
                      {day.short(entry.week.week)}
                    </Link>
                    <p className="whitespace-pre-wrap" style={notesStyle}>
                      <MentionText text={entry.week.textContent ?? fileNames(entry.week)} link />
                    </p>
                  </li>
                ),
              )}
            </ul>
          </section>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-10">
      {contactSheet(weeks).map((month) => (
        <section key={month.month}>
          <h2
            className="mb-4"
            style={{ fontFamily: 'var(--font-display)', fontSize: 24, letterSpacing: '-0.01em', color: 'var(--ink)' }}
          >
            {day.monthYear(`${month.month}-01`)}
          </h2>
          <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 lg:grid-cols-6">
            {month.entries.flatMap((entry) => {
              if (entry.kind === 'gap') {
                return [
                  <div
                    key={`gap-${entry.from}`}
                    className="flex items-center justify-center rounded-lg p-3 text-center text-xs text-[var(--ink-4)]"
                    style={{ aspectRatio: '3 / 4', border: '1px dashed var(--hairline-2)' }}
                  >
                    {t('overTime.gap', { count: entry.weeks })}
                  </div>,
                ]
              }
              const { week } = entry
              const note = week.textContent ? toPlain(week.textContent, people) : null
              const images = week.attachments.filter((a) => a.fileType === 'image')
              if (images.length === 0) {
                return [
                  <div key={week.syncItemId}>
                    <div
                      className={`${tile} p-3 text-left text-xs leading-relaxed text-[var(--ink-2)]`}
                      style={{ aspectRatio: '3 / 4', background: 'var(--vellum)', fontFamily: 'var(--font-text)' }}
                    >
                      <span className="line-clamp-[9]">{note ?? fileNames(week)}</span>
                    </div>
                    <p className="mt-1.5" style={caption}>
                      {day.short(week.week)}
                    </p>
                  </div>,
                ]
              }
              return images.map((image, i) => (
                <div key={image.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(frameIndex.get(image.id) ?? 0)}
                    title={note ?? undefined}
                    className={`${tile} transition-transform hover:scale-[1.02]`}
                    style={{ aspectRatio: '3 / 4', background: STAGE_GROUND }}
                  >
                    <img
                      src={image.url}
                      alt={alt(week.week)}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  </button>
                  <p className="mt-1.5 truncate" style={caption}>
                    {day.short(week.week)}
                    {images.length > 1 && ` · ${i + 1}/${images.length}`}
                  </p>
                </div>
              ))
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

/** What stands in for a week that holds files and no words: their names. */
function fileNames(week: HistoryWeek): string {
  return week.attachments.map((a) => a.fileName).join(', ')
}
