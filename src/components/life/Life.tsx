import { useMemo, useState } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { Pencil, Plus, Settings2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useGoalProgress } from '~/lib/computation/use-goal-progress'
import {
  ageOn,
  chapterLength,
  chapterRange,
  chapterTense,
  daysBetween,
  lifeRows,
  spanLabel,
  sundayOf,
} from '~/lib/life'
import { useGoalsData } from '~/lib/queries/goals'
import { lifeQueryOptions, type LifeChapter, type LifeData } from '~/lib/queries/life'
import { useLocalToday } from '~/lib/use-local-today'
import { Page, ScreenHeader, SecLabel } from '../goals/ui'
import ChapterModal, { type ChapterDraft } from './ChapterModal'
import LifeSettingsForm from './LifeSettingsForm'
import LifeWeeks from './LifeWeeks'
import ViewModal from './ViewModal'
import WeekPanel from './WeekPanel'

// The Life tab: a life in weeks, with the chapters on it. See "Life" in
// AGENTS.md. The search params are the state worth linking to: which view,
// which chapter's editor, which week's panel.

const route = getRouteApi('/app/life')

const SUGGESTIONS = [
  'primarySchool',
  'highSchool',
  'university',
  'firstJob',
  'livingIn',
  'relationship',
  'startFamily',
  'retire',
] as const

export default function Life() {
  const { t } = useTranslation()
  const { data: life } = useSuspenseQuery(lifeQueryOptions())
  const today = useLocalToday()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const [settingsOpen, setSettingsOpen] = useState(false)

  if (!life.birthDate) {
    return (
      <Page>
        <ScreenHeader
          title={
            <>
              {t('life.titlePre')}
              <span className="brand-em">{t('life.titleEm')}</span>
            </>
          }
          sub={t('life.subtitle')}
        />
        <div className="mx-auto mt-6 max-w-md rounded-2xl border border-[var(--hairline)] bg-[var(--canvas)] p-7 shadow-[var(--shadow-sm)]">
          <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-display)' }}>
            {t('life.start.title')}
          </h2>
          <p className="mt-1.5 mb-5 text-sm text-[var(--ink-3)] italic" style={{ fontFamily: 'var(--font-text)' }}>
            {t('life.start.body')}
          </p>
          <LifeSettingsForm
            birthDate={null}
            lifeExpectancyYears={life.lifeExpectancyYears}
            submitLabel={t('life.start.submit')}
          />
        </div>
      </Page>
    )
  }

  const setSearch = (patch: Partial<typeof search>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })

  return (
    <Page width="page">
      <LifeScreen
        life={life}
        today={today}
        viewId={search.view ?? null}
        chapterParam={search.chapter ?? null}
        weekParam={search.week ?? null}
        setSearch={setSearch}
        settingsOpen={settingsOpen}
        setSettingsOpen={setSettingsOpen}
      />
    </Page>
  )
}

function LifeScreen({
  life,
  today,
  viewId,
  chapterParam,
  weekParam,
  setSearch,
  settingsOpen,
  setSettingsOpen,
}: {
  life: LifeData
  today: string | null
  viewId: string | null
  chapterParam: string | null
  weekParam: string | null
  setSearch: (patch: { view?: string; chapter?: string; week?: string }) => void
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const birth = life.birthDate!
  const years = life.lifeExpectancyYears
  const [focusId, setFocusId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ChapterDraft | null>(null)
  const [viewEditor, setViewEditor] = useState<'new' | 'edit' | null>(null)

  const rows = useMemo(() => lifeRows(birth, years), [birth, years])
  const view = life.views.find((v) => v.id === viewId) ?? null
  const shown = view ? life.chapters.filter((c) => view.chapterIds.includes(c.id)) : life.chapters

  // The chapter editor: from the URL (`?chapter=<id>` or `new`) or a local draft.
  const editing: ChapterDraft | null =
    draft ??
    (chapterParam === 'new'
      ? { kind: 'new' }
      : chapterParam
        ? (() => {
            const c = life.chapters.find((x) => x.id === chapterParam)
            return c ? { kind: 'edit' as const, chapter: c } : null
          })()
        : null)
  const closeEditor = () => {
    setDraft(null)
    if (chapterParam) setSearch({ chapter: undefined })
  }

  const stats = (() => {
    if (!today) return null
    const thisWeek = sundayOf(today)
    let lived = 0
    let total = 0
    for (const r of rows) {
      for (const s of r.weeks) {
        total++
        if (s < thisWeek) lived++
      }
    }
    return { age: ageOn(birth, today), lived, total, ahead: Math.max(0, total - lived) }
  })()

  const nf = new Intl.NumberFormat(i18n.language)

  return (
    <>
      <ScreenHeader
        title={
          <>
            {t('life.titlePre')}
            <span className="brand-em">{t('life.titleEm')}</span>
          </>
        }
        sub={
          stats
            ? t('life.stats', {
                age: stats.age,
                lived: nf.format(stats.lived),
                ahead: nf.format(stats.ahead),
                percent: Math.round((stats.lived / stats.total) * 100),
              })
            : t('life.subtitle')
        }
        actions={
          <>
            <button
              type="button"
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--hairline-2)] bg-[var(--canvas)] text-[var(--ink-2)] shadow-[var(--shadow-sm)] hover:text-[var(--ink)]"
              aria-label={t('life.settings.title')}
              title={t('life.settings.title')}
            >
              <Settings2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setDraft({ kind: 'new' })}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[var(--clay)] px-4 text-[13px] font-medium text-[var(--paper)] shadow-[var(--shadow-sm)]"
            >
              <Plus className="h-3.5 w-3.5" /> {t('life.newChapter')}
            </button>
          </>
        }
        below={
          <ViewsBar
            life={life}
            viewId={view?.id ?? null}
            onPick={(id) => setSearch({ view: id ?? undefined })}
            onNew={() => setViewEditor('new')}
            onEdit={() => setViewEditor('edit')}
          />
        }
      />

      {settingsOpen && (
        <div className="mb-6 max-w-md rounded-2xl border border-[var(--hairline)] bg-[var(--canvas)] p-5 shadow-[var(--shadow-sm)]">
          <div className="mb-3 flex items-center justify-between">
            <SecLabel>{t('life.settings.title')}</SecLabel>
            <button type="button" onClick={() => setSettingsOpen(false)} className="text-[var(--ink-3)]">
              <X className="h-4 w-4" />
            </button>
          </div>
          <LifeSettingsForm
            birthDate={life.birthDate}
            lifeExpectancyYears={life.lifeExpectancyYears}
            onSaved={() => setSettingsOpen(false)}
          />
        </div>
      )}

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {today ? (
            <LifeWeeks
              life={life}
              rows={rows}
              today={today}
              chapters={shown}
              focusId={focusId}
              onOpenWeek={(s) => setSearch({ week: s })}
              onSelectRange={(start, end) => setDraft({ kind: 'new', start, end })}
            />
          ) : (
            <div className="aspect-[4/5] w-full animate-pulse rounded-xl bg-[var(--vellum)]/50" />
          )}
          <Legend />
        </div>

        <aside className="min-w-0">
          <ChapterList
            life={life}
            chapters={shown}
            today={today}
            inView={Boolean(view)}
            onFocus={setFocusId}
            onOpen={(c) => setDraft({ kind: 'edit', chapter: c })}
            onSuggest={(title) => setDraft({ kind: 'new', title })}
            onEditView={() => setViewEditor('edit')}
          />
        </aside>
      </div>

      {editing && today && (
        <ChapterModal
          key={editing.kind === 'edit' ? editing.chapter.id : 'new'}
          life={life}
          draft={editing}
          defaultViewId={view?.id ?? null}
          today={today}
          onClose={closeEditor}
        />
      )}
      {viewEditor && (
        <ViewModal
          life={life}
          view={viewEditor === 'edit' ? view : null}
          onClose={() => setViewEditor(null)}
          onSaved={(id) => {
            setViewEditor(null)
            setSearch({ view: id ?? undefined })
          }}
        />
      )}
      {weekParam && today && (
        <WeekPanel
          sunday={sundayOf(weekParam)}
          birth={birth}
          today={today}
          onClose={() => setSearch({ week: undefined })}
          onStartChapter={(start) => {
            setSearch({ week: undefined })
            setDraft({ kind: 'new', start })
          }}
        />
      )}
    </>
  )
}

function ViewsBar({
  life,
  viewId,
  onPick,
  onNew,
  onEdit,
}: {
  life: LifeData
  viewId: string | null
  onPick: (id: string | null) => void
  onNew: () => void
  onEdit: () => void
}) {
  const { t } = useTranslation()
  const pill = (active: boolean) =>
    `inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] transition-colors ${
      active
        ? 'bg-[var(--ink)] text-[var(--paper)]'
        : 'border border-[var(--hairline-2)] text-[var(--ink-2)] hover:bg-[var(--vellum)]/60 hover:text-[var(--ink)]'
    }`
  return (
    <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
      <button type="button" onClick={() => onPick(null)} className={pill(viewId === null)}>
        {t('life.views.all')}
        <span className="opacity-60">{life.chapters.length}</span>
      </button>
      {life.views.map((v) => {
        const active = v.id === viewId
        return (
          <button key={v.id} type="button" onClick={() => (active ? onEdit() : onPick(v.id))} className={pill(active)}>
            {v.emoji ? `${v.emoji} ` : ''}
            {v.name}
            {active ? (
              <Pencil className="h-3 w-3 opacity-70" />
            ) : (
              <span className="opacity-60">{v.chapterIds.length}</span>
            )}
          </button>
        )
      })}
      <button
        type="button"
        onClick={onNew}
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] text-[var(--ink-3)] hover:text-[var(--ink)]"
      >
        <Plus className="h-3.5 w-3.5" /> {t('life.views.new')}
      </button>
    </div>
  )
}

function Legend() {
  const { t } = useTranslation()
  const swatch = (cls: string) => (
    <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0">
      <rect width="10" height="10" rx="2.5" className={cls} />
    </svg>
  )
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--ink-3)]">
      <span className="inline-flex items-center gap-1.5">
        {swatch('lw-past')} {t('life.legend.lived')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        {swatch('lw-now')} {t('life.legend.now')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        {swatch('lw-future')} {t('life.legend.ahead')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0">
          <rect width="10" height="10" rx="2.5" className="lw-past" />
          <circle cx="5" cy="5" r="2" className="lw-dot" />
        </svg>
        {t('life.legend.recorded')}
      </span>
      <span className="hidden italic md:inline">{t('life.legend.drag')}</span>
    </div>
  )
}

function ChapterList({
  life,
  chapters,
  today,
  inView,
  onFocus,
  onOpen,
  onSuggest,
  onEditView,
}: {
  life: LifeData
  chapters: LifeChapter[]
  today: string | null
  inView: boolean
  onFocus: (id: string | null) => void
  onOpen: (c: LifeChapter) => void
  onSuggest: (title: string) => void
  onEditView: () => void
}) {
  const { t, i18n } = useTranslation()
  const { goals, connections } = useGoalsData()
  const { getGoalProgress } = useGoalProgress(goals, connections)
  const goalById = new Map(goals.map((g) => [g.id, g]))
  const birth = life.birthDate!
  const years = life.lifeExpectancyYears

  if (chapters.length === 0) {
    if (inView) {
      return (
        <div className="rounded-xl border border-dashed border-[var(--hairline-2)] p-5 text-sm text-[var(--ink-3)]">
          <p className="italic" style={{ fontFamily: 'var(--font-text)' }}>
            {t('life.list.emptyView')}
          </p>
          <button type="button" onClick={onEditView} className="mt-3 text-xs font-medium text-[var(--clay)]">
            {t('life.list.pickChapters')}
          </button>
        </div>
      )
    }
    return (
      <div>
        <SecLabel>{t('life.list.startWith')}</SecLabel>
        <p className="mt-2 mb-4 text-sm text-[var(--ink-3)] italic" style={{ fontFamily: 'var(--font-text)' }}>
          {t('life.list.emptyBody')}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onSuggest(t(`life.suggestions.${key}`))}
              className="rounded-full border border-[var(--hairline-2)] px-3 py-1.5 text-xs text-[var(--ink-2)] hover:border-[var(--clay)] hover:text-[var(--ink)]"
            >
              + {t(`life.suggestions.${key}`)}
            </button>
          ))}
        </div>
        <p className="mt-6 text-xs text-[var(--ink-4)]">{t('life.list.askClaude')}</p>
      </div>
    )
  }

  const groups: Record<'now' | 'future' | 'past', LifeChapter[]> = { now: [], future: [], past: [] }
  for (const c of chapters) {
    const tense = today ? chapterTense(chapterRange(c, birth, years), today) : 'past'
    groups[tense].push(c)
  }
  groups.past.reverse()

  const row = (c: LifeChapter) => {
    const range = chapterRange(c, birth, years)
    const len = chapterLength(range)
    const linked = c.goalIds.map((id) => goalById.get(id)).filter((g) => g !== undefined)
    // Pacing: how far into the chapter time is, against how far its goals are.
    const elapsed =
      today && range.start <= today
        ? Math.min(1, Math.max(0, daysBetween(range.start, today) / Math.max(1, daysBetween(range.start, range.end))))
        : 0
    const done = linked.length
      ? linked.reduce((sum, g) => sum + getGoalProgress(g.id).totalProgress, 0) / linked.length / 100
      : null
    return (
      <li key={c.id}>
        <button
          type="button"
          onClick={() => onOpen(c)}
          onMouseEnter={() => onFocus(c.id)}
          onMouseLeave={() => onFocus(null)}
          onFocus={() => onFocus(c.id)}
          onBlur={() => onFocus(null)}
          className="group -mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-[var(--vellum)]/60"
        >
          <span
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm"
            style={{ background: `color-mix(in oklch, ${c.color} 22%, transparent)` }}
          >
            {c.emoji ?? <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-[var(--ink)]">{c.title}</span>
            <span className="block text-xs text-[var(--ink-3)] tabular-nums">
              {spanLabel(range, {
                locale: i18n.language,
                birth,
                years,
                today: today ?? birth,
                labels: { birth: t('life.list.birth'), end: t('life.list.end'), now: t('life.list.now') },
              })}
              {' · '}
              {len.years > 0
                ? t('life.chapter.years', { count: len.years })
                : t('life.chapter.months', { count: Math.max(1, len.months) })}
            </span>
            {linked.length > 0 && (
              <span className="mt-1.5 flex flex-wrap gap-1">
                {linked.slice(0, 3).map((g) => (
                  <span
                    key={g.id}
                    className="max-w-[10rem] truncate rounded-full bg-[var(--vellum)] px-2 py-0.5 text-[11px] text-[var(--ink-2)]"
                  >
                    {g.emoji && !g.emoji.startsWith('/') ? `${g.emoji} ` : ''}
                    {g.title}
                  </span>
                ))}
                {linked.length > 3 && <span className="text-[11px] text-[var(--ink-4)]">+{linked.length - 3}</span>}
              </span>
            )}
            {done !== null && today && range.end >= today && (
              <span className="mt-2 block">
                <span className="relative block h-1 overflow-hidden rounded-full bg-[var(--vellum)]">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${Math.round(done * 100)}%`, background: c.color }}
                  />
                </span>
                <span className="mt-1 block text-[11px] text-[var(--ink-3)] tabular-nums">
                  {t('life.list.pacing', { done: Math.round(done * 100), time: Math.round(elapsed * 100) })}
                </span>
              </span>
            )}
          </span>
        </button>
      </li>
    )
  }

  return (
    <div className="space-y-6">
      {(['now', 'future', 'past'] as const).map((k) =>
        groups[k].length ? (
          <section key={k}>
            <SecLabel>
              {t(`life.list.${k}`)}
              <span style={{ marginLeft: 8, color: 'var(--ink-4)' }}>{groups[k].length}</span>
            </SecLabel>
            <ul className="mt-1.5">{groups[k].map(row)}</ul>
          </section>
        ) : null,
      )}
    </div>
  )
}
