import { useQuery } from '@tanstack/react-query'
import { useState, useCallback } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Plus, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  useCreateWeeklySync,
  useDeleteAttachment,
  useRemoveSyncItem,
  useSetSyncItemText,
  useUploadSyncAttachment,
  useAddSyncItem,
} from '~/lib/mutations/weekly-sync'
import { weeklyRetrospectiveQueryOptions, type SyncItem, type WeeklyRetrospectiveData } from '~/lib/queries/sync'
import { weekStartOf } from '~/lib/week'
import { Route } from '~/routes/app.sync'
import toast from 'react-hot-toast'
import SyncDefaultEditor from './SyncDefaultEditor'
import WeeklySyncItemRow from './WeeklySyncItemRow'
import { Btn, Page, ScreenHeader } from './ui'

type GoalGroup = WeeklyRetrospectiveData['goals'][number]

// Each rendered group — either a real goal (from data.goals) or the synthesized
// "Unscoped" bucket for items whose underlying tracking item has goalId IS NULL.
type DisplayGroup = {
  id: string
  title: string
  description: string
  importance: 'Low' | 'Medium' | 'High'
  items: SyncItem[]
}

type CollapsedGoals = Record<string, boolean>

interface DeleteConfirmation {
  isOpen: boolean
  fileId: string
  fileName: string
}

const getFileType = (fileName: string): 'image' | 'document' | 'video' | 'audio' | 'other' => {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''

  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(extension)) {
    return 'image'
  } else if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'].includes(extension)) {
    return 'video'
  } else if (['mp3', 'wav', 'ogg', 'aac', 'flac'].includes(extension)) {
    return 'audio'
  } else if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'xls', 'xlsx', 'ppt', 'pptx'].includes(extension)) {
    return 'document'
  } else {
    return 'other'
  }
}

export default function WeeklyRetrospective() {
  const { t } = useTranslation()
  const createWeeklySync = useCreateWeeklySync()
  const addSyncItem = useAddSyncItem()
  const removeSyncItemMutation = useRemoveSyncItem()
  const setItemTextMutation = useSetSyncItemText()
  const uploadAttachment = useUploadSyncAttachment()
  const deleteAttachment = useDeleteAttachment()

  // `?week=YYYY-MM-DD` when the user has navigated; otherwise the current week,
  // resolved here rather than in the route loader. `weekStartOf` works in LOCAL
  // time, and a loader also runs on the server — see app.pulse.tsx.
  const { week } = Route.useSearch()
  const navigate = Route.useNavigate()
  const selectedWeek = week ? weekStartOf(new Date(`${week}T00:00:00`)) : weekStartOf(new Date())
  const setSelectedWeek = (next: Date) => {
    const iso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
    void navigate({ search: { week: iso } })
  }

  // `useQuery`, not suspense: the week is not known until this component runs,
  // so there is nothing for a loader to have prefetched, and the screen already
  // renders a loading state and an error banner of its own.
  const weeklyRetrospectiveQuery = useQuery(weeklyRetrospectiveQueryOptions(selectedWeek))
  const retrospectiveData: WeeklyRetrospectiveData | undefined = weeklyRetrospectiveQuery.data
  const weeklySync = retrospectiveData?.weeklySync
  const isLoading = weeklyRetrospectiveQuery.isLoading
  const hasError = weeklyRetrospectiveQuery.error

  // Synthesize an "Unscoped" group for sync items whose tracking item has
  // goalId IS NULL. The id "__unscoped__" is read by the per-item collapse/
  // status code below. React Compiler memoizes — no manual useMemo.
  const goalGroups: DisplayGroup[] = (retrospectiveData?.goals ?? []).map((g: GoalGroup) => ({
    id: g.id,
    title: g.title,
    description: g.description,
    importance: g.importance,
    items: g.items,
  }))
  const unscopedItems = retrospectiveData?.unscopedItems ?? []
  const allGroups: DisplayGroup[] =
    unscopedItems.length === 0
      ? goalGroups
      : [
          ...goalGroups,
          {
            id: '__unscoped__',
            title: t('weeklySync.unscopedTitle'),
            description: t('weeklySync.unscopedDescription'),
            importance: 'Low',
            items: unscopedItems,
          },
        ]

  const [collapsedGoals, setCollapsedGoals] = useState<CollapsedGoals>({})
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation>({
    isOpen: false,
    fileId: '',
    fileName: '',
  })
  const [deletingFiles, setDeletingFiles] = useState<Set<string>>(new Set())

  const isCurrentWeek = useCallback((weekStart: Date) => {
    return weekStart.getTime() === weekStartOf(new Date()).getTime()
  }, [])

  const handleWeekChange = (direction: 'prev' | 'next') => {
    const newWeek = new Date(selectedWeek)
    if (direction === 'prev') {
      newWeek.setDate(newWeek.getDate() - 7)
    } else {
      newWeek.setDate(newWeek.getDate() + 7)
    }
    setSelectedWeek(newWeek)
  }

  const handleStartWeeklySync = async () => {
    if (hasError) {
      toast.error(t('weeklySync.errorCreateBlocked'))
      return
    }

    try {
      await createWeeklySync.mutateAsync({ weekDate: selectedWeek })
      toast.success(t('weeklySync.syncStarted'))
    } catch (error) {
      toast.error(t('weeklySync.startFailed'))
      console.error('Failed to create weekly sync:', error)
    }
  }

  const toggleGoalCollapse = (goalId: string) => {
    setCollapsedGoals((prev) => ({
      ...prev,
      [goalId]: !prev[goalId],
    }))
  }

  // Per-item handlers — invoked from WeeklySyncItemRow which owns the local
  // draft + debounce. The row hands us the resolved content to persist.
  const saveItemText = useCallback(
    async (item: SyncItem, content: string) => {
      try {
        await setItemTextMutation.mutateAsync({ weeklySyncItemId: item.id, textContent: content })
      } catch (error) {
        console.error('Failed to auto-save text:', error)
        toast.error(t('weeklySync.saveTextFailed'))
        throw error
      }
    },
    [setItemTextMutation, t],
  )

  const uploadItemFiles = async (item: SyncItem, files: FileList) => {
    if (files.length === 0) return
    if (!weeklySync?.id) {
      toast.error(t('weeklySync.noWeeklySync'))
      return
    }
    try {
      toast.loading(t('weeklySync.uploadingImages'), { id: 'image-upload' })
      const uploads = Array.from(files).map(
        (file) =>
          new Promise<void>((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => {
              void (async () => {
                try {
                  if (!reader.result) throw new Error(t('weeklySync.noFileData'))
                  await uploadAttachment.mutateAsync({
                    weeklySyncId: weeklySync.id,
                    trackingItemId: item.trackingItemId,
                    fileName: file.name,
                    fileType: getFileType(file.name),
                    data: reader.result as string,
                  })
                  resolve()
                } catch (err) {
                  reject(err instanceof Error ? err : new Error(String(err)))
                }
              })()
            }
            reader.onerror = () => reject(new Error(t('weeklySync.readFileFailed')))
            reader.readAsDataURL(file)
          }),
      )
      await Promise.all(uploads)
      toast.success(t('weeklySync.imagesUploaded', { count: files.length }), { id: 'image-upload' })
    } catch (error) {
      console.error('Failed to upload images:', error)
      toast.error(t('weeklySync.uploadFailed'), { id: 'image-upload' })
    }
  }

  const handleDeleteFileClick = (fileId: string, fileName: string) => {
    setDeleteConfirmation({ isOpen: true, fileId, fileName })
  }

  const handleDeleteCancel = () => {
    setDeleteConfirmation({ isOpen: false, fileId: '', fileName: '' })
  }

  const handleDeleteConfirm = async () => {
    const { fileId, fileName } = deleteConfirmation
    if (!fileId) return

    setDeletingFiles((prev) => new Set(prev).add(fileId))

    try {
      await deleteAttachment.mutateAsync(fileId)
      toast.success(t('weeklySync.fileDeleted', { name: fileName }))
    } catch (error) {
      console.error('Failed to delete file:', error)
      toast.error(t('weeklySync.fileDeleteFailed', { name: fileName }))
    } finally {
      setDeletingFiles((prev) => {
        const newSet = new Set(prev)
        newSet.delete(fileId)
        return newSet
      })
      handleDeleteCancel()
    }
  }

  const getItemStatus = (item: SyncItem): 'complete' | 'partial' | 'missing' => {
    const hasFiles = item.attachments.length > 0
    const hasText = !!item.textContent && item.textContent.trim().length > 0
    if (hasFiles && hasText) return 'complete'
    if (hasFiles || hasText) return 'partial'
    return 'missing'
  }

  const getGoalStatus = (group: DisplayGroup): 'complete' | 'partial' | 'missing' => {
    if (group.items.length === 0) return 'missing'
    const statuses = group.items.map(getItemStatus)
    const completeCount = statuses.filter((s) => s === 'complete').length
    const partialCount = statuses.filter((s) => s === 'partial').length
    if (completeCount === statuses.length) return 'complete'
    if (completeCount > 0 || partialCount > 0) return 'partial'
    return 'missing'
  }

  const [defaultEditorOpen, setDefaultEditorOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const handleAddItemToSync = async (trackingItemId: string) => {
    if (!weeklySync) return
    try {
      await addSyncItem.mutateAsync({ weeklySyncId: weeklySync.id, trackingItemId })
      toast.success(t('weeklySync.addedToSync'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('weeklySync.addToSyncFailed'))
    }
  }

  const handleRemoveFromSync = async (weeklySyncItemId: string, title: string) => {
    if (!confirm(t('weeklySync.confirmRemove', { title }))) return
    try {
      await removeSyncItemMutation.mutateAsync({ weeklySyncItemId })
      toast.success(t('weeklySync.removedFromSync'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('weeklySync.removeFromSyncFailed'))
    }
  }

  const itemsOnSync = new Set<string>()
  for (const g of allGroups) {
    for (const it of g.items) itemsOnSync.add(it.trackingItemId)
  }
  const addableItems = (retrospectiveData?.allTrackingItems ?? []).filter((i) => !itemsOnSync.has(i.id))

  const filledCount = (group: DisplayGroup) => group.items.filter((it) => getItemStatus(it) !== 'missing').length
  const weekEnd = new Date(selectedWeek)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const shortDate = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const current = isCurrentWeek(selectedWeek)

  const weekSwitch = (
    <div className="flex items-center gap-1">
      {!current && (
        <button
          type="button"
          onClick={() => setSelectedWeek(weekStartOf(new Date()))}
          className="mr-1 rounded-md px-2 py-1 text-xs text-[var(--ink-3)] transition-colors hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
        >
          {t('weeklySync.thisWeek')}
        </button>
      )}
      <div className="flex items-center rounded-lg border border-[var(--hairline-2)] bg-[var(--canvas)]">
        <button
          type="button"
          onClick={() => handleWeekChange('prev')}
          className="rounded-l-lg p-1.5 text-[var(--ink-3)] transition-colors hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
          aria-label={t('weeklySync.previousWeek')}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[8.5rem] px-1 text-center text-sm text-[var(--ink)] tabular-nums">
          {shortDate(selectedWeek)} –{' '}
          {weekEnd.getMonth() === selectedWeek.getMonth() ? weekEnd.getDate() : shortDate(weekEnd)}
        </span>
        <button
          type="button"
          onClick={() => handleWeekChange('next')}
          className="rounded-r-lg p-1.5 text-[var(--ink-3)] transition-colors hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
          aria-label={t('weeklySync.nextWeek')}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => setDefaultEditorOpen(true)}
        className="ml-1 rounded-lg p-2 text-[var(--ink-3)] transition-colors hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
        title={t('weeklySync.defaultItemsTitle')}
        aria-label={t('weeklySync.defaultItems')}
      >
        <Settings className="h-4 w-4" />
      </button>
    </div>
  )

  return (
    <Page>
      {defaultEditorOpen && <SyncDefaultEditor onClose={() => setDefaultEditorOpen(false)} />}
      <ScreenHeader
        title={
          <>
            {t('weeklySync.titlePre')}
            <span className="brand-em">{t('weeklySync.titleEm')}</span>
            {t('weeklySync.titlePost')}
          </>
        }
        sub={current ? t('weeklySync.subCurrent') : t('weeklySync.weekOf', { date: shortDate(selectedWeek) })}
        actions={weekSwitch}
      />

      {hasError && (
        <div className="mb-6 rounded-lg border border-[var(--rust)] bg-[var(--rust-soft)] px-4 py-3 text-sm text-[var(--rust)]">
          <span className="font-medium">{t('weeklySync.errorBackend')}</span>{' '}
          {hasError.message || t('weeklySync.errorDefault')}
        </div>
      )}

      {isLoading ? (
        <div className="animate-pulse space-y-6 pt-4" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-3">
              <div className="h-4 w-48 rounded bg-[var(--hairline-2)]" />
              <div className="h-20 rounded-xl bg-[var(--hairline)]" />
            </div>
          ))}
        </div>
      ) : !weeklySync ? (
        <div className="flex flex-col items-center py-20 text-center">
          <Calendar className="h-8 w-8 text-[var(--ink-4)]" />
          <p className="mt-4 text-[var(--ink)]" style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>
            {t('weeklySync.noSync')}
          </p>
          <p className="mt-1 text-sm text-[var(--ink-3)]">{t('weeklySync.noSyncHelp')}</p>
          <Btn
            kind="primary"
            icon={Plus}
            onClick={() => void handleStartWeeklySync()}
            disabled={!!hasError}
            style={{ marginTop: 20 }}
          >
            {t('weeklySync.startWeeklySync')}
          </Btn>
        </div>
      ) : (
        <div className="space-y-10 pt-2">
          {allGroups.map((group) => {
            const isCollapsed = collapsedGoals[group.id]
            const groupStatus = getGoalStatus(group)
            const filled = filledCount(group)
            return (
              <section key={group.id}>
                <button
                  type="button"
                  onClick={() => toggleGoalCollapse(group.id)}
                  className="group/head flex w-full items-center gap-2.5 pb-2 text-left"
                  style={{ borderBottom: '1px solid var(--hairline)' }}
                  aria-expanded={!isCollapsed}
                >
                  <ChevronRight
                    className={`h-3.5 w-3.5 shrink-0 text-[var(--ink-4)] transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                  />
                  <span
                    className="min-w-0 flex-1 truncate text-[var(--ink)]"
                    style={{ fontFamily: 'var(--font-display)', fontSize: 19 }}
                  >
                    {group.title}
                  </span>
                  {group.items.length > 0 && (
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--ink-3)] tabular-nums">
                      {current && (
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            groupStatus === 'complete'
                              ? 'bg-[var(--moss)]'
                              : groupStatus === 'partial'
                                ? 'bg-[var(--amber)]'
                                : 'bg-[var(--ink-4)]'
                          }`}
                        />
                      )}
                      {t('weeklySync.filledOf', { filled, total: group.items.length })}
                    </span>
                  )}
                </button>
                {!isCollapsed && (
                  <div className="divide-y divide-[var(--hairline)]">
                    {group.items.length > 0 ? (
                      group.items.map((item) => (
                        <WeeklySyncItemRow
                          key={item.id}
                          item={item}
                          deletingFileIds={deletingFiles}
                          onSaveText={(content) => saveItemText(item, content)}
                          onUploadFiles={(files) => uploadItemFiles(item, files)}
                          onDeleteFileClick={handleDeleteFileClick}
                          onRemoveFromSync={() => handleRemoveFromSync(item.id, item.title)}
                        />
                      ))
                    ) : (
                      <p className="py-4 text-sm text-[var(--ink-3)]">{t('weeklySync.noItemsForGoal')}</p>
                    )}
                  </div>
                )}
              </section>
            )
          })}

          {allGroups.length === 0 && (
            <p className="py-10 text-center text-sm text-[var(--ink-3)]">{t('weeklySync.noItemsHereHelp')}</p>
          )}

          {/* Adding an item from the library: a quiet line at the end, a short list when open. */}
          <div>
            <button
              type="button"
              onClick={() => setPickerOpen((p) => !p)}
              disabled={addableItems.length === 0}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--ink-3)] transition-colors hover:bg-[var(--vellum)] hover:text-[var(--ink)] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {addableItems.length === 0 ? t('weeklySync.nothingToAdd') : t('weeklySync.addItemTitle')}
            </button>
            {pickerOpen && addableItems.length > 0 && (
              <ul className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-[var(--hairline-2)] bg-[var(--canvas)] p-1 shadow-[var(--shadow-md)]">
                {addableItems.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPickerOpen(false)
                        void handleAddItemToSync(item.id)
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--vellum)]"
                    >
                      <span className="truncate text-[var(--ink)]">{item.title}</span>
                      <span className="shrink-0 truncate text-xs text-[var(--ink-3)]">
                        {item.goalTitle ?? t('weeklySync.unscopedTag')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {deleteConfirmation.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)]/60 p-4 backdrop-blur-xs"
          onClick={handleDeleteCancel}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--hairline-2)] bg-[var(--canvas)] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-medium text-[var(--ink)]">{t('weeklySync.deleteFileTitle')}</h3>
            <p className="mt-1 text-sm text-[var(--ink-3)]">
              {t('weeklySync.deleteFilePrompt', { name: deleteConfirmation.fileName })}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Btn kind="ghost" size="sm" onClick={handleDeleteCancel}>
                {t('common.cancel')}
              </Btn>
              <Btn
                kind="primary"
                size="sm"
                onClick={() => void handleDeleteConfirm()}
                style={{ background: 'var(--rust)' }}
              >
                {t('common.delete')}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </Page>
  )
}
