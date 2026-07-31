import { useSuspenseQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Check, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import type { BucketListItem } from '~/lib/api/types'
import { useCreateBucketListItem, useToggleBucketListItem } from '~/lib/mutations/people'
import { bucketListQueryOptions, peopleQueryOptions } from '~/lib/queries/people'
import { Route } from '~/routes/app.bucket'
import Avatar from './Avatar'
import BucketListItemModal from './BucketListItemModal'

function formatCompletedDate(d: Date): string {
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(d)
}

type PersonLite = { id: string; name: string; emoji: string | null }

function ItemRow({
  item,
  peopleById,
  onToggle,
  onOpen,
  busy,
}: {
  item: BucketListItem
  peopleById: Map<string, PersonLite>
  onToggle: () => void
  onOpen: () => void
  busy: boolean
}) {
  const { t } = useTranslation()
  const completed = !!item.completedAt
  const linkedPeople = item.personIds.map((id) => peopleById.get(id)).filter((p): p is PersonLite => !!p)

  return (
    <li
      className="group flex items-start gap-5 rounded-2xl transition-all"
      style={{
        background: 'var(--canvas)',
        border: '1px solid var(--hairline)',
        padding: 20,
        boxShadow: 'var(--shadow-sm)',
        opacity: completed ? 0.72 : 1,
      }}
    >
      {/* Inline check + leading bullet — a single click to toggle without
          opening the modal, large enough to feel tappable on mobile. */}
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        aria-label={completed ? t('bucketList.markNotDone') : t('bucketList.markDone')}
        className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all disabled:cursor-not-allowed"
        style={{
          border: `1.5px solid ${completed ? 'var(--moss)' : 'var(--ink-4)'}`,
          background: completed ? 'var(--moss)' : 'transparent',
          color: 'var(--paper)',
        }}
      >
        {completed && <Check className="h-3.5 w-3.5" />}
      </button>

      <button
        type="button"
        onClick={onOpen}
        disabled={busy}
        className="min-w-0 flex-1 cursor-pointer text-left disabled:cursor-not-allowed"
      >
        <div className="flex items-baseline gap-2.5">
          <h3
            className="break-words"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              lineHeight: 1.25,
              letterSpacing: '-0.01em',
              color: completed ? 'var(--ink-3)' : 'var(--ink)',
              textDecoration: completed ? 'line-through' : 'none',
            }}
          >
            {item.content}
          </h3>
          {completed && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5"
              style={{
                background: 'var(--moss-soft)',
                color: 'var(--moss)',
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              <Check className="h-2.5 w-2.5" /> {t('bucketList.doneTag')}
            </span>
          )}
        </div>

        {/* Metadata row — completed date (when completed) + with-avatars
            cluster. Uses mono small caps for the date so it reads as
            quiet metadata, not body text. */}
        <div
          className="mt-2 flex flex-wrap items-center gap-4"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--ink-3)',
            letterSpacing: '0.04em',
          }}
        >
          {completed && item.completedAt && (
            <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--moss)' }}>
              {t('bucketList.doneOn', { date: formatCompletedDate(new Date(item.completedAt)) })}
            </span>
          )}
          {linkedPeople.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              {t('bucketList.withLabel')}
              <span className="flex -space-x-1.5">
                {linkedPeople.slice(0, 5).map((p) => (
                  <span key={p.id} className="rounded-full ring-2 ring-[var(--canvas)]" title={p.name}>
                    <Avatar name={p.name} emoji={p.emoji} size="xs" shape="circle" />
                  </span>
                ))}
              </span>
              {linkedPeople.length > 5 && <span>+{linkedPeople.length - 5}</span>}
            </span>
          )}
        </div>

        {item.description && (
          <p
            className="mt-3"
            style={{
              fontFamily: 'var(--font-text)',
              fontStyle: 'italic',
              fontSize: 14,
              color: 'var(--ink-2)',
              lineHeight: 1.5,
            }}
          >
            {item.description}
          </p>
        )}
      </button>
    </li>
  )
}

export default function BucketList() {
  const { t } = useTranslation()
  const { data: listData } = useSuspenseQuery(bucketListQueryOptions())
  const { data: people } = useSuspenseQuery(peopleQueryOptions(false))

  const createMutation = useCreateBucketListItem()
  const toggleMutation = useToggleBucketListItem()

  const [newContent, setNewContent] = useState('')

  // Modal state lives in the URL (`?item=new` to create, `?item=<id>` to edit)
  // rather than in useState, so an item's editor is linkable and survives a
  // reload — the same treatment the task and person modals already had.
  //
  // Derived, not mirrored into state: an id that no longer resolves (a deleted
  // item, a hand-typed URL) simply yields null and the modal stays shut, with
  // no effect needed to notice and no stale copy to keep in sync.
  const { item: itemParam } = Route.useSearch()
  const navigate = Route.useNavigate()
  const openItem = (id: string | undefined) => void navigate({ search: (prev) => ({ ...prev, item: id }) })

  const handleQuickAdd = async () => {
    const content = newContent.trim()
    if (!content) return
    try {
      await createMutation.mutateAsync({ content })
      setNewContent('')
    } catch {
      toast.error(t('bucketList.addFailed'))
    }
  }

  const handleToggle = async (item: BucketListItem) => {
    try {
      await toggleMutation.mutateAsync({ id: item.id, completed: !item.completedAt })
    } catch {
      toast.error(t('bucketList.updateFailed'))
    }
  }

  const items = listData as BucketListItem[]

  // Resolved against the live list, so an item edited in another tab shows the
  // fresh copy and a deleted one closes the modal rather than editing a ghost.
  const editing = itemParam && itemParam !== 'new' ? items.find((i) => i.id === itemParam) : undefined
  const modalState: null | { kind: 'create' } | { kind: 'edit'; item: BucketListItem } =
    itemParam === 'new' ? { kind: 'create' } : editing ? { kind: 'edit', item: editing } : null

  const peopleById = useMemo(() => {
    const m = new Map<string, PersonLite>()
    for (const p of people) m.set(p.id, { id: p.id, name: p.name, emoji: p.emoji })
    return m
  }, [people])

  const pending = items.filter((i) => !i.completedAt).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
  const done = items.filter((i) => i.completedAt).sort((a, b) => +new Date(b.completedAt!) - +new Date(a.completedAt!))

  const busy = createMutation.isPending || toggleMutation.isPending

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--paper)' }}>
      <header className="px-6 pt-10 pb-7 md:px-12" style={{ borderBottom: '1px solid var(--hairline)' }}>
        <div className="mx-auto max-w-3xl">
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
            {t('bucketList.eyebrow', { count: items.length })}
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 44,
              lineHeight: 1.2,
              letterSpacing: '-0.02em',
              color: 'var(--ink)',
            }}
          >
            {t('bucketList.titlePre')}
            <span className="brand-em">{t('bucketList.titleEm')}</span>
          </h1>
          <p
            className="mt-3 max-w-2xl"
            style={{
              fontFamily: 'var(--font-text)',
              fontStyle: 'italic',
              fontSize: 17,
              color: 'var(--ink-2)',
              lineHeight: 1.4,
            }}
          >
            {t('bucketList.subtitle')}
          </p>
        </div>
      </header>
      <div className="mx-auto max-w-3xl space-y-6 px-6 py-7 md:px-12">
        {/* Quick add — Enter creates with content only; click an item to add people/description */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleQuickAdd()
              }
            }}
            placeholder={t('bucketList.addPlaceholder')}
            maxLength={500}
            className="flex-1 rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-4 py-2.5 text-sm text-[var(--ink)] outline-hidden transition-all placeholder:text-[var(--ink-4)] focus:border-[var(--hairline-2)] focus:bg-[var(--vellum)]"
          />
          <button
            type="button"
            onClick={() => void handleQuickAdd()}
            disabled={!newContent.trim() || createMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg px-4 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--clay)', color: 'var(--paper)', boxShadow: 'var(--shadow-sm)' }}
          >
            <Plus className="h-4 w-4" />
            {t('common.add')}
          </button>
          <button
            type="button"
            onClick={() => openItem('new')}
            className="rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-3 text-sm text-[var(--ink-2)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
            title={t('bucketList.addDetails')}
          >
            …
          </button>
        </div>

        {/* To do */}
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-[11px] font-medium tracking-wider text-[var(--ink-3)] uppercase">
              {t('bucketList.toDoLabel')} <span className="text-[var(--ink-4)]">({pending.length})</span>
            </h3>
          </div>
          {/* Loader-prefetched, so there is no loading state to render. */}
          {pending.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--hairline)] bg-[var(--vellum)] p-6 text-center text-sm text-[var(--ink-3)]">
              {t('bucketList.nothingYet')}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {pending.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  peopleById={peopleById}
                  onToggle={() => void handleToggle(item)}
                  onOpen={() => openItem(item.id)}
                  busy={busy}
                />
              ))}
            </ul>
          )}
        </section>

        {/* Done */}
        {done.length > 0 && (
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-[11px] font-medium tracking-wider text-[var(--moss)] uppercase">
                {t('bucketList.doneLabel')} <span className="text-[var(--moss)]">({done.length})</span>
              </h3>
            </div>
            <ul className="space-y-1.5">
              {done.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  peopleById={peopleById}
                  onToggle={() => void handleToggle(item)}
                  onOpen={() => openItem(item.id)}
                  busy={busy}
                />
              ))}
            </ul>
          </section>
        )}
      </div>

      {modalState && <BucketListItemModal mode={modalState} onClose={() => openItem(undefined)} />}
    </div>
  )
}
