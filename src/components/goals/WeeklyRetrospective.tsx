import { useQuery } from '@tanstack/react-query'
import { useState, useCallback } from 'react'
import {
  Calendar,
  Plus,
  Target,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Trash2,
  Settings,
} from 'lucide-react'
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

type GoalGroup = WeeklyRetrospectiveData['goals'][number]

type ImportanceKey = 'weeklySync.importanceLow' | 'weeklySync.importanceMedium' | 'weeklySync.importanceHigh'
const importanceKey = (importance: 'Low' | 'Medium' | 'High'): ImportanceKey =>
  importance === 'High'
    ? 'weeklySync.importanceHigh'
    : importance === 'Medium'
      ? 'weeklySync.importanceMedium'
      : 'weeklySync.importanceLow'

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

  const getWeekDateRange = useCallback((weekStart: Date) => {
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    const formatDate = (date: Date) => date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    return `${formatDate(weekStart)} - ${formatDate(weekEnd)}, ${weekStart.getFullYear()}`
  }, [])

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

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--paper)' }}>
      {defaultEditorOpen && <SyncDefaultEditor onClose={() => setDefaultEditorOpen(false)} />}
      <header className="px-6 pt-10 pb-7 md:px-12" style={{ borderBottom: '1px solid var(--hairline)' }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4">
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
              {t('weeklySync.eyebrow')}
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
              {t('weeklySync.titlePre')}
              <span className="brand-em">{t('weeklySync.titleEm')}</span>
              {t('weeklySync.titlePost')}
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
              {t('weeklySync.subtitle')}
            </p>
          </div>
          <button
            onClick={() => setDefaultEditorOpen(true)}
            className="flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm transition-all"
            style={{
              border: '1px solid var(--hairline-2)',
              background: 'var(--canvas)',
              color: 'var(--ink)',
              boxShadow: 'var(--shadow-sm)',
            }}
            title={t('weeklySync.defaultItemsTitle')}
          >
            <Settings className="h-4 w-4" />
            {t('weeklySync.defaultItems')}
          </button>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-7 md:px-12">
        {/* Week Selector */}
        <div className="mb-8 flex items-center justify-between rounded-lg border border-[var(--hairline-2)] bg-[var(--vellum)] p-4">
          <button
            onClick={() => handleWeekChange('prev')}
            className="rounded-lg p-2 transition-all hover:bg-[var(--vellum)]"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="text-center">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              <span className="text-lg font-semibold">
                {t('weeklySync.weekOf', {
                  date: selectedWeek.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                })}
              </span>
              {isCurrentWeek(selectedWeek) && (
                <span className="rounded-full bg-[var(--moss-soft)] px-2 py-1 text-xs text-[var(--moss)]">
                  {t('weeklySync.currentTag')}
                </span>
              )}
            </div>
            <span className="text-sm opacity-60">{getWeekDateRange(selectedWeek)}</span>
          </div>

          <button
            onClick={() => handleWeekChange('next')}
            className="rounded-lg p-2 transition-all hover:bg-[var(--vellum)]"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Error Display */}
        {hasError && (
          <div className="mb-6 rounded-lg border border-[var(--rust)] bg-[var(--rust-soft)] p-4">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded-full bg-[var(--rust)]"></div>
              <span className="font-medium text-[var(--rust)]">{t('weeklySync.errorBackend')}</span>
            </div>
            <p className="mt-2 text-sm text-[var(--rust)]">{hasError.message || t('weeklySync.errorDefault')}</p>
            <p className="mt-1 text-xs opacity-60">{t('weeklySync.errorDisabled')}</p>
          </div>
        )}

        {/* Main Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[var(--hairline-2)] border-t-white"></div>
              <p className="mt-2 text-sm opacity-60">{t('weeklySync.loading')}</p>
            </div>
          </div>
        ) : !weeklySync ? (
          <div className="rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] p-12 text-center">
            <Calendar className="mx-auto h-12 w-12 opacity-30" />
            <p className="mt-4 text-lg font-light">{t('weeklySync.noSync')}</p>
            <p className="mt-2 text-sm opacity-60">{t('weeklySync.noSyncHelp')}</p>
            <button
              onClick={handleStartWeeklySync}
              disabled={!!hasError}
              className={`mt-6 rounded-lg border px-4 py-2 transition-all ${
                hasError
                  ? 'cursor-not-allowed border-[var(--rust)] bg-[var(--rust-soft)] text-[var(--rust)] opacity-50'
                  : 'border-transparent bg-[var(--clay)] text-[var(--paper)] shadow-[var(--shadow-sm)]'
              }`}
            >
              <Plus className="mr-2 inline h-4 w-4" />
              {t('weeklySync.startWeeklySync')}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Inline "+ Add item to sync" picker — pulls from the user's
                library, filtering out items already on this sync. */}
            <div className="rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{t('weeklySync.addItemTitle')}</p>
                  <p className="mt-1 text-xs opacity-60">{t('weeklySync.addItemHelp')}</p>
                </div>
                <button
                  onClick={() => setPickerOpen((p) => !p)}
                  disabled={addableItems.length === 0}
                  className="flex items-center gap-2 rounded-md border border-[var(--hairline-2)] px-3 py-1.5 text-sm hover:bg-[var(--vellum)] disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  {pickerOpen
                    ? t('weeklySync.closePicker')
                    : addableItems.length === 0
                      ? t('weeklySync.nothingToAdd')
                      : t('weeklySync.pickItem')}
                </button>
              </div>
              {pickerOpen && addableItems.length > 0 && (
                <ul className="mt-3 max-h-56 overflow-y-auto rounded-md border border-[var(--hairline)] bg-[var(--paper-deep)] p-2">
                  {addableItems.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => void handleAddItemToSync(item.id)}
                        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--vellum)]"
                      >
                        <span className="truncate">{item.title}</span>
                        <span className="ml-2 shrink-0 rounded-full bg-[var(--vellum)] px-2 py-0.5 text-[10px] tracking-wide uppercase opacity-70">
                          {item.goalTitle ?? t('weeklySync.unscopedTag')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {allGroups.map((group) => {
              const isCollapsed = collapsedGoals[group.id]
              const groupStatus = getGoalStatus(group)

              return (
                <div key={group.id} className="rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] p-6">
                  {/* Group Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleGoalCollapse(group.id)}
                        className="rounded p-1 transition-all hover:bg-[var(--vellum)]"
                      >
                        {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                      </button>

                      <Target className="h-5 w-5 opacity-60" />

                      <div>
                        <h3 className="font-semibold">{group.title}</h3>
                        <p className="text-sm opacity-60">{group.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isCurrentWeek(selectedWeek) && (
                        <div
                          className={`h-3 w-3 rounded-full ${
                            groupStatus === 'complete'
                              ? 'bg-[var(--moss)]'
                              : groupStatus === 'partial'
                                ? 'bg-[var(--amber)]'
                                : 'bg-[var(--rust)]'
                          }`}
                          title={t('weeklySync.goalStatus', { status: groupStatus })}
                        />
                      )}

                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          group.importance === 'High'
                            ? 'bg-[var(--rust-soft)] text-[var(--rust)]'
                            : group.importance === 'Medium'
                              ? 'bg-[var(--amber-soft)] text-[var(--amber)]'
                              : 'bg-[var(--ink-3-soft)] text-[var(--ink-3)]'
                        }`}
                      >
                        {t(importanceKey(group.importance))}
                      </span>
                    </div>
                  </div>

                  {/* Items */}
                  {!isCollapsed && (
                    <div className="mt-4 space-y-4">
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
                        <div className="rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] p-4 text-center">
                          <p className="text-sm opacity-60">{t('weeklySync.noItemsForGoal')}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {allGroups.length === 0 && (
              <div className="rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] p-12 text-center">
                <Target className="mx-auto h-12 w-12 opacity-30" />
                <p className="mt-4 text-lg font-light">{t('weeklySync.noItemsHere')}</p>
                <p className="mt-2 text-sm opacity-60">{t('weeklySync.noItemsHereHelp')}</p>
              </div>
            )}
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        {deleteConfirmation.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--paper-deep)]">
            <div className="mx-4 w-full max-w-md rounded-lg border border-[var(--hairline-2)] bg-[var(--ink-3)] p-6">
              <div className="mb-4 flex items-start gap-3">
                <div className="shrink-0 rounded-full bg-[var(--rust-soft)] p-2">
                  <Trash2 className="h-5 w-5 text-[var(--rust)]" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-[var(--ink)]">{t('weeklySync.deleteFileTitle')}</h3>
                  <p className="mt-1 text-sm text-[var(--ink-3)]">
                    {t('weeklySync.deleteFilePrompt', { name: deleteConfirmation.fileName })}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleDeleteCancel}
                  className="flex-1 rounded-lg border border-[var(--hairline-2)] px-4 py-2 text-sm transition-all hover:bg-[var(--vellum)]"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="flex-1 rounded-lg bg-[var(--rust)] px-4 py-2 text-sm text-[var(--ink)] transition-all hover:bg-[var(--rust)]"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
