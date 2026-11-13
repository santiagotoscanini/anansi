import { useSuspenseQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { X, Square, CheckSquare, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Task } from '~/lib/api/types'
import { useGoalProgress } from '~/lib/computation/use-goal-progress'
import { formatScheduledShort } from '~/lib/horizon-period'
import { useCreateGoal, useDeleteGoal, useUpdateGoal, useUpdateTask } from '~/lib/mutations/goals-data'
import { useGoalsData } from '~/lib/queries/goals'
import { groupsQueryOptions, peopleQueryOptions } from '~/lib/queries/people'
import { trackingItemsQueryOptions } from '~/lib/queries/sync'
import toast from 'react-hot-toast'
import ValueSelectionModal from './ValueSelectionModal'
import EmojiPickerLazy, { type EmojiClickData } from './EmojiPickerLazy'
import { pickDefaultEmoji, isEmojiUrl } from '~/lib/emoji-utils'
import Avatar from './Avatar'
import TaskModal from './TaskModal'
import MentionText from './MentionText'

interface GoalModalProps {
  goalId: string | null
  onClose: () => void
}

type DifficultyKey = 'goalModal.difficultyEasy' | 'goalModal.difficultyMedium' | 'goalModal.difficultyHard'

export default function GoalModal({ goalId, onClose }: GoalModalProps) {
  const { t } = useTranslation()
  const { goals, values, connections } = useGoalsData()
  const { getGoalCompletion } = useGoalProgress(goals, connections)
  const addGoal = useCreateGoal()
  const updateGoal = useUpdateGoal()
  const deleteGoal = useDeleteGoal()
  const updateTask = useUpdateTask()

  // Read-only count for the tracking-items hint at the bottom of the modal.
  // The sidebar TrackingItemsLibrary is the canonical surface for CRUD; the
  // modal used to embed a duplicate add/edit list, which created two ways to
  // do the same thing and ~150 LOC of state. H2 dropped that — we just show
  // a count + a pointer.
  //
  // Fetched unconditionally rather than with an `enabled` flag: with no goalId
  // this asks for the whole library, which the modal then ignores. That is one
  // wasted query on the create path, in exchange for not having a hook whose
  // result is conditionally undefined.
  const { data: trackingItems } = useSuspenseQuery(trackingItemsQueryOptions(goalId ?? undefined))
  const trackingItemCount = goalId ? trackingItems.length : 0

  const existingGoal = goalId ? goals.find((g) => g.id === goalId) : null

  const [title, setTitle] = useState(existingGoal?.title ?? '')
  const [description, setDescription] = useState(existingGoal?.description ?? '')
  // Seeded on the goal id when editing, and on the goal count when creating, so
  // the suggestion still varies between goals but is identical on the server and
  // the client. See pickDefaultEmoji for why that matters.
  const [emoji, setEmoji] = useState(existingGoal?.emoji ?? pickDefaultEmoji(goalId ?? String(goals.length)))
  const [customEmojiUrl, setCustomEmojiUrl] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [valueIds, setValueIds] = useState<string[]>(existingGoal?.valueIds ?? [])
  // All task editing/creation routes through TaskModal. The row stays
  // interactive only for the complete checkbox; everything else opens the
  // modal so there's a single way to do each thing. New goals must save
  // first before tasks can be added (same constraint as tracking items).
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [creatingTask, setCreatingTask] = useState(false)

  // People + groups directories — used to render the read-only avatar/dot
  // summaries on task rows. The actual picker lives in TaskModal.
  const { data: peopleData } = useSuspenseQuery(peopleQueryOptions(false))
  const peopleById = useMemo(() => {
    const map = new Map<string, (typeof peopleData)[number]>()
    for (const p of peopleData) map.set(p.id, p)
    return map
  }, [peopleData])

  const { data: groupsData } = useSuspenseQuery(groupsQueryOptions())
  const groupsById = useMemo(() => {
    const map = new Map<string, (typeof groupsData)[number]>()
    for (const g of groupsData) map.set(g.id, g)
    return map
  }, [groupsData])

  // Value selection modal state
  const [showValueModal, setShowValueModal] = useState(false)

  const completion = goalId ? getGoalCompletion(goalId) : 0

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error(t('goalModal.titleRequired'))
      return
    }

    try {
      if (goalId) {
        // For existing goals, don't update tasks here (they're managed separately)
        await updateGoal.mutateAsync({ id: goalId, title, description, emoji, valueIds })
        toast.success(t('goalModal.goalUpdated'))
      } else {
        // New goals start with no tasks — they can be added once saved.
        await addGoal.mutateAsync({
          title,
          description,
          emoji,
          valueIds,
          tasks: [],
          position: { x: 250, y: 250 },
        })
        toast.success(t('goalModal.goalCreated'))
      }
      onClose()
    } catch {
      // Stay open on failure so the user's typing isn't thrown away.
      toast.error(t('common.saveFailed'))
    }
  }

  const handleDelete = async () => {
    if (!goalId) return
    try {
      await deleteGoal.mutateAsync(goalId)
      toast.success(t('goalModal.goalDeleted'))
      onClose()
    } catch {
      toast.error(t('common.deleteFailed'))
    }
  }

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setEmoji(emojiData.emoji)
    setShowEmojiPicker(false)
    setCustomEmojiUrl('') // Clear custom URL when selecting native emoji
  }

  const handleCustomEmojiUrl = () => {
    if (customEmojiUrl.trim()) {
      setEmoji(customEmojiUrl.trim())
      setCustomEmojiUrl('')
      toast.success(t('goalModal.customEmojiSet'))
    }
  }

  // Routes to the dedicated TaskModal — only valid once the goal exists.
  const openTaskEditor = (task: Task) => {
    if (!goalId) return
    setOpenTaskId(task.id)
  }

  // For existing goals, tasks come from the live cache. New goals start
  // empty — tasks can only be added after the goal is saved.
  const displayTasks: Task[] = goalId ? (goals.find((g) => g.id === goalId)?.tasks ?? []) : []

  const handleToggleTask = (taskId: string) => {
    if (!goalId) return
    const task = displayTasks.find((t) => t.id === taskId)
    if (task) {
      updateTask.mutate({ id: taskId, goalId, completed: !task.completed })
    }
  }

  const getDifficultyKey = (difficulty: number): DifficultyKey => {
    switch (difficulty) {
      case 1:
        return 'goalModal.difficultyEasy'
      case 2:
        return 'goalModal.difficultyMedium'
      case 3:
        return 'goalModal.difficultyHard'
      default:
        return 'goalModal.difficultyMedium'
    }
  }

  const getDifficultyColor = (difficulty: number) => {
    switch (difficulty) {
      case 1:
        return 'text-[var(--moss)]'
      case 2:
        return 'text-[var(--amber)]'
      case 3:
        return 'text-[var(--rust)]'
      default:
        return 'text-[var(--amber)]'
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/80 p-4"
      onClick={showValueModal ? undefined : onClose} // Close when clicking the backdrop, unless value modal is open
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--hairline)] bg-[var(--canvas)] shadow-2xl backdrop-blur"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the modal
      >
        {/* Header — sticky so title + close stay reachable while scrolling */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--hairline)] bg-[var(--canvas)] px-6 py-4 backdrop-blur">
          <h2 className="text-lg font-medium tracking-tight">
            {goalId ? t('goalModal.editTitle') : t('goalModal.createTitle')}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--ink-3)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 pt-5 pb-6">
          {/* Goal Details */}
          <div className="space-y-5">
            {/* Title with Emoji */}
            <div>
              <label className="mb-1.5 block text-[11px] font-medium tracking-wider text-[var(--ink-3)] uppercase">
                {t('goalModal.title')}
              </label>
              <div className="relative flex gap-2">
                {/* Emoji Button */}
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--hairline-2)] bg-[var(--vellum)] transition-all hover:border-[var(--hairline-2)] hover:bg-[var(--vellum)]"
                  title={t('goalModal.clickToChooseEmoji')}
                >
                  {isEmojiUrl(emoji) ? (
                    <img src={emoji} alt="emoji" width={24} height={24} className="h-6 w-6 object-contain" />
                  ) : (
                    <span className="text-2xl leading-none">{emoji}</span>
                  )}
                </button>

                {/* Title Input */}
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('goalModal.titlePlaceholder')}
                  className="h-10 flex-1 rounded-lg border border-[var(--hairline-2)] bg-[var(--vellum)] px-4 text-[var(--ink)] outline-hidden transition-all focus:border-[var(--hairline-2)]"
                  autoFocus
                />

                {/* Emoji Picker Dropdown */}
                {showEmojiPicker && (
                  <div className="absolute top-full left-0 z-50 mt-2 rounded-lg border border-[var(--hairline-2)] bg-[var(--paper)] p-2 shadow-xl">
                    <EmojiPickerLazy onEmojiClick={handleEmojiClick} searchPlaceHolder={t('goalModal.searchEmoji')} />

                    {/* Custom Emoji URL Section */}
                    <div className="mt-3 space-y-2 border-t border-[var(--hairline)] pt-3">
                      <label className="text-xs text-[var(--ink-2)]">{t('goalModal.customEmojiUrl')}</label>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={customEmojiUrl}
                          onChange={(e) => setCustomEmojiUrl(e.target.value)}
                          onKeyDown={(e) => {
                            e.stopPropagation()
                            if (e.key === 'Enter') handleCustomEmojiUrl()
                          }}
                          placeholder={t('goalModal.emojiUrlPlaceholder')}
                          className="flex-1 rounded border border-[var(--hairline-2)] bg-[var(--vellum)] px-3 py-1.5 text-sm text-[var(--ink)] outline-hidden transition-all placeholder:text-[var(--ink-4)] focus:border-[var(--hairline-2)]"
                        />
                        <button
                          type="button"
                          onClick={handleCustomEmojiUrl}
                          className="rounded border border-[var(--hairline-2)] bg-[var(--vellum)] px-3 py-1.5 text-sm text-[var(--ink)] transition-all hover:bg-[var(--vellum)]"
                        >
                          {t('goalModal.set')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="mb-1.5 block text-[11px] font-medium tracking-wider text-[var(--ink-3)] uppercase">
                {t('goalModal.description')}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('goalModal.descriptionPlaceholder')}
                rows={3}
                className="w-full resize-none rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-4 py-2.5 text-sm text-[var(--ink)] outline-hidden transition-all placeholder:text-[var(--ink-4)] focus:border-[var(--hairline-2)] focus:bg-[var(--vellum)]"
              />
            </div>

            {/* Value Selection */}
            <div>
              <label className="mb-1.5 block text-[11px] font-medium tracking-wider text-[var(--ink-3)] uppercase">
                {t('goalModal.values')}
              </label>

              {/* Selected Values Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                {valueIds.map((valueId) => {
                  const value = values.find((v) => v.id === valueId)
                  if (!value) return null
                  return (
                    <span
                      key={value.id}
                      className="inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs font-medium text-[var(--ink)]"
                      style={{ backgroundColor: value.color }}
                    >
                      {value.name}
                      <button
                        onClick={() => setValueIds(valueIds.filter((id) => id !== valueId))}
                        className="flex items-center justify-center rounded-full p-0.5 text-[var(--ink-2)] transition-all hover:bg-[var(--paper-deep)] hover:text-[var(--ink)]"
                        aria-label={t('goalModal.removeValue', { name: value.name })}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )
                })}
                {valueIds.length < values.length && (
                  <button
                    onClick={() => setShowValueModal(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--hairline)] px-2.5 py-0.5 text-xs text-[var(--ink-3)] transition-all hover:border-[var(--hairline-2)] hover:text-[var(--ink)]"
                  >
                    <Plus className="h-3 w-3" />
                    {t('common.add')}
                  </button>
                )}
              </div>

              {values.length === 0 && <p className="mt-1 text-xs text-[var(--ink-4)]">{t('goalModal.noValuesYet')}</p>}
            </div>

            {/* Tasks Section */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <label className="text-[11px] font-medium tracking-wider text-[var(--ink-3)] uppercase">
                  {t('goalModal.tasks')}
                </label>
                {goalId && <span className="text-xs text-[var(--ink-3)]">{Math.round(completion)}%</span>}
              </div>

              {/* Add task — opens the dedicated TaskModal in create mode.
                  Disabled before the goal is saved (no goalId to attach to);
                  same constraint as tracking items. */}
              <button
                type="button"
                onClick={() => goalId && setCreatingTask(true)}
                disabled={!goalId}
                title={goalId ? t('goalModal.addTaskHint') : t('goalModal.saveGoalFirst')}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--hairline)] bg-transparent px-4 py-2 text-sm text-[var(--ink-2)] transition-all hover:border-[var(--hairline-2)] hover:bg-[var(--vellum)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--hairline)] disabled:hover:bg-transparent disabled:hover:text-[var(--ink-2)]"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('goalModal.addTask')}
              </button>

              {/* Tasks List — click any row to open the editor; only the
                  checkbox is interactive in place. Other badges are visual
                  summary only, deliberately not interactive — set them via
                  the modal so there's a single way to do each thing. */}
              <div className="space-y-1.5">
                {displayTasks.map((task) => {
                  const referents = (task.referentIds ?? [])
                    .map((id) => peopleById.get(id))
                    .filter((p): p is NonNullable<typeof p> => !!p)
                  const taskGroups = (task.groupIds ?? [])
                    .map((id) => groupsById.get(id))
                    .filter((g): g is NonNullable<typeof g> => !!g)
                  return (
                    <div
                      key={task.id}
                      onClick={() => openTaskEditor(task)}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-3 py-2 transition-colors hover:border-[var(--hairline)] hover:bg-[var(--vellum)]"
                    >
                      {/* Only interactive control on the row — toggles complete in place.
                          stopPropagation so it doesn't open the modal. */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleToggleTask(task.id)
                        }}
                        className="transition-all hover:scale-110"
                        aria-label={task.completed ? t('goalModal.markIncomplete') : t('goalModal.markComplete')}
                      >
                        {task.completed ? (
                          <CheckSquare className="h-4 w-4 text-[var(--moss)]" />
                        ) : (
                          <Square className="h-4 w-4 text-[var(--ink-4)]" />
                        )}
                      </button>
                      {task.emoji ? (
                        isEmojiUrl(task.emoji) ? (
                          <img
                            src={task.emoji}
                            alt=""
                            width={16}
                            height={16}
                            className="h-4 w-4 shrink-0 object-contain"
                          />
                        ) : (
                          <span className="shrink-0 text-base leading-none">{task.emoji}</span>
                        )
                      ) : null}
                      <span
                        className={`min-w-0 flex-1 truncate text-sm ${
                          task.completed ? 'text-[var(--ink-3)] line-through' : 'text-[var(--ink)]'
                        }`}
                      >
                        <MentionText text={task.title} />
                      </span>

                      {/* Visual-only summary badges */}
                      <span
                        className={`shrink-0 text-[10px] font-medium tracking-wide uppercase ${getDifficultyColor(task.difficulty)}`}
                      >
                        {t(getDifficultyKey(task.difficulty))}
                      </span>
                      {task.scheduledAt && (
                        <span className="shrink-0 text-[11px] text-[var(--ink-3)]">
                          {formatScheduledShort(new Date(task.scheduledAt))}
                        </span>
                      )}
                      {referents.length > 0 && (
                        <div className="hidden shrink-0 items-center sm:flex">
                          {referents.slice(0, 3).map((p, i) => (
                            <div
                              key={p.id}
                              style={{ marginLeft: i === 0 ? 0 : -6, zIndex: referents.length - i }}
                              className="relative"
                            >
                              <Avatar
                                name={p.name}
                                emoji={p.emoji}
                                size="xs"
                                shape="circle"
                                className="ring-2 ring-[var(--ink-3)]"
                              />
                            </div>
                          ))}
                          {referents.length > 3 && (
                            <span className="-ml-1.5 rounded-full border border-[var(--hairline)] bg-[var(--vellum)] px-1 text-[9px] text-[var(--ink-2)]">
                              +{referents.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                      {taskGroups.length > 0 && (
                        <div className="hidden shrink-0 items-center gap-0.5 sm:flex">
                          {taskGroups.slice(0, 4).map((g) => (
                            <span
                              key={g.id}
                              title={g.name}
                              className="h-2 w-2 rounded-full ring-1 ring-[var(--ink-3)]"
                              style={{ backgroundColor: g.color }}
                            />
                          ))}
                          {taskGroups.length > 4 && (
                            <span className="ml-0.5 text-[9px] text-[var(--ink-2)]">+{taskGroups.length - 4}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {displayTasks.length === 0 && (
                  <div className="rounded-lg border border-dashed border-[var(--hairline)] bg-transparent p-4 text-center text-xs text-[var(--ink-4)]">
                    {goalId ? t('goalModal.noTasksYet') : t('goalModal.saveFirstHint')}
                  </div>
                )}
              </div>
            </div>

            {/* Tracking-items pointer. The full CRUD lives in the
                "Tracking Items" sidebar tab (TrackingItemsLibrary). The modal
                used to embed a duplicate list here, but two surfaces meant
                two sources of truth — H2 dropped the inline editor and kept
                a small count so the user knows tracking exists. */}
            {goalId && (
              <div className="rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium tracking-wider text-[var(--ink-3)] uppercase">
                      {t('goalModal.trackingItems')}
                    </p>
                    <p className="mt-1 text-xs text-[var(--ink-3)]">
                      {trackingItemCount === 0
                        ? t('goalModal.trackingEmpty')
                        : t('goalModal.trackingCount', { count: trackingItemCount })}
                    </p>
                  </div>
                  <span className="rounded-full bg-[var(--vellum)] px-2 py-0.5 text-[11px] text-[var(--ink-2)] tabular-nums">
                    {trackingItemCount}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="sticky bottom-0 -mx-6 mt-6 flex items-center justify-between gap-3 border-t border-[var(--hairline)] bg-[var(--canvas)] px-6 py-4 backdrop-blur">
            {goalId ? (
              <button
                onClick={() => void handleDelete()}
                className="rounded-lg px-3 py-2 text-sm text-[var(--ink-3)] transition-all hover:bg-[var(--rust-soft)] hover:text-[var(--rust)]"
              >
                {t('goalModal.deleteGoal')}
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-[var(--ink-2)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => void handleSave()}
                className="rounded-lg bg-[var(--surface-inverse)] px-4 py-2 text-sm font-medium text-[var(--on-inverse)] transition-all hover:bg-[var(--surface-inverse)]"
              >
                {goalId ? t('common.saveChanges') : t('goalModal.createGoal')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Value Selection Modal */}
      {showValueModal && (
        <ValueSelectionModal
          availableValues={values}
          selectedValueIds={valueIds}
          onConfirm={(selectedIds) => setValueIds(selectedIds)}
          onClose={() => setShowValueModal(false)}
        />
      )}

      {/* Task editor — opened from the row title or the edit affordance.
          key={openTaskId} forces a remount when the user opens a different
          task while the modal is up, resetting useState initializers. */}
      {goalId && openTaskId && (
        <TaskModal key={openTaskId} goalId={goalId} taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
      )}

      {/* Task creator — opened from the "Add task" button. Same modal, no taskId. */}
      {goalId && creatingTask && <TaskModal goalId={goalId} taskId={null} onClose={() => setCreatingTask(false)} />}
    </div>
  )
}
