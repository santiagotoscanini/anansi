import { useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PHOTOS_PER_WEEK_MAX, type Goal } from '~/lib/api/types'
import { HEALTH_METRICS, healthMetricSchema, type HealthMetric } from '~/lib/health'
import { useCreateTrackingItem, useDeleteTrackingItem, useUpdateTrackingItem } from '~/lib/mutations/tracking-items'
import { useGoalsData } from '~/lib/queries/goals'
import { trackingItemsQueryOptions, type TrackingItemRow } from '~/lib/queries/sync'
import { Btn, Page, ScreenHeader, Section } from './ui'
import toast from 'react-hot-toast'

// User's library of items they want to track on weekly syncs. Items are
// user-owned and may or may not be linked to a goal — `goalId IS NULL` items
// show an "Unscoped" pill. Editing/creation here is independent of any goal,
// which is the whole point: you can track things (sleep, journaling cadence,
// a relationship intention) that aren't anchored to an active objective.
/** The editor's "Photos each week" value: '' is any number. */
const photosOf = (v: string) => (v ? Number(v) : null)
/** The editor's "Follows Apple Health" value: '' is none. */
const metricOf = (v: string) => healthMetricSchema.safeParse(v).data ?? null

export default function TrackingItemsLibrary() {
  const { t } = useTranslation()
  const { data: items } = useSuspenseQuery(trackingItemsQueryOptions())
  const { goals } = useGoalsData()
  const createMutation = useCreateTrackingItem()
  const updateMutation = useUpdateTrackingItem()
  const deleteMutation = useDeleteTrackingItem()

  const [creatingOpen, setCreatingOpen] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftGoalId, setDraftGoalId] = useState<string>('')
  const [draftPhotos, setDraftPhotos] = useState('')
  const [draftHealth, setDraftHealth] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editGoalId, setEditGoalId] = useState<string>('')
  const [editPhotos, setEditPhotos] = useState('')
  const [editHealth, setEditHealth] = useState('')

  const goalsById = useMemo(() => {
    const map = new Map<string, Goal>()
    for (const g of goals) map.set(g.id, g)
    return map
  }, [goals])

  const beginEdit = (item: TrackingItemRow) => {
    setEditingId(item.id)
    setEditTitle(item.title)
    setEditDescription(item.description ?? '')
    setEditGoalId(item.goalId ?? '')
    setEditPhotos(item.photosPerWeek ? String(item.photosPerWeek) : '')
    setEditHealth(item.healthMetric ?? '')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditTitle('')
    setEditDescription('')
    setEditGoalId('')
    setEditPhotos('')
    setEditHealth('')
  }

  const cancelCreate = () => {
    setCreatingOpen(false)
    setDraftTitle('')
    setDraftDescription('')
    setDraftGoalId('')
    setDraftPhotos('')
    setDraftHealth('')
  }

  const handleCreate = async () => {
    const title = draftTitle.trim()
    if (!title) {
      toast.error(t('trackingItems.titleRequired'))
      return
    }
    try {
      await createMutation.mutateAsync({
        title,
        description: draftDescription.trim() || undefined,
        goalId: draftGoalId || undefined,
        photosPerWeek: photosOf(draftPhotos),
        healthMetric: metricOf(draftHealth),
      })
      toast.success(t('trackingItems.created'))
      cancelCreate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('trackingItems.createFailed'))
    }
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    const title = editTitle.trim()
    if (!title) {
      toast.error(t('trackingItems.titleRequired'))
      return
    }
    try {
      await updateMutation.mutateAsync({
        id: editingId,
        title,
        description: editDescription.trim() || null,
        goalId: editGoalId === '' ? null : editGoalId,
        photosPerWeek: photosOf(editPhotos),
        healthMetric: metricOf(editHealth),
      })
      toast.success(t('trackingItems.saved'))
      cancelEdit()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('trackingItems.saveFailed'))
    }
  }

  const handleDelete = async (item: TrackingItemRow) => {
    if (!confirm(t('trackingItems.confirmDelete', { title: item.title }))) return
    try {
      const result = await deleteMutation.mutateAsync(item.id)
      toast.success(result.type === 'soft_delete' ? t('trackingItems.archivedSoft') : t('trackingItems.deleted'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('trackingItems.deleteFailed'))
    }
  }

  const field =
    'w-full rounded-lg border border-[var(--hairline)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] outline-hidden transition-colors placeholder:text-[var(--ink-4)] focus:border-[var(--hairline-2)]'

  const editor = (props: {
    title: string
    setTitle: (v: string) => void
    description: string
    setDescription: (v: string) => void
    goalId: string
    setGoalId: (v: string) => void
    photos: string
    setPhotos: (v: string) => void
    health: string
    setHealth: (v: string) => void
    onCancel: () => void
    onSave: () => void
    saving: boolean
    saveLabel: string
  }) => (
    <div className="space-y-2 py-4">
      <input
        autoFocus
        value={props.title}
        onChange={(e) => props.setTitle(e.target.value)}
        placeholder={t('trackingItems.titlePlaceholder')}
        className={field}
      />
      <textarea
        value={props.description}
        onChange={(e) => props.setDescription(e.target.value)}
        placeholder={t('trackingItems.descriptionPlaceholder')}
        rows={2}
        className={field}
      />
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-[var(--ink-3)]">
        <label className="flex items-center gap-2 whitespace-nowrap">
          {t('trackingItems.photosPerWeek')}
          <select
            value={props.photos}
            onChange={(e) => props.setPhotos(e.target.value)}
            className={`${field} w-auto py-1`}
          >
            <option value="">{t('trackingItems.photosAny')}</option>
            {Array.from({ length: PHOTOS_PER_WEEK_MAX }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 whitespace-nowrap">
          {t('trackingItems.followsHealth')}
          <select
            value={props.health}
            onChange={(e) => props.setHealth(e.target.value)}
            className={`${field} w-auto py-1`}
          >
            <option value="">{t('trackingItems.healthNone')}</option>
            {(Object.keys(HEALTH_METRICS) as HealthMetric[]).map((m) => (
              <option key={m} value={m}>
                {t(`health.metric.${m}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={props.goalId}
          onChange={(e) => props.setGoalId(e.target.value)}
          className={`${field} w-auto flex-1`}
        >
          <option value="">{t('trackingItems.unscopedLong')}</option>
          {[...goalsById.values()].map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
        <Btn kind="ghost" size="sm" onClick={props.onCancel}>
          {t('common.cancel')}
        </Btn>
        <Btn kind="primary" size="sm" onClick={props.onSave} disabled={props.saving}>
          {props.saveLabel}
        </Btn>
      </div>
    </div>
  )

  // Grouped by goal, in the goals' order; items with no goal last.
  const groups: { id: string; title: string; items: typeof items }[] = []
  for (const item of items) {
    const key = item.goalId && goalsById.has(item.goalId) ? item.goalId : ''
    let group = groups.find((g) => g.id === key)
    if (!group) {
      group = { id: key, title: key ? (goalsById.get(key)?.title ?? '') : t('trackingItems.unscopedLong'), items: [] }
      groups.push(group)
    }
    group.items.push(item)
  }
  groups.sort((a, b) => (a.id === '' ? 1 : b.id === '' ? -1 : 0))

  return (
    <Page>
      <ScreenHeader
        title={
          <>
            {t('trackingItems.titlePre')}
            <span className="brand-em">{t('trackingItems.titleEm')}</span>
            {t('trackingItems.titlePost')}
          </>
        }
        sub={t('trackingItems.subtitle')}
        actions={
          !creatingOpen && (
            <Btn kind="primary" size="sm" icon={Plus} onClick={() => setCreatingOpen(true)}>
              {t('trackingItems.newItem')}
            </Btn>
          )
        }
      />

      {creatingOpen &&
        editor({
          title: draftTitle,
          setTitle: setDraftTitle,
          description: draftDescription,
          setDescription: setDraftDescription,
          goalId: draftGoalId,
          setGoalId: setDraftGoalId,
          photos: draftPhotos,
          setPhotos: setDraftPhotos,
          health: draftHealth,
          setHealth: setDraftHealth,
          onCancel: cancelCreate,
          onSave: () => void handleCreate(),
          saving: createMutation.isPending,
          saveLabel: createMutation.isPending ? t('trackingItems.creating') : t('trackingItems.create'),
        })}

      {/* Loader-prefetched: no loading state to render. */}
      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--ink-3)]">
          {t('trackingItems.emptyPre')}
          <span className="text-[var(--ink)]">{t('trackingItems.emptyEm')}</span>
          {t('trackingItems.emptyPost')}
        </p>
      ) : (
        groups.map((group) => (
          <Section key={group.id || 'none'} label={group.title} count={group.items.length} className="first:mt-2">
            <ul className="divide-y divide-[var(--hairline)] border-t border-[var(--hairline)]">
              {group.items.map((item) =>
                editingId === item.id ? (
                  <li key={item.id}>
                    {editor({
                      title: editTitle,
                      setTitle: setEditTitle,
                      description: editDescription,
                      setDescription: setEditDescription,
                      goalId: editGoalId,
                      setGoalId: setEditGoalId,
                      photos: editPhotos,
                      setPhotos: setEditPhotos,
                      health: editHealth,
                      setHealth: setEditHealth,
                      onCancel: cancelEdit,
                      onSave: () => void handleSaveEdit(),
                      saving: updateMutation.isPending,
                      saveLabel: t('common.save'),
                    })}
                  </li>
                ) : (
                  <li key={item.id} className="group flex items-center gap-2">
                    <Link
                      to="/app/tracking-items"
                      search={{ item: item.id }}
                      title={t('overTime.openTitle')}
                      className="-mx-2 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-[var(--vellum)]/60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] text-[var(--ink)]">{item.title}</span>
                        {item.description && (
                          <span className="mt-0.5 block truncate text-[13px] text-[var(--ink-3)]">
                            {item.description}
                          </span>
                        )}
                        {(item.photosPerWeek !== null || item.healthMetric !== null) && (
                          <span className="mt-0.5 block truncate text-xs text-[var(--ink-4)]">
                            {[
                              item.photosPerWeek && t('trackingItems.photosMeta', { count: item.photosPerWeek }),
                              item.healthMetric && t(`health.metric.${item.healthMetric}`),
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        )}
                      </span>
                      <History className="h-4 w-4 shrink-0 text-[var(--ink-4)] transition-colors group-hover:text-[var(--ink-2)]" />
                    </Link>
                    <div className="flex shrink-0 gap-0.5 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                      <button
                        onClick={() => beginEdit(item)}
                        className="rounded-md p-1.5 text-[var(--ink-4)] transition-colors hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
                        title={t('common.edit')}
                        aria-label={t('common.edit')}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        className="rounded-md p-1.5 text-[var(--ink-4)] transition-colors hover:bg-[var(--rust-soft)] hover:text-[var(--rust)]"
                        title={t('common.delete')}
                        aria-label={t('common.delete')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ),
              )}
            </ul>
          </Section>
        ))
      )}
    </Page>
  )
}
