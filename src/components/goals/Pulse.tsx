import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Gift,
  Hourglass,
  ImagePlus,
  Loader2,
  Trash2,
  Users,
  Check,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { formatScheduledShort } from '~/lib/horizon-period'
import {
  useCreateWeeklySync,
  useDeleteAttachment,
  useSetSyncItemText,
  useUploadSyncAttachment,
  useAddSyncItem,
} from '~/lib/mutations/weekly-sync'
import { useGoalsData } from '~/lib/queries/goals'
import { importantDatesQueryOptions, peopleQueryOptions, upcomingNextBidsQueryOptions } from '~/lib/queries/people'
import { attentionOf, horizonsOf, isFilled, syncItemsOf, upcomingOf } from '~/lib/pulse'
import { weeklyRetrospectiveQueryOptions, type WeeklyRetrospectiveData as WeeklyRetroData } from '~/lib/queries/sync'
import { weekStartOf } from '~/lib/week'
import Avatar from './Avatar'
import { Btn, Card, Eyebrow, SecLabel } from './ui'

// "Pulse" — the warm daily landing. Header reads as a journal entry
// (eyebrow + display headline with inline italic clay accent), body is
// a flat list of this week's prompts. Heavy management still lives on
// the Sync tab.
export default function Pulse() {
  const { t } = useTranslation()
  const { goals } = useGoalsData()
  const { data: people } = useSuspenseQuery(peopleQueryOptions(false))
  const { data: importantDates } = useSuspenseQuery(importantDatesQueryOptions())
  const { data: upcomingBids } = useSuspenseQuery(upcomingNextBidsQueryOptions())
  const [showYearlySection, setShowYearlySection] = useState(false)

  const createWeeklySync = useCreateWeeklySync()
  const addSyncItem = useAddSyncItem()
  const setItemText = useSetSyncItemText()
  const uploadAttachment = useUploadSyncAttachment()
  const deleteAttachment = useDeleteAttachment()

  // Pinned on mount so the week doesn't shift under the user at midnight.
  // Not prefetched by the route loader — see the timezone note in app.pulse.tsx.
  const [weekStart] = useState<Date>(() => weekStartOf(new Date()))
  const query = useQuery(weeklyRetrospectiveQueryOptions(weekStart))
  const data: WeeklyRetroData | undefined = query.data
  const weeklySync = data?.weeklySync

  const items = useMemo(() => (data ? syncItemsOf(data) : []), [data])

  const filled = items.filter(isFilled)
  const progress = items.length === 0 ? 0 : Math.round((filled.length / items.length) * 100)

  // Everything below is the same reading `get_pulse` gives an MCP client:
  // lib/pulse.ts. month/quarter render inline, year stays collapsed by default.
  const horizonBuckets = useMemo(() => horizonsOf(goals, new Date()), [goals])

  // eslint-disable-next-line react-hooks/purity -- comparison only; intentional fresh `now`
  const attentionRows = attentionOf(people, Date.now())

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const upcomingFeed = upcomingOf(importantDates, upcomingBids, people, today)

  const handleStart = async () => {
    try {
      await createWeeklySync.mutateAsync({ weekDate: weekStart })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('pulse.startFailed'))
    }
  }

  const formatRange = (start: Date) => {
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    return `${fmt(start)} – ${fmt(end)}, ${start.getFullYear()}`
  }

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 5) return t('pulse.greetingLate')
    if (h < 12) return t('pulse.greetingMorning')
    if (h < 18) return t('pulse.greetingAfternoon')
    return t('pulse.greetingEvening')
  })()

  const formatDaysUntil = (daysUntil: number): string => {
    if (daysUntil === 0) return t('pulse.today')
    if (daysUntil < 0) return t('pulse.daysOverdue', { count: -daysUntil })
    if (daysUntil === 1) return t('pulse.tomorrow')
    return t('pulse.inDays', { count: daysUntil })
  }

  if (query.isLoading) {
    return (
      <div className="flex h-full items-center justify-center" style={{ color: 'var(--ink-3)' }}>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('pulse.loading')}
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--paper)' }}>
      {/* Pulse hero — eyebrow + warm headline + italic Newsreader subtitle */}
      <header
        className="px-6 pt-10 pb-7 md:px-12 md:pt-14 md:pb-8"
        style={{ borderBottom: '1px solid var(--hairline)' }}
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-baseline justify-between gap-6">
          <div className="min-w-0 flex-1">
            <Eyebrow>
              {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} ·{' '}
              {formatRange(weekStart)}
            </Eyebrow>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 52,
                lineHeight: 1.18,
                letterSpacing: '-0.02em',
                color: 'var(--ink)',
                paddingBottom: 8,
              }}
            >
              {greeting}, <span className="brand-em">{t('pulse.greetingSuffix')}</span>
            </h1>
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
          {weeklySync && items.length > 0 && (
            <div className="flex flex-col items-end gap-2">
              <div
                className="flex items-center gap-3"
                style={{ color: 'var(--ink-3)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
              >
                <span>
                  <span style={{ color: 'var(--ink)' }}>{filled.length}</span>/{items.length}{' '}
                  {t('pulse.filledProgress')}
                </span>
                <span
                  style={{
                    width: 96,
                    height: 4,
                    background: 'var(--vellum)',
                    borderRadius: 99,
                    overflow: 'hidden',
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      width: `${progress}%`,
                      height: '100%',
                      background: 'var(--clay)',
                      transition: 'width var(--dur-3) var(--ease)',
                    }}
                  />
                </span>
                <span>{progress}%</span>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* 2-column body — LEFT: the week so far · RIGHT: Upcoming + On the
          horizon. The split matches Screens.html's pulse layout
          (1.4fr / 1fr at desktop, single-column on mobile). */}
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-0 px-0 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* LEFT — the week so far */}
        <section className="px-6 py-7 md:px-10" style={{ borderRight: '1px solid var(--hairline)' }}>
          <div className="mb-4 flex items-baseline justify-between">
            <SecLabel>{t('pulse.weekSoFar')}</SecLabel>
            {weeklySync && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>
                {t('pulse.autoSaved')}
              </span>
            )}
          </div>

          {!weeklySync ? (
            <EmptyState
              title={t('pulse.emptyNoSyncTitle')}
              body={t('pulse.emptyNoSyncBody')}
              cta={{ label: t('pulse.startThisWeek'), onClick: () => void handleStart() }}
            />
          ) : items.length === 0 ? (
            <EmptyState title={t('pulse.emptyNoItemsTitle')} body={t('pulse.emptyNoItemsBody')} />
          ) : (
            <ul className="space-y-3">
              {items.map((it) => (
                <PulseItemRow
                  key={it.id}
                  item={it}
                  weeklySyncId={weeklySync.id}
                  onSaveText={async (content) => {
                    // addSyncItem is idempotent — the row already exists here,
                    // since `items` is built from rows that are on the sync.
                    const row = await addSyncItem.mutateAsync({
                      weeklySyncId: weeklySync.id,
                      trackingItemId: it.trackingItemId,
                    })
                    await setItemText.mutateAsync({ weeklySyncItemId: row.id, textContent: content })
                  }}
                  onUploadImages={async (files) => {
                    for (const file of Array.from(files)) {
                      const reader = new FileReader()
                      const data = await new Promise<string>((resolve, reject) => {
                        reader.onload = () => resolve(reader.result as string)
                        reader.onerror = reject
                        reader.readAsDataURL(file)
                      })
                      await uploadAttachment.mutateAsync({
                        weeklySyncId: weeklySync.id,
                        trackingItemId: it.trackingItemId,
                        fileName: file.name,
                        fileType: 'image',
                        data,
                      })
                    }
                  }}
                  onDeleteAttachment={(id) => deleteAttachment.mutateAsync(id).then(() => undefined)}
                />
              ))}
            </ul>
          )}
        </section>

        {/* RIGHT — paper-deep sidebar with Upcoming feed + On the horizon */}
        <aside className="px-6 py-7 md:px-8" style={{ background: 'var(--paper-deep)' }}>
          {/* Upcoming — important dates + bids */}
          {upcomingFeed.length > 0 && (
            <>
              <div className="mb-2 flex items-center gap-2">
                <CalendarDays className="h-3.5 w-3.5" style={{ color: 'var(--ink-3)' }} />
                <SecLabel>{t('pulse.upcoming')}</SecLabel>
              </div>
              <p
                className="mb-4"
                style={{
                  fontFamily: 'var(--font-text)',
                  fontStyle: 'italic',
                  fontSize: 13,
                  color: 'var(--ink-3)',
                }}
              >
                {t('pulse.upcomingHelp')}
              </p>
              <ul>
                {upcomingFeed.map((row, i) => (
                  <li
                    key={row.id}
                    className="flex items-start gap-3 py-3"
                    style={{ borderBottom: i === upcomingFeed.length - 1 ? 'none' : '1px solid var(--hairline)' }}
                  >
                    {row.kind === 'date' ? (
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                        style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}
                        title={t('pulse.importantDateTitle')}
                      >
                        <CalendarDays className="h-3 w-3" />
                      </span>
                    ) : (
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                        style={{ background: 'var(--plum-soft)', color: 'var(--plum)' }}
                        title={t('pulse.bidTitle')}
                      >
                        <Gift className="h-3 w-3" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px]" style={{ color: 'var(--ink)', fontWeight: 500 }}>
                        {row.kind === 'date' ? row.label : row.content}
                        {row.kind === 'date' && row.turning !== null && row.turning > 0 && (
                          <span className="ml-1.5" style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 400 }}>
                            · {t('pulse.turning', { n: row.turning })}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs" style={{ color: 'var(--ink-3)' }}>
                        {row.person} ·{' '}
                        <span
                          style={{
                            color:
                              row.daysUntil <= 0 ? 'var(--rust)' : row.daysUntil <= 3 ? 'var(--clay)' : 'var(--ink-3)',
                          }}
                        >
                          {formatDaysUntil(row.daysUntil)}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* On the horizon — bucketed tasks */}
          {(horizonBuckets.month.length > 0 || horizonBuckets.quarter.length > 0 || horizonBuckets.year.length > 0) && (
            <div className={upcomingFeed.length > 0 ? 'mt-8' : ''}>
              <div className="mb-3 flex items-center gap-2">
                <Hourglass className="h-3.5 w-3.5" style={{ color: 'var(--ink-3)' }} />
                <SecLabel>{t('pulse.onTheHorizon')}</SecLabel>
              </div>

              {horizonBuckets.month.length > 0 && (
                <Card pad={14} style={{ marginBottom: 8 }}>
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
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-2)' }}>
                      {horizonBuckets.month.length}
                    </span>
                  </div>
                  {horizonBuckets.month.slice(0, 5).map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-2 py-1 text-[13px]"
                      style={{ color: 'var(--ink)' }}
                    >
                      {task.goalEmoji && !task.goalEmoji.startsWith('http') && (
                        <span className="leading-none">{task.goalEmoji}</span>
                      )}
                      <span className="min-w-0 flex-1 truncate">{task.title}</span>
                      <span
                        className="shrink-0 tabular-nums"
                        style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)' }}
                      >
                        {formatScheduledShort(task.scheduledAt)}
                      </span>
                    </div>
                  ))}
                </Card>
              )}

              {horizonBuckets.quarter.length > 0 && (
                <button
                  onClick={() => setShowYearlySection(false)}
                  className="mb-1.5 flex w-full items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs"
                  style={{
                    border: '1px dashed var(--hairline-2)',
                    color: 'var(--ink-3)',
                    background: 'transparent',
                  }}
                >
                  <ChevronRight className="h-3 w-3" />{' '}
                  {t('pulse.thisQuarter', { count: horizonBuckets.quarter.length })}
                </button>
              )}

              {horizonBuckets.year.length > 0 && (
                <button
                  onClick={() => setShowYearlySection((v) => !v)}
                  className="flex w-full items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs"
                  style={{
                    border: '1px dashed var(--hairline-2)',
                    color: 'var(--ink-3)',
                    background: 'transparent',
                  }}
                >
                  {showYearlySection ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}{' '}
                  {t('pulse.thisYear', { count: horizonBuckets.year.length })}
                </button>
              )}

              {showYearlySection && horizonBuckets.year.length > 0 && (
                <Card pad={14} style={{ marginTop: 8 }}>
                  {horizonBuckets.year.slice(0, 10).map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-2 py-1 text-[13px]"
                      style={{ color: 'var(--ink)' }}
                    >
                      {task.goalEmoji && !task.goalEmoji.startsWith('http') && (
                        <span className="leading-none">{task.goalEmoji}</span>
                      )}
                      <span className="min-w-0 flex-1 truncate">{task.title}</span>
                      <span
                        className="shrink-0 tabular-nums"
                        style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)' }}
                      >
                        {formatScheduledShort(task.scheduledAt)}
                      </span>
                    </div>
                  ))}
                </Card>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* People needing attention — sits below the 2-col split as a
          full-width section so the rust/amber callouts have room to
          breathe. */}
      <div className="mx-auto max-w-6xl px-6 py-7 md:px-12">
        {attentionRows.length > 0 && (
          <section>
            <div className="mb-4 flex items-baseline justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5" style={{ color: 'var(--ink-3)' }} />
                <SecLabel>{t('pulse.peopleAttention')}</SecLabel>
              </div>
            </div>
            <ul className="space-y-2">
              {attentionRows.map(({ person, reason }) => {
                const accentStyle =
                  reason.kind === 'overdue'
                    ? { borderColor: 'var(--rust)', background: 'var(--rust-soft)', textColor: 'var(--rust)' }
                    : reason.kind === 'due-soon'
                      ? { borderColor: 'var(--amber)', background: 'var(--amber-soft)', textColor: 'var(--amber)' }
                      : { borderColor: 'var(--hairline-2)', background: 'var(--canvas)', textColor: 'var(--ink-2)' }
                const reasonLabel =
                  reason.kind === 'overdue'
                    ? t('pulse.decisionOverdue', { count: reason.daysOverdue })
                    : reason.kind === 'due-soon'
                      ? reason.daysUntil === 0
                        ? t('pulse.decisionDueToday')
                        : reason.daysUntil === 1
                          ? t('pulse.decisionDueTomorrow')
                          : t('pulse.decisionDueIn', { count: reason.daysUntil })
                      : reason.kind === 'exploring-no-date'
                        ? t('pulse.exploringNoDate')
                        : t('pulse.inboxToProcess')
                return (
                  <li
                    key={person.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm"
                    style={{
                      border: `1px solid ${accentStyle.borderColor}`,
                      background: accentStyle.background,
                    }}
                  >
                    <Avatar name={person.name} emoji={person.emoji} size="sm" shape="circle" />
                    <span className="min-w-0 flex-1">
                      <span style={{ color: 'var(--ink)' }}>{person.name}</span>
                      <span style={{ color: 'var(--ink-4)', margin: '0 6px' }}>·</span>
                      <span style={{ color: accentStyle.textColor }}>{reasonLabel}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}

interface PulseItemProps {
  item: {
    id: string
    trackingItemId: string
    title: string
    description: string | null
    textContent: string | null
    attachments: { id: string; fileName: string; url: string; createdAt: Date }[]
    goalTitle: string | null
  }
  weeklySyncId: string
  onSaveText: (content: string) => Promise<void> | void
  onUploadImages: (files: FileList) => Promise<void>
  onDeleteAttachment: (id: string) => Promise<void>
}

function PulseItemRow({ item, onSaveText, onUploadImages, onDeleteAttachment }: PulseItemProps) {
  const { t } = useTranslation()
  const [text, setText] = useState(item.textContent ?? '')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const timer = useRef<NodeJS.Timeout | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleChange = (next: string) => {
    setText(next)
    setStatus('saving')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void Promise.resolve(onSaveText(next))
        .then(() => setStatus('saved'))
        .catch((err: unknown) => {
          toast.error(err instanceof Error ? err.message : t('pulse.saveFailed'))
          setStatus('idle')
        })
    }, 700)
  }

  const isFilled = text.trim().length > 0 || item.attachments.length > 0

  return (
    <Card pad={18} style={{ background: 'var(--canvas)' }}>
      <div className="flex items-start gap-3">
        <span
          className="mt-1 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full"
          style={{
            border: `1.5px solid ${isFilled ? 'var(--moss)' : 'var(--ink-4)'}`,
            background: isFilled ? 'var(--moss)' : 'transparent',
            color: 'var(--paper)',
            transition: 'background var(--dur-1) var(--ease)',
          }}
        >
          {isFilled && <Check size={13} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 19,
                lineHeight: 1.3,
                color: 'var(--ink)',
              }}
            >
              {item.title}
            </h3>
            {item.goalTitle ? (
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
                {item.goalTitle}
              </span>
            ) : (
              <span
                className="rounded-full px-2 py-0.5"
                style={{
                  background: 'var(--vellum)',
                  color: 'var(--ink-3)',
                  fontSize: 10,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  fontWeight: 500,
                }}
              >
                {t('pulse.unscoped')}
              </span>
            )}
            <div className="ml-auto shrink-0 text-xs" style={{ color: 'var(--ink-3)' }}>
              {status === 'saving' && (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> {t('pulse.saving')}
                </span>
              )}
              {status === 'saved' && <span style={{ color: 'var(--moss)' }}>{t('pulse.saved')}</span>}
            </div>
          </div>
          {item.description && (
            <p
              className="mt-1"
              style={{
                fontFamily: 'var(--font-text)',
                fontStyle: 'italic',
                fontSize: 13,
                color: 'var(--ink-3)',
              }}
            >
              {item.description}
            </p>
          )}

          <textarea
            value={text}
            onChange={(e) => handleChange(e.target.value)}
            rows={3}
            placeholder={t('pulse.itemPlaceholder')}
            className="mt-3 w-full resize-y rounded-md p-3 text-sm outline-hidden"
            style={{
              background: 'var(--paper-deep)',
              border: '1px solid var(--hairline)',
              color: 'var(--ink)',
              fontFamily: 'var(--font-text)',
              lineHeight: 1.55,
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--clay)'
              e.currentTarget.style.boxShadow = '0 0 0 3px var(--clay-soft)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--hairline)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {item.attachments.map((a) => (
              <div
                key={a.id}
                className="group relative h-12 w-12 overflow-hidden rounded-md"
                style={{ border: '1px solid var(--hairline-2)' }}
              >
                {/* `fill` + `sizes` were next/image's way of saying "stretch to
                    the positioned parent". On a plain <img> that is
                    absolute inset-0 with full width and height. */}
                <img src={a.url} alt={a.fileName} className="absolute inset-0 h-full w-full object-cover" />
                <button
                  onClick={() => void onDeleteAttachment(a.id)}
                  className="absolute top-0.5 right-0.5 rounded-full p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ background: 'rgba(28, 20, 8, 0.75)', color: 'var(--paper)' }}
                  aria-label={t('pulse.removeAttachment')}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex h-12 w-12 items-center justify-center rounded-md"
              style={{
                border: '1px dashed var(--hairline-2)',
                color: 'var(--ink-3)',
                background: 'transparent',
              }}
              aria-label={t('pulse.addImage')}
              title={t('pulse.addImage')}
            >
              <ImagePlus className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  void onUploadImages(e.target.files)
                  e.target.value = ''
                }
              }}
              className="hidden"
            />
          </div>
        </div>
      </div>
    </Card>
  )
}

function EmptyState({
  title,
  body,
  cta,
}: {
  title: string
  body: string
  cta?: { label: string; onClick: () => void }
}) {
  return (
    <div
      className="rounded-2xl px-8 py-16 text-center"
      style={{
        border: '1px dashed var(--hairline-2)',
        background: 'var(--paper-deep)',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 24,
          color: 'var(--ink)',
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </p>
      <p
        className="mt-3"
        style={{
          fontFamily: 'var(--font-text)',
          fontStyle: 'italic',
          fontSize: 15,
          color: 'var(--ink-2)',
          lineHeight: 1.5,
          maxWidth: 520,
          margin: '12px auto 0',
        }}
      >
        {body}
      </p>
      {cta && (
        <div className="mt-6 flex justify-center">
          <Btn kind="primary" size="lg" onClick={cta.onClick}>
            {cta.label}
          </Btn>
        </div>
      )}
    </div>
  )
}
