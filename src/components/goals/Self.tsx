'use client'

import { useMemo, useState } from 'react'
import { Plus, Trash2, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '~/trpc/react'
import { useGoals } from '~/contexts/GoalsContext'
import Avatar from './Avatar'
import type { SelfListKind, SelfPatternCategory } from '~/lib/api/types'

// ---------------------------------------------------------------------------
// Reference cheatsheets for the "How I relate" cards. Each card pairs a prose
// textarea (what the user notices in themselves) with an optional collapsible
// description of the framework so the user doesn't have to look it up. Built
// from translations at render time so they switch language live.
// ---------------------------------------------------------------------------

type Reference = { name: string; description: string }

// Pattern categories. Each surfaces as its own subgroup in the patterns
// section. Labels and helpers come from translations.
const PATTERN_CATEGORY_KEYS: { value: SelfPatternCategory; labelKey: PatternLabelKey; helperKey: PatternHelperKey }[] =
  [
    { value: 'relational', labelKey: 'self.patternRelational', helperKey: 'self.patternRelationalHelper' },
    { value: 'self_pattern', labelKey: 'self.patternSelf', helperKey: 'self.patternSelfHelper' },
    { value: 'communication', labelKey: 'self.patternCommunication', helperKey: 'self.patternCommunicationHelper' },
    { value: 'body_state', labelKey: 'self.patternBodyState', helperKey: 'self.patternBodyStateHelper' },
    { value: 'choice', labelKey: 'self.patternChoice', helperKey: 'self.patternChoiceHelper' },
  ]

type PatternLabelKey =
  | 'self.patternRelational'
  | 'self.patternSelf'
  | 'self.patternCommunication'
  | 'self.patternBodyState'
  | 'self.patternChoice'

type PatternHelperKey =
  | 'self.patternRelationalHelper'
  | 'self.patternSelfHelper'
  | 'self.patternCommunicationHelper'
  | 'self.patternBodyStateHelper'
  | 'self.patternChoiceHelper'

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

// Click-to-edit prose block. Shows the value as flowing text; click to enter
// a textarea for editing; commits on blur. Empty state is a faded affordance
// rather than a labeled empty form, so untouched sections feel like blank
// pages instead of unfinished forms.
function EditableProse({
  value,
  onSave,
  placeholder,
  rows = 5,
  variant = 'default',
}: {
  value: string
  onSave: (next: string | null) => void
  placeholder: string
  rows?: number
  variant?: 'default' | 'hero' | 'story'
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  const startEdit = () => {
    // Seed draft from the current value at the moment editing begins; avoids
    // a useEffect-driven sync that would clobber in-flight typing.
    setDraft(value)
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    const next = draft.trim() ? draft : null
    if (next !== (value || null)) onSave(next)
  }

  const textBase = 'whitespace-pre-wrap break-words leading-relaxed'
  const textSize =
    variant === 'hero'
      ? 'text-xl text-[var(--ink)]'
      : variant === 'story'
        ? 'text-base text-[var(--ink)]'
        : 'text-sm text-[var(--ink)]'
  const editingSize = variant === 'hero' ? 'text-xl' : variant === 'story' ? 'text-base' : 'text-sm'

  if (editing) {
    return (
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            commit()
          }
        }}
        autoFocus
        rows={rows}
        placeholder={placeholder}
        className={`w-full resize-none rounded-xl border border-[var(--hairline)] bg-[var(--vellum)] px-4 py-3 ${editingSize} text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-4)] focus:border-[var(--hairline-2)] focus:bg-[var(--vellum)]`}
      />
    )
  }

  if (!value) {
    return (
      <button
        onClick={startEdit}
        className={`block w-full rounded-xl border border-dashed border-[var(--hairline)] px-4 py-3 text-left ${editingSize} italic text-[var(--ink-4)] transition-colors hover:border-[var(--hairline-2)] hover:text-[var(--ink-3)]`}
      >
        {placeholder}
      </button>
    )
  }

  return (
    <div
      onClick={startEdit}
      className={`group cursor-text rounded-xl px-4 py-3 transition-colors hover:bg-[var(--vellum)] ${textBase} ${textSize}`}
    >
      {value}
    </div>
  )
}

// Single editable list row. Hidden delete button until hover. Click row to
// enter edit mode; blur to commit. Empty input on commit deletes the row.
function ListRow({
  content,
  onUpdate,
  onDelete,
}: {
  content: string
  onUpdate: (next: string) => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(content)

  const startEdit = () => {
    setDraft(content)
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (!next) {
      onDelete()
      return
    }
    if (next !== content) onUpdate(next)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            setDraft(content)
            setEditing(false)
          }
        }}
        className="w-full rounded-lg border border-[var(--hairline-2)] bg-[var(--vellum)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--hairline-2)]"
      />
    )
  }

  return (
    <div className="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--ink)] transition-colors hover:bg-[var(--vellum)]">
      <button onClick={startEdit} className="flex-1 cursor-text text-left leading-relaxed">
        {content}
      </button>
      <button
        onClick={onDelete}
        className="opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
        title={t('self.removeRow')}
      >
        <Trash2 className="h-3.5 w-3.5 text-[var(--ink-3)] hover:text-[var(--rust)]" />
      </button>
    </div>
  )
}

// A list section: existing rows plus an "Add" affordance. The empty-state
// affordance is a single fade button — no nagging, no progress meter.
function ListBucket({
  items,
  placeholder,
  emptyAffordance,
  onAdd,
  onUpdate,
  onDelete,
}: {
  items: { id: string; content: string }[]
  placeholder: string
  emptyAffordance?: string
  onAdd: (content: string) => void
  onUpdate: (id: string, content: string) => void
  onDelete: (id: string) => void
}) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const effectiveEmptyAffordance = emptyAffordance ?? t('self.addOne')

  const submitNew = () => {
    const next = draft.trim()
    if (next) onAdd(next)
    setDraft('')
    setAdding(false)
  }

  return (
    <div className="space-y-1">
      {items.map((it) => (
        <ListRow
          key={it.id}
          content={it.content}
          onUpdate={(c) => onUpdate(it.id, c)}
          onDelete={() => onDelete(it.id)}
        />
      ))}
      {adding ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={submitNew}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitNew()
            if (e.key === 'Escape') {
              setDraft('')
              setAdding(false)
            }
          }}
          placeholder={placeholder}
          className="w-full rounded-lg border border-[var(--hairline-2)] bg-[var(--vellum)] px-3 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-4)] focus:border-[var(--hairline-2)]"
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-[var(--ink-3)] transition-colors hover:bg-[var(--vellum)] hover:text-[var(--ink-2)]"
        >
          <Plus className="h-3.5 w-3.5" />
          {items.length === 0 ? effectiveEmptyAffordance : t('self.addAnother')}
        </button>
      )}
    </div>
  )
}

// Section heading. Tiny uppercase eyebrow + larger title + optional helper.
// Visual rhythm: every section follows this template so the page feels
// composed, not chaotic.
function SectionHeader({ eyebrow, title, helper }: { eyebrow: string; title: string; helper?: string }) {
  return (
    <div className="mb-4">
      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--ink-4)]">{eyebrow}</div>
      <h3 className="mt-1.5 text-2xl font-light text-[var(--ink)]">{title}</h3>
      {helper && <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-[var(--ink-3)]">{helper}</p>}
    </div>
  )
}

// Collapsible reference panel for the "How I relate" cards. Hidden by
// default — you only open it if you want a refresher on the framework.
function ReferencePanel({ items }: { items: Reference[] }) {
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-[var(--hairline)] bg-[var(--vellum)] p-4">
      {items.map((it) => (
        <div key={it.name} className="text-xs leading-relaxed text-[var(--ink-3)]">
          <span className="font-medium text-[var(--ink)]">{it.name}</span> — {it.description}
        </div>
      ))}
    </div>
  )
}

// One card in the "How I relate" section: title, prose, plus an Info button
// that toggles a small reference panel for the framework. Defaults closed —
// the framework cheatsheet is one tap away but never in the way.
function RelationCard({
  title,
  subtitle,
  value,
  reference,
  onSave,
}: {
  title: string
  subtitle: string
  value: string
  reference: Reference[]
  onSave: (next: string | null) => void
}) {
  const { t } = useTranslation()
  const [refOpen, setRefOpen] = useState(false)
  return (
    <div className="flex h-full flex-col rounded-2xl border border-[var(--hairline)] bg-[var(--vellum)] p-5 transition-colors hover:border-[var(--hairline)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-medium text-[var(--ink)]">{title}</h4>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-3)]">{subtitle}</p>
        </div>
        <button
          onClick={() => setRefOpen((v) => !v)}
          className={`flex shrink-0 items-center justify-center rounded-full border p-1.5 transition-colors ${
            refOpen
              ? 'border-[var(--hairline-2)] bg-[var(--vellum)] text-[var(--ink)]'
              : 'border-[var(--hairline)] text-[var(--ink-3)] hover:border-[var(--hairline-2)] hover:text-[var(--ink-2)]'
          }`}
          aria-label={refOpen ? t('self.hideReference') : t('self.showReference')}
          title={refOpen ? t('self.hideReference') : t('self.showReference')}
        >
          <Info className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {refOpen && <ReferencePanel items={reference} />}
      <div className={`flex-1 ${refOpen ? 'mt-3' : ''}`}>
        <EditableProse value={value} onSave={onSave} placeholder={t('self.relateNotice')} rows={4} />
      </div>
    </div>
  )
}

// Subsection heading inside a section — used to break "How I relate" into
// "Closeness" and "Repair & tension" without making each look like a
// top-level section. Smaller, lighter, no helper text.
function SubsectionHeader({ label }: { label: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--ink-3)]">{label}</span>
      <span className="h-px flex-1 bg-[var(--vellum)]" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type ListItem = { id: string; content: string }

export default function Self() {
  const { t } = useTranslation()
  const utils = api.useUtils()
  const { values } = useGoals()
  const meQuery = api.auth.me.useQuery()
  const selfQuery = api.goals.self.get.useQuery()
  const itemsQuery = api.goals.selfListItems.list.useQuery()

  const ATTACHMENT_STYLES: Reference[] = [
    { name: t('self.attachmentSecure'), description: t('self.attachmentSecureDesc') },
    { name: t('self.attachmentAnxious'), description: t('self.attachmentAnxiousDesc') },
    { name: t('self.attachmentAvoidant'), description: t('self.attachmentAvoidantDesc') },
    { name: t('self.attachmentDisorganized'), description: t('self.attachmentDisorganizedDesc') },
  ]

  const LOVE_LANGUAGES: Reference[] = [
    { name: t('self.loveWordsName'), description: t('self.loveWordsDesc') },
    { name: t('self.loveActsName'), description: t('self.loveActsDesc') },
    { name: t('self.loveGiftsName'), description: t('self.loveGiftsDesc') },
    { name: t('self.loveTimeName'), description: t('self.loveTimeDesc') },
    { name: t('self.loveTouchName'), description: t('self.loveTouchDesc') },
  ]

  const APOLOGY_LANGUAGES: Reference[] = [
    { name: t('self.apologyRegretName'), description: t('self.apologyRegretDesc') },
    { name: t('self.apologyResponsibilityName'), description: t('self.apologyResponsibilityDesc') },
    { name: t('self.apologyRestitutionName'), description: t('self.apologyRestitutionDesc') },
    { name: t('self.apologyRepentingName'), description: t('self.apologyRepentingDesc') },
    { name: t('self.apologyForgivenessName'), description: t('self.apologyForgivenessDesc') },
  ]

  const CONFLICT_STYLES: Reference[] = [
    { name: t('self.conflictCompetingName'), description: t('self.conflictCompetingDesc') },
    { name: t('self.conflictAvoidingName'), description: t('self.conflictAvoidingDesc') },
    { name: t('self.conflictAccommodatingName'), description: t('self.conflictAccommodatingDesc') },
    { name: t('self.conflictCompromisingName'), description: t('self.conflictCompromisingDesc') },
    { name: t('self.conflictCollaboratingName'), description: t('self.conflictCollaboratingDesc') },
  ]

  const STRESS_RESPONSES: Reference[] = [
    { name: t('self.stressFightName'), description: t('self.stressFightDesc') },
    { name: t('self.stressFlightName'), description: t('self.stressFlightDesc') },
    { name: t('self.stressFreezeName'), description: t('self.stressFreezeDesc') },
    { name: t('self.stressFawnName'), description: t('self.stressFawnDesc') },
  ]

  const updateSelf = api.goals.self.update.useMutation({
    onSettled: () => void utils.goals.self.get.invalidate(),
  })
  const createItem = api.goals.selfListItems.create.useMutation({
    onMutate: async (input) => {
      await utils.goals.selfListItems.list.cancel()
      const prev = utils.goals.selfListItems.list.getData()
      const sameKindCount = (prev ?? []).filter((i) => i.kind === input.kind).length
      const optimistic = {
        id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        userId: '',
        kind: input.kind,
        patternCategory: input.kind === 'pattern' ? (input.patternCategory ?? null) : null,
        content: input.content,
        orderIdx: sameKindCount,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      utils.goals.selfListItems.list.setData(undefined, (old) => [...(old ?? []), optimistic])
      return { prev }
    },
    onError: (_e, _i, ctx) => {
      if (ctx?.prev) utils.goals.selfListItems.list.setData(undefined, ctx.prev)
    },
    onSettled: () => void utils.goals.selfListItems.list.invalidate(),
  })
  const updateItemMut = api.goals.selfListItems.update.useMutation({
    onMutate: async (input) => {
      await utils.goals.selfListItems.list.cancel()
      const prev = utils.goals.selfListItems.list.getData()
      utils.goals.selfListItems.list.setData(undefined, (old) =>
        (old ?? []).map((it) => (it.id === input.id ? { ...it, ...input, updatedAt: new Date() } : it)),
      )
      return { prev }
    },
    onError: (_e, _i, ctx) => {
      if (ctx?.prev) utils.goals.selfListItems.list.setData(undefined, ctx.prev)
    },
    onSettled: () => void utils.goals.selfListItems.list.invalidate(),
  })
  const deleteItemMut = api.goals.selfListItems.delete.useMutation({
    onMutate: async (input) => {
      await utils.goals.selfListItems.list.cancel()
      const prev = utils.goals.selfListItems.list.getData()
      utils.goals.selfListItems.list.setData(undefined, (old) => (old ?? []).filter((it) => it.id !== input.id))
      return { prev }
    },
    onError: (_e, _i, ctx) => {
      if (ctx?.prev) utils.goals.selfListItems.list.setData(undefined, ctx.prev)
    },
    onSettled: () => void utils.goals.selfListItems.list.invalidate(),
  })

  const me = meQuery.data
  const self = selfQuery.data
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data])

  // Group items by kind once per data change. Patterns live in their own map
  // keyed by category so the UI can render five subgroups.
  const itemsByKind = useMemo(() => {
    const m = new Map<SelfListKind, ListItem[]>()
    for (const it of items) {
      if (it.kind === 'pattern') continue
      const arr = m.get(it.kind) ?? []
      arr.push({ id: it.id, content: it.content })
      m.set(it.kind, arr)
    }
    return m
  }, [items])

  const patternsByCategory = useMemo(() => {
    const m = new Map<SelfPatternCategory, ListItem[]>()
    for (const it of items) {
      if (it.kind !== 'pattern') continue
      const cat = it.patternCategory ?? 'self_pattern'
      const arr = m.get(cat) ?? []
      arr.push({ id: it.id, content: it.content })
      m.set(cat, arr)
    }
    return m
  }, [items])

  // Optimistic helper for prose-field saves. Patches the cache so the read
  // model stays in sync between commit and invalidate, avoiding a flash.
  const saveSelfField = (patch: Record<string, string | number | null>) => {
    utils.goals.self.get.setData(undefined, (prev) => (prev ? { ...prev, ...patch } : prev))
    updateSelf.mutate(patch)
  }

  const currentYear = new Date().getFullYear()
  const heroValue = self?.thisYearSelfDescription ?? ''
  const heroYear = self?.descriptionYear ?? null
  const showYearHint = heroValue && heroYear !== null && heroYear !== currentYear

  const onHeroSave = (next: string | null) => {
    const patch: Record<string, string | number | null> = { thisYearSelfDescription: next }
    if (next && heroYear !== currentYear) patch.descriptionYear = currentYear
    saveSelfField(patch)
  }

  const addItem = (kind: SelfListKind, content: string, patternCategory?: SelfPatternCategory) => {
    createItem.mutate({ kind, content, patternCategory: patternCategory ?? null })
  }
  const onItemUpdate = (id: string, content: string) => updateItemMut.mutate({ id, content })
  const onItemDelete = (id: string) => deleteItemMut.mutate({ id })

  return (
    <div className="h-full overflow-y-auto px-6 py-10 md:px-8" style={{ background: 'var(--paper)' }}>
      <div className="mx-auto max-w-3xl">
        {/* Hero — avatar + name with display headline + values reminder */}
        <header className="mb-12">
          <div className="mb-6 flex items-center gap-5">
            <Avatar name={me?.name ?? ''} emoji={me?.avatarUrl ?? null} size="lg" shape="circle" />
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-3)',
                }}
              >
                {t('self.selfEyebrow', { year: currentYear })}
              </div>
              <h1
                className="mt-1.5"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 44,
                  lineHeight: 1.2,
                  letterSpacing: '-0.02em',
                  color: 'var(--ink)',
                }}
              >
                {me?.name ?? ' '}
                {me?.name ? (
                  <>
                    , <span className="brand-em">{t('self.titleSuffix')}</span>
                  </>
                ) : null}
              </h1>
            </div>
          </div>
          {values.length > 0 && (
            <div className="rounded-xl border border-[var(--hairline)] bg-[var(--vellum)] px-4 py-3">
              <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--ink-4)]">
                {t('self.whatIValue')}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {values.map((v) => (
                  <span
                    key={v.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-[var(--vellum)] px-2.5 py-1 text-xs text-[var(--ink-2)]"
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: v.color }} aria-hidden />
                    {v.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </header>

        {/* "How I'd describe myself this year" — hero block */}
        <section className="mb-14">
          <SectionHeader
            eyebrow={t('self.thisYearEyebrow', { year: currentYear })}
            title={t('self.thisYearTitle')}
            helper={t('self.thisYearHelper')}
          />
          <EditableProse
            value={heroValue}
            onSave={onHeroSave}
            placeholder={t('self.thisYearPlaceholder')}
            rows={6}
            variant="hero"
          />
          {showYearHint && (
            <p className="mt-2 px-4 text-xs text-[var(--ink-4)]">
              {t('self.thisYearStaleHint', { lastYear: heroYear, currentYear })}
            </p>
          )}
        </section>

        {/* My story */}
        <section className="mb-14">
          <SectionHeader eyebrow={t('self.storyEyebrow')} title={t('self.storyTitle')} helper={t('self.storyHelper')} />
          <EditableProse
            value={self?.myStory ?? ''}
            onSave={(v) => saveSelfField({ myStory: v })}
            placeholder={t('self.storyPlaceholder')}
            rows={10}
            variant="story"
          />
        </section>

        {/* Energizes / Drains — two-column lists */}
        <section className="mb-14">
          <SectionHeader
            eyebrow={t('self.energyEyebrow')}
            title={t('self.energyTitle')}
            helper={t('self.energyHelper')}
          />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <div className="mb-2 text-xs font-medium text-[var(--moss)]">{t('self.energizes')}</div>
              <ListBucket
                items={itemsByKind.get('energizer') ?? []}
                placeholder={t('self.energizerPlaceholder')}
                emptyAffordance={t('self.addEnergizer')}
                onAdd={(c) => addItem('energizer', c)}
                onUpdate={onItemUpdate}
                onDelete={onItemDelete}
              />
            </div>
            <div>
              <div className="mb-2 text-xs font-medium text-[var(--clay-deep)]">{t('self.drains')}</div>
              <ListBucket
                items={itemsByKind.get('drainer') ?? []}
                placeholder={t('self.drainerPlaceholder')}
                emptyAffordance={t('self.addDrain')}
                onAdd={(c) => addItem('drainer', c)}
                onUpdate={onItemUpdate}
                onDelete={onItemDelete}
              />
            </div>
          </div>
        </section>

        {/* Just for me */}
        <section className="mb-14">
          <SectionHeader
            eyebrow={t('self.solitudeEyebrow')}
            title={t('self.solitudeTitle')}
            helper={t('self.solitudeHelper')}
          />
          <ListBucket
            items={itemsByKind.get('just_for_me') ?? []}
            placeholder={t('self.justForMePlaceholder')}
            emptyAffordance={t('self.addOne')}
            onAdd={(c) => addItem('just_for_me', c)}
            onUpdate={onItemUpdate}
            onDelete={onItemDelete}
          />
        </section>

        {/* What I'm proud of — placed between Solitude and Patterns, so the
            page flows from quiet self-care to quiet self-acknowledgment
            before turning toward the harder noticing work. */}
        <section className="mb-14">
          <SectionHeader eyebrow={t('self.prideEyebrow')} title={t('self.prideTitle')} helper={t('self.prideHelper')} />
          <ListBucket
            items={itemsByKind.get('proud') ?? []}
            placeholder={t('self.proudPlaceholder')}
            emptyAffordance={t('self.addOne')}
            onAdd={(c) => addItem('proud', c)}
            onUpdate={onItemUpdate}
            onDelete={onItemDelete}
          />
        </section>

        {/* My patterns — five subgrouped lists in a responsive grid. With five
            categories the wide layout breaks 3-2 (no awkward dangler), the
            tablet layout 2-2-1, and mobile stacks. Each category sits in its
            own subtle card so the grouping reads visually. */}
        <section className="mb-14">
          <SectionHeader
            eyebrow={t('self.patternsEyebrow')}
            title={t('self.patternsTitle')}
            helper={t('self.patternsHelper')}
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {PATTERN_CATEGORY_KEYS.map((cat) => {
              const label = t(cat.labelKey)
              return (
                <div
                  key={cat.value}
                  className="rounded-xl border border-white/[0.06] bg-[var(--vellum)] p-4 transition-colors hover:border-[var(--hairline)]"
                >
                  <div className="mb-2.5">
                    <div className="text-xs font-medium text-[var(--ink)]">{label}</div>
                    <div className="mt-0.5 text-[11px] italic leading-relaxed text-[var(--ink-4)]">
                      {t(cat.helperKey)}
                    </div>
                  </div>
                  <ListBucket
                    items={patternsByCategory.get(cat.value) ?? []}
                    placeholder={t('self.patternPlaceholder', { name: label.toLowerCase() })}
                    emptyAffordance={t('self.addOne')}
                    onAdd={(c) => addItem('pattern', c, cat.value)}
                    onUpdate={onItemUpdate}
                    onDelete={onItemDelete}
                  />
                </div>
              )
            })}
          </div>
        </section>

        {/* Triggers */}
        <section className="mb-14">
          <SectionHeader
            eyebrow={t('self.triggersEyebrow')}
            title={t('self.triggersTitle')}
            helper={t('self.triggersHelper')}
          />
          <ListBucket
            items={itemsByKind.get('trigger') ?? []}
            placeholder={t('self.triggerPlaceholder')}
            emptyAffordance={t('self.addTrigger')}
            onAdd={(c) => addItem('trigger', c)}
            onUpdate={onItemUpdate}
            onDelete={onItemDelete}
          />
        </section>

        {/* How I relate — six frameworks, grouped into two natural arcs:
            Closeness (what I want and how I show care) and Repair & tension
            (what I do when things go sideways). Inside each arc, the cards
            that pair semantically sit side-by-side: love-give/receive are
            mirror images of the same five-language list, and conflict
            style/stress response are both "what happens under pressure".
            Attachment and apology lead each arc full-width — they're the
            anchor concepts and warrant the breathing room. */}
        <section className="mb-14">
          <SectionHeader
            eyebrow={t('self.relateEyebrow')}
            title={t('self.relateTitle')}
            helper={t('self.relateHelper')}
          />

          <div className="mb-8">
            <SubsectionHeader label={t('self.closenessLabel')} />
            <div className="space-y-4">
              <RelationCard
                title={t('self.attachmentTitle')}
                subtitle={t('self.attachmentSubtitle')}
                value={self?.attachmentTendencies ?? ''}
                reference={ATTACHMENT_STYLES}
                onSave={(v) => saveSelfField({ attachmentTendencies: v })}
              />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <RelationCard
                  title={t('self.loveGiveTitle')}
                  subtitle={t('self.loveGiveSubtitle')}
                  value={self?.loveLanguageGive ?? ''}
                  reference={LOVE_LANGUAGES}
                  onSave={(v) => saveSelfField({ loveLanguageGive: v })}
                />
                <RelationCard
                  title={t('self.loveReceiveTitle')}
                  subtitle={t('self.loveReceiveSubtitle')}
                  value={self?.loveLanguageReceive ?? ''}
                  reference={LOVE_LANGUAGES}
                  onSave={(v) => saveSelfField({ loveLanguageReceive: v })}
                />
              </div>
            </div>
          </div>

          <div>
            <SubsectionHeader label={t('self.repairLabel')} />
            <div className="space-y-4">
              <RelationCard
                title={t('self.apologyTitle')}
                subtitle={t('self.apologySubtitle')}
                value={self?.apologyLanguage ?? ''}
                reference={APOLOGY_LANGUAGES}
                onSave={(v) => saveSelfField({ apologyLanguage: v })}
              />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <RelationCard
                  title={t('self.conflictTitle')}
                  subtitle={t('self.conflictSubtitle')}
                  value={self?.conflictStyle ?? ''}
                  reference={CONFLICT_STYLES}
                  onSave={(v) => saveSelfField({ conflictStyle: v })}
                />
                <RelationCard
                  title={t('self.stressTitle')}
                  subtitle={t('self.stressSubtitle')}
                  value={self?.stressResponse ?? ''}
                  reference={STRESS_RESPONSES}
                  onSave={(v) => saveSelfField({ stressResponse: v })}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Released */}
        <section className="mb-14">
          <SectionHeader
            eyebrow={t('self.releasedEyebrow')}
            title={t('self.releasedTitle')}
            helper={t('self.releasedHelper')}
          />
          <ListBucket
            items={itemsByKind.get('release') ?? []}
            placeholder={t('self.releasePlaceholder')}
            emptyAffordance={t('self.addRelease')}
            onAdd={(c) => addItem('release', c)}
            onUpdate={onItemUpdate}
            onDelete={onItemDelete}
          />
        </section>

        {/* Year ahead */}
        <section className="mb-14">
          <SectionHeader
            eyebrow={t('self.yearAheadEyebrow')}
            title={t('self.yearAheadTitle')}
            helper={t('self.yearAheadHelper')}
          />
          <ListBucket
            items={itemsByKind.get('year_ahead') ?? []}
            placeholder={t('self.yearAheadPlaceholder')}
            emptyAffordance={t('self.addOne')}
            onAdd={(c) => addItem('year_ahead', c)}
            onUpdate={onItemUpdate}
            onDelete={onItemDelete}
          />
        </section>

        {/* Note to future self */}
        <section className="mb-20">
          <SectionHeader
            eyebrow={t('self.futureEyebrow')}
            title={t('self.futureTitle')}
            helper={t('self.futureHelper')}
          />
          <EditableProse
            value={self?.noteToFutureSelf ?? ''}
            onSave={(v) => saveSelfField({ noteToFutureSelf: v })}
            placeholder={t('self.futurePlaceholder')}
            rows={6}
            variant="story"
          />
        </section>
      </div>
    </div>
  )
}
