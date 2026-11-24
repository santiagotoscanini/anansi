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
import { Btn, Page, ScreenHeader, Section } from './ui'
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
    <li className="group flex items-start gap-3 py-3" style={{ opacity: completed ? 0.6 : 1 }}>
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        aria-label={completed ? t('bucketList.markNotDone') : t('bucketList.markDone')}
        className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full transition-colors hover:border-[var(--moss)] disabled:cursor-not-allowed"
        style={{
          border: `1.5px solid ${completed ? 'var(--moss)' : 'var(--ink-4)'}`,
          background: completed ? 'var(--moss)' : 'transparent',
          color: 'var(--paper)',
        }}
      >
        {completed && <Check className="h-3 w-3" />}
      </button>
      <button
        type="button"
        onClick={onOpen}
        disabled={busy}
        className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 text-left disabled:cursor-not-allowed"
      >
        <span className="min-w-0 flex-1">
          <span
            className="block text-[15px] text-[var(--ink)]"
            style={{ textDecoration: completed ? 'line-through' : 'none' }}
          >
            {item.content}
          </span>
          {(item.description ?? (completed && item.completedAt)) && (
            <span className="mt-0.5 block truncate text-[13px] text-[var(--ink-3)]">
              {completed && item.completedAt
                ? t('bucketList.doneOn', { date: formatCompletedDate(new Date(item.completedAt)) })
                : item.description}
            </span>
          )}
        </span>
        {linkedPeople.length > 0 && (
          <span className="mt-0.5 flex shrink-0 -space-x-1.5" title={linkedPeople.map((p) => p.name).join(', ')}>
            {linkedPeople.slice(0, 4).map((p) => (
              <span key={p.id} className="rounded-full ring-2 ring-[var(--paper)]">
                <Avatar name={p.name} emoji={p.emoji} size="xs" shape="circle" />
              </span>
            ))}
          </span>
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
    <Page>
      <ScreenHeader
        title={
          <>
            {t('bucketList.titlePre')}
            <span className="brand-em">{t('bucketList.titleEm')}</span>
          </>
        }
        sub={t('bucketList.subtitle')}
        below={
          <div className="flex items-center gap-2 rounded-lg border border-[var(--hairline)] pr-1.5 pl-3 transition-colors focus-within:border-[var(--hairline-2)]">
            <Plus className="h-4 w-4 shrink-0 text-[var(--ink-4)]" />
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
              className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-[var(--ink)] outline-hidden placeholder:text-[var(--ink-4)]"
            />
            {newContent.trim() ? (
              <Btn kind="primary" size="sm" onClick={() => void handleQuickAdd()} disabled={createMutation.isPending}>
                {t('common.add')}
              </Btn>
            ) : (
              <button
                type="button"
                onClick={() => openItem('new')}
                className="rounded-md px-2 py-1 text-xs text-[var(--ink-3)] transition-colors hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
              >
                {t('bucketList.addDetails')}
              </button>
            )}
          </div>
        }
      />

      {/* Loader-prefetched, so there is no loading state to render. */}
      {pending.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--ink-3)]">{t('bucketList.nothingYet')}</p>
      ) : (
        <ul className="divide-y divide-[var(--hairline)]">
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

      {done.length > 0 && (
        <Section label={t('bucketList.doneLabel')} count={done.length}>
          <ul className="divide-y divide-[var(--hairline)]">
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
        </Section>
      )}

      {modalState && <BucketListItemModal mode={modalState} onClose={() => openItem(undefined)} />}
    </Page>
  )
}
