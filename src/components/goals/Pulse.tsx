import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, ChevronRight, Gift } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { formatScheduledShort } from '~/lib/horizon-period'
import {
  useCreateWeeklySync,
  useDeleteAttachment,
  useSetSyncItemText,
  useUploadSyncAttachment,
} from '~/lib/mutations/weekly-sync'
import { useGoalsData } from '~/lib/queries/goals'
import { importantDatesQueryOptions, peopleQueryOptions, upcomingNextBidsQueryOptions } from '~/lib/queries/people'
import { attentionOf, horizonsOf, isFilled, syncItemsOf, upcomingOf } from '~/lib/pulse'
import { weeklyRetrospectiveQueryOptions, type WeeklyRetrospectiveData as WeeklyRetroData } from '~/lib/queries/sync'
import { weekStartOf } from '~/lib/week'
import Avatar from './Avatar'
import MentionText from './MentionText'
import { Btn, Page, ScreenHeader, SecLabel } from './ui'
import WeeklySyncItemRow from './WeeklySyncItemRow'

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

  const manyGoals = new Set(items.map((it) => it.goalTitle)).size > 1
  const urgent = attentionRows.filter((r) => r.reason.kind !== 'inbox')
  const inboxCount = attentionRows.length - urgent.length
  const hasHorizon = horizonBuckets.month.length + horizonBuckets.quarter.length + horizonBuckets.year.length > 0

  const reasonLabel = (reason: (typeof attentionRows)[number]['reason']) =>
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

  const progressMeter = weeklySync && items.length > 0 && (
    <div className="flex items-center gap-2.5 text-xs text-[var(--ink-3)] tabular-nums">
      <span>
        <span className="text-[var(--ink)]">{filled.length}</span>/{items.length} {t('pulse.filledProgress')}
      </span>
      <span className="inline-block h-1 w-20 overflow-hidden rounded-full bg-[var(--vellum)]">
        <span
          className="block h-full rounded-full bg-[var(--clay)]"
          style={{ width: `${progress}%`, transition: 'width var(--dur-3) var(--ease)' }}
        />
      </span>
    </div>
  )

  const taskLine = (task: (typeof horizonBuckets.month)[number]) => (
    <li key={task.id} className="flex items-center gap-2 py-1.5 text-[13px] text-[var(--ink)]">
      {task.goalEmoji && !task.goalEmoji.startsWith('http') && (
        <span className="w-4 shrink-0 text-center leading-none">{task.goalEmoji}</span>
      )}
      <span className="min-w-0 flex-1 truncate">
        <MentionText text={task.title} />
      </span>
      <span className="shrink-0 text-[11px] text-[var(--ink-3)] tabular-nums">
        {formatScheduledShort(task.scheduledAt)}
      </span>
    </li>
  )

  return (
    <Page width="page">
      <ScreenHeader
        title={
          <>
            {greeting}, <span className="brand-em">{t('pulse.greetingSuffix')}</span>
          </>
        }
        sub={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        actions={progressMeter}
      />

      <div className="grid grid-cols-1 gap-10 pt-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-14">
        {/* The week: the same rows as the Sync tab, flat across goals. */}
        <section>
          <div className="flex items-center justify-between pb-2" style={{ borderBottom: '1px solid var(--hairline)' }}>
            <SecLabel>{t('pulse.weekSoFar')}</SecLabel>
            <Link to="/app/sync" className="text-xs text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]">
              {t('pulse.openSync')}
            </Link>
          </div>
          {query.isLoading ? (
            <div className="animate-pulse space-y-4 pt-5" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 rounded-lg bg-[var(--hairline)]" />
              ))}
            </div>
          ) : !weeklySync ? (
            <Empty
              title={t('pulse.emptyNoSyncTitle')}
              body={t('pulse.emptyNoSyncBody')}
              cta={{ label: t('pulse.startThisWeek'), onClick: () => void handleStart() }}
            />
          ) : items.length === 0 ? (
            <Empty title={t('pulse.emptyNoItemsTitle')} body={t('pulse.emptyNoItemsBody')} />
          ) : (
            <div className="divide-y divide-[var(--hairline)]">
              {items.map((it) => (
                <WeeklySyncItemRow
                  key={it.id}
                  item={it}
                  context={manyGoals ? (it.goalTitle ?? t('pulse.unscoped')) : undefined}
                  deletingFileIds={NO_IDS}
                  onSaveText={async (content) => {
                    await setItemText.mutateAsync({ weeklySyncItemId: it.id, textContent: content })
                  }}
                  onUploadFiles={async (files) => {
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
                  onDeleteFileClick={(id, name) => {
                    if (confirm(t('weeklySync.deleteFilePrompt', { name }))) {
                      deleteAttachment.mutate(id, { onError: () => toast.error(t('pulse.saveFailed')) })
                    }
                  }}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-9">
          {upcomingFeed.length > 0 && (
            <section>
              <div className="pb-2" style={{ borderBottom: '1px solid var(--hairline)' }}>
                <SecLabel>{t('pulse.upcoming')}</SecLabel>
              </div>
              <ul className="divide-y divide-[var(--hairline)]">
                {upcomingFeed.map((row) => (
                  <li key={row.id} className="flex items-start gap-3 py-2.5">
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={
                        row.kind === 'date'
                          ? { background: 'var(--amber-soft)', color: 'var(--amber)' }
                          : { background: 'var(--plum-soft)', color: 'var(--plum)' }
                      }
                      title={row.kind === 'date' ? t('pulse.importantDateTitle') : t('pulse.bidTitle')}
                    >
                      {row.kind === 'date' ? <CalendarDays className="h-3 w-3" /> : <Gift className="h-3 w-3" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-[var(--ink)]">
                        {row.kind === 'date' ? row.label : row.content}
                        {row.kind === 'date' && row.turning !== null && row.turning > 0 && (
                          <span className="ml-1.5 text-[11px] text-[var(--ink-3)]">
                            · {t('pulse.turning', { n: row.turning })}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-[var(--ink-3)]">
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
            </section>
          )}

          {hasHorizon && (
            <section>
              <div
                className="flex items-center justify-between pb-2"
                style={{ borderBottom: '1px solid var(--hairline)' }}
              >
                <SecLabel>{t('pulse.onTheHorizon')}</SecLabel>
                <Link to="/app/tasks" className="text-xs text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]">
                  {t('pulse.openTasks')}
                </Link>
              </div>
              {horizonBuckets.month.length > 0 && (
                <ul className="pt-1">{horizonBuckets.month.slice(0, 6).map(taskLine)}</ul>
              )}
              <div className="mt-1 space-y-0.5">
                {horizonBuckets.quarter.length > 0 && (
                  <p className="py-1 text-xs text-[var(--ink-3)]">
                    {t('pulse.thisQuarter', { count: horizonBuckets.quarter.length })}
                  </p>
                )}
                {horizonBuckets.year.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowYearlySection((v) => !v)}
                    className="flex items-center gap-1 py-1 text-xs text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
                  >
                    {showYearlySection ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    {t('pulse.thisYear', { count: horizonBuckets.year.length })}
                  </button>
                )}
                {showYearlySection && <ul>{horizonBuckets.year.slice(0, 10).map(taskLine)}</ul>}
              </div>
            </section>
          )}

          {(urgent.length > 0 || inboxCount > 0) && (
            <section>
              <div className="pb-2" style={{ borderBottom: '1px solid var(--hairline)' }}>
                <SecLabel>{t('pulse.peopleAttention')}</SecLabel>
              </div>
              <ul className="divide-y divide-[var(--hairline)]">
                {urgent.slice(0, 6).map(({ person, reason }) => (
                  <li key={person.id}>
                    <Link
                      to="/app/people"
                      search={{ person: person.id }}
                      className="flex items-center gap-2.5 py-2 text-[13px] transition-colors hover:text-[var(--ink)]"
                    >
                      <Avatar name={person.name} emoji={person.emoji} size="xs" shape="circle" />
                      <span className="min-w-0 flex-1 truncate text-[var(--ink)]">{person.name}</span>
                      <span
                        className="shrink-0 text-xs"
                        style={{
                          color:
                            reason.kind === 'overdue'
                              ? 'var(--rust)'
                              : reason.kind === 'due-soon'
                                ? 'var(--amber)'
                                : 'var(--ink-3)',
                        }}
                      >
                        {reasonLabel(reason)}
                      </span>
                    </Link>
                  </li>
                ))}
                {inboxCount > 0 && (
                  <li>
                    <Link
                      to="/app/people"
                      search={{ view: 'board' }}
                      className="flex items-center justify-between py-2 text-[13px] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
                    >
                      <span>{t('pulse.peopleToSort', { count: inboxCount })}</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </li>
                )}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </Page>
  )
}

const NO_IDS: ReadonlySet<string> = new Set()

function Empty({ title, body, cta }: { title: string; body: string; cta?: { label: string; onClick: () => void } }) {
  return (
    <div className="py-10">
      <p className="text-[var(--ink)]" style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>
        {title}
      </p>
      <p className="mt-1 max-w-md text-sm text-[var(--ink-3)]">{body}</p>
      {cta && (
        <Btn kind="primary" size="sm" onClick={cta.onClick} style={{ marginTop: 16 }}>
          {cta.label}
        </Btn>
      )}
    </div>
  )
}
