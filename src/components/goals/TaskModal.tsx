import { useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { CheckSquare, Square, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { isEmojiUrl } from '~/lib/emoji-utils'
import { useCreateTask, useDeleteTask, useUpdateTask } from '~/lib/mutations/goals-data'
import { useGoalsData } from '~/lib/queries/goals'
import { groupsQueryOptions, peopleQueryOptions } from '~/lib/queries/people'
import DatePicker from './DatePicker'
import Avatar from './Avatar'
import EmojiPickerLazy, { type EmojiClickData } from './EmojiPickerLazy'

interface TaskModalProps {
  goalId: string
  // Null/undefined = create mode. Otherwise the modal edits the task with this id.
  taskId?: string | null
  onClose: () => void
}

// Edit/create panel for a single task — mirrors GoalModal's layout so the user
// can jump from any surface into a familiar form. Title gets its own emoji
// (separate from the parent goal's), description, difficulty, deadline,
// referent people and group tags. Edits flow through updateTask; new tasks
// flow through addTask. The goal-modal task rows now route ALL editing here
// to avoid having two ways to do the same thing.
export default function TaskModal({ goalId, taskId, onClose }: TaskModalProps) {
  const { t } = useTranslation()
  const { goals } = useGoalsData()
  const addTask = useCreateTask()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()

  const isCreate = !taskId
  const goal = goals.find((g) => g.id === goalId)
  const task = !isCreate ? (goal?.tasks.find((t) => t.id === taskId) ?? null) : null

  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [emoji, setEmoji] = useState<string>(task?.emoji ?? '')
  const [customEmojiUrl, setCustomEmojiUrl] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(task?.difficulty ?? 2)
  const [scheduledAt, setScheduledAt] = useState<Date | null>(task?.scheduledAt ? new Date(task.scheduledAt) : null)
  const [referentIds, setReferentIds] = useState<string[]>(task?.referentIds ?? [])
  const [groupIds, setGroupIds] = useState<string[]>(task?.groupIds ?? [])
  const [completed, setCompleted] = useState<boolean>(task?.completed ?? false)
  // Note: callers must pass `key={taskId}` so this modal remounts when the
  // user navigates to a different task — that resets the useState initializers
  // above. We deliberately avoid useState+useEffect-sync to dodge stale flash.

  const { data: people } = useSuspenseQuery(peopleQueryOptions(false))
  const { data: groups } = useSuspenseQuery(groupsQueryOptions())

  if (!goal || (!isCreate && !task)) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/80 p-4" onClick={onClose}>
        <div className="rounded-lg border border-[var(--hairline)] bg-[var(--canvas)] p-6 text-sm text-[var(--ink-2)]">
          {!goal ? t('taskModal.goalNotFound') : t('taskModal.taskNotFound')}
        </div>
      </div>
    )
  }

  const handleEmojiClick = (data: EmojiClickData) => {
    setEmoji(data.emoji)
    setShowEmojiPicker(false)
    setCustomEmojiUrl('')
  }

  const handleCustomEmojiUrl = () => {
    if (customEmojiUrl.trim()) {
      setEmoji(customEmojiUrl.trim())
      setCustomEmojiUrl('')
      setShowEmojiPicker(false)
      toast.success(t('taskModal.customEmojiSet'))
    }
  }

  const toggleReferent = (personId: string) => {
    setReferentIds((curr) => (curr.includes(personId) ? curr.filter((id) => id !== personId) : [...curr, personId]))
  }

  const toggleGroup = (gid: string) => {
    setGroupIds((curr) => (curr.includes(gid) ? curr.filter((id) => id !== gid) : [...curr, gid]))
  }

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error(t('taskModal.titleRequired'))
      return
    }
    const fields = {
      title: title.trim(),
      description: description.trim() ? description.trim() : null,
      emoji: emoji || null,
      difficulty,
      completed,
      scheduledAt,
      referentIds,
      groupIds,
    }
    try {
      if (isCreate) {
        await addTask.mutateAsync({ goalId, ...fields })
        toast.success(t('taskModal.taskCreated'))
      } else if (taskId) {
        await updateTask.mutateAsync({ id: taskId, goalId, ...fields })
        toast.success(t('taskModal.taskUpdated'))
      }
      onClose()
    } catch {
      // Stay open so the edits are still there to retry with.
      toast.error(t('common.saveFailed'))
    }
  }

  const handleDelete = async () => {
    if (!taskId) return
    if (!confirm(t('taskModal.confirmDelete'))) return
    try {
      await deleteTask.mutateAsync({ id: taskId, goalId })
      toast.success(t('taskModal.taskDeleted'))
      onClose()
    } catch {
      toast.error(t('common.deleteFailed'))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/80 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--hairline)] bg-[var(--canvas)] shadow-2xl backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--hairline)] bg-[var(--canvas)] px-6 py-4 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-lg font-medium tracking-tight">
              {isCreate ? t('taskModal.newTask') : t('taskModal.editTask')}
            </h2>
            <span className="shrink-0 rounded-full border border-[var(--hairline)] bg-[var(--vellum)] px-2 py-0.5 text-[11px] text-[var(--ink-2)]">
              {goal.emoji && !isEmojiUrl(goal.emoji) ? `${goal.emoji} ` : ''}
              {goal.title}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--ink-3)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 pt-5 pb-6">
          <div className="space-y-5">
            {/* Title + emoji */}
            <div>
              <label className="mb-1.5 block text-[11px] font-medium tracking-wider text-[var(--ink-3)] uppercase">
                {t('taskModal.title')}
              </label>
              <div className="relative flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker((s) => !s)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--hairline-2)] bg-[var(--vellum)] transition-all hover:border-[var(--hairline-2)] hover:bg-[var(--vellum)]"
                  title={t('taskModal.clickToChooseEmoji')}
                >
                  {emoji ? (
                    isEmojiUrl(emoji) ? (
                      <img src={emoji} alt="emoji" width={24} height={24} className="h-6 w-6 object-contain" />
                    ) : (
                      <span className="text-2xl leading-none">{emoji}</span>
                    )
                  ) : (
                    <span className="text-xs text-[var(--ink-3)]">+</span>
                  )}
                </button>

                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('taskModal.titlePlaceholder')}
                  className="h-10 flex-1 rounded-lg border border-[var(--hairline-2)] bg-[var(--vellum)] px-4 text-[var(--ink)] outline-hidden transition-all focus:border-[var(--hairline-2)]"
                  autoFocus
                />

                {showEmojiPicker && (
                  <div className="absolute top-full left-0 z-50 mt-2 rounded-lg border border-[var(--hairline-2)] bg-[var(--paper)] p-2 shadow-xl">
                    <EmojiPickerLazy onEmojiClick={handleEmojiClick} searchPlaceHolder={t('taskModal.searchEmoji')} />
                    <div className="mt-3 space-y-2 border-t border-[var(--hairline)] pt-3">
                      <label className="text-xs text-[var(--ink-2)]">{t('taskModal.customEmojiUrl')}</label>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={customEmojiUrl}
                          onChange={(e) => setCustomEmojiUrl(e.target.value)}
                          onKeyDown={(e) => {
                            e.stopPropagation()
                            if (e.key === 'Enter') handleCustomEmojiUrl()
                          }}
                          placeholder={t('taskModal.emojiUrlPlaceholder')}
                          className="flex-1 rounded border border-[var(--hairline-2)] bg-[var(--vellum)] px-3 py-1.5 text-sm text-[var(--ink)] outline-hidden transition-all placeholder:text-[var(--ink-4)] focus:border-[var(--hairline-2)]"
                        />
                        <button
                          type="button"
                          onClick={handleCustomEmojiUrl}
                          className="rounded border border-[var(--hairline-2)] bg-[var(--vellum)] px-3 py-1.5 text-sm text-[var(--ink)] transition-all hover:bg-[var(--vellum)]"
                        >
                          {t('taskModal.set')}
                        </button>
                      </div>
                      {emoji && (
                        <button
                          type="button"
                          onClick={() => {
                            setEmoji('')
                            setShowEmojiPicker(false)
                          }}
                          className="text-xs text-[var(--ink-3)] underline transition-colors hover:text-[var(--ink-2)]"
                        >
                          {t('taskModal.clearEmoji')}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="mb-1.5 block text-[11px] font-medium tracking-wider text-[var(--ink-3)] uppercase">
                {t('taskModal.description')}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('taskModal.descriptionPlaceholder')}
                rows={4}
                className="w-full resize-none rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-4 py-2.5 text-sm text-[var(--ink)] outline-hidden transition-all placeholder:text-[var(--ink-4)] focus:border-[var(--hairline-2)] focus:bg-[var(--vellum)]"
              />
            </div>

            {/* Difficulty + Deadline + Completed */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium tracking-wider text-[var(--ink-3)] uppercase">
                  {t('taskModal.difficulty')}
                </label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(parseInt(e.target.value) as 1 | 2 | 3)}
                  className="h-10 w-full rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-3 text-sm text-[var(--ink)] outline-hidden transition-all focus:border-[var(--hairline-2)]"
                >
                  <option value={1}>{t('taskModal.difficultyEasy')}</option>
                  <option value={2}>{t('taskModal.difficultyMedium')}</option>
                  <option value={3}>{t('taskModal.difficultyHard')}</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium tracking-wider text-[var(--ink-3)] uppercase">
                  {t('taskModal.deadline')}
                </label>
                <DatePicker
                  value={scheduledAt}
                  onChange={setScheduledAt}
                  placeholder={t('taskModal.noDeadline')}
                  size="md"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium tracking-wider text-[var(--ink-3)] uppercase">
                  {t('taskModal.status')}
                </label>
                <button
                  type="button"
                  onClick={() => setCompleted((c) => !c)}
                  className="flex h-10 w-full items-center gap-2 rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-3 text-sm transition-all hover:border-[var(--hairline-2)]"
                >
                  {completed ? (
                    <>
                      <CheckSquare className="h-4 w-4 text-[var(--moss)]" />
                      <span className="text-[var(--ink)]">{t('taskModal.completed')}</span>
                    </>
                  ) : (
                    <>
                      <Square className="h-4 w-4 text-[var(--ink-4)]" />
                      <span className="text-[var(--ink-2)]">{t('taskModal.open')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Referents */}
            <div>
              <label className="mb-1.5 block text-[11px] font-medium tracking-wider text-[var(--ink-3)] uppercase">
                {t('taskModal.relyingOn')}
              </label>
              {people.length === 0 ? (
                <p className="text-xs text-[var(--ink-3)]">{t('taskModal.noPeople')}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {people.map((p) => {
                    const selected = referentIds.includes(p.id)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleReferent(p.id)}
                        className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-all ${
                          selected
                            ? 'border-[var(--hairline-2)] bg-[var(--vellum)] text-[var(--ink)]'
                            : 'border-[var(--hairline)] bg-[var(--vellum)] text-[var(--ink-2)] hover:bg-[var(--vellum)] hover:text-[var(--ink)]'
                        }`}
                      >
                        <Avatar name={p.name} emoji={p.emoji} size="xs" shape="circle" />
                        <span>{p.name}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Groups */}
            <div>
              <label className="mb-1.5 block text-[11px] font-medium tracking-wider text-[var(--ink-3)] uppercase">
                {t('taskModal.groups')}
              </label>
              {groups.length === 0 ? (
                <p className="text-xs text-[var(--ink-3)]">{t('taskModal.noGroups')}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {groups.map((g) => {
                    const selected = groupIds.includes(g.id)
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => toggleGroup(g.id)}
                        className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-all ${
                          selected
                            ? 'border-[var(--hairline-2)] bg-[var(--vellum)] text-[var(--ink)]'
                            : 'border-[var(--hairline)] bg-[var(--vellum)] text-[var(--ink-2)] hover:bg-[var(--vellum)] hover:text-[var(--ink)]'
                        }`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: g.color }} />
                        <span>{g.name}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 -mx-6 mt-6 flex items-center justify-between gap-3 border-t border-[var(--hairline)] bg-[var(--canvas)] px-6 py-4 backdrop-blur">
            {isCreate ? (
              <span />
            ) : (
              <button
                onClick={() => void handleDelete()}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-[var(--ink-3)] transition-all hover:bg-[var(--rust-soft)] hover:text-[var(--rust)]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('taskModal.deleteTask')}
              </button>
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
                {isCreate ? t('taskModal.createTask') : t('common.saveChanges')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
