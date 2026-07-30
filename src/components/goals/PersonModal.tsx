'use client'

import { useRef, useState } from 'react'
import { CheckSquare, HelpCircle, Loader2, Mountain, Square, Target, Upload, X } from 'lucide-react'
import EmojiPicker, { type EmojiClickData, Theme } from 'emoji-picker-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { api } from '~/trpc/react'
import type { PersonCategory } from '~/lib/api/types'
import Avatar from './Avatar'
import ColorPicker from './ColorPicker'
import DatePicker from './DatePicker'
import PersonBidsSection from './PersonBidsSection'
import PersonImportantDatesSection from './PersonImportantDatesSection'

export type PersonRow = {
  id: string
  name: string
  emoji: string | null
  category: PersonCategory
  boardOrder: number
  appreciation: string | null
  myNeeds: string | null
  legacyMessage: string | null
  selfReflection: string | null
  decideBy: Date | null
  archivedAt: Date | null
  groupIds?: string[]
}

interface PersonModalProps {
  person: PersonRow | null
  defaultCategory?: PersonCategory
  onClose: () => void
  onSaved: () => void
}

// Translation key unions for the category select (typed dynamic keys).
type CategoryLabelKey =
  | 'personModal.categoryExploring'
  | 'personModal.categoryContextBound'
  | 'personModal.categoryLongTerm'
  | 'personModal.categoryToProcess'
type CategoryHintKey =
  | 'personModal.categoryExploringHint'
  | 'personModal.categoryContextBoundHint'
  | 'personModal.categoryLongTermHint'
  | 'personModal.categoryToProcessHint'

// Ordered to match the natural arc of a relationship — see RelationshipsBoard.tsx.
const CATEGORY_OPTIONS: { value: PersonCategory; labelKey: CategoryLabelKey; hintKey: CategoryHintKey }[] = [
  { value: 'exploring', labelKey: 'personModal.categoryExploring', hintKey: 'personModal.categoryExploringHint' },
  {
    value: 'context_bound',
    labelKey: 'personModal.categoryContextBound',
    hintKey: 'personModal.categoryContextBoundHint',
  },
  { value: 'long_term', labelKey: 'personModal.categoryLongTerm', hintKey: 'personModal.categoryLongTermHint' },
  { value: 'to_process', labelKey: 'personModal.categoryToProcess', hintKey: 'personModal.categoryToProcessHint' },
]

function sixMonthsFromNow(): Date {
  const d = new Date()
  d.setMonth(d.getMonth() + 6)
  return d
}

// Shared styling tokens — kept at the top so any adjustments cascade. The
// helper-text class moved out with the bids/dates sections (H2); only the
// label class is still used here.
const fieldLabel = 'mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)]'
const inputClass =
  'w-full rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-4 py-2 text-sm text-[var(--ink)] outline-none transition-all placeholder:text-[var(--ink-4)] focus:border-[var(--hairline-2)] focus:bg-[var(--vellum)]'
const textareaClass = `${inputClass} resize-none`

// Field label with an optional hint surfaced via a hover tooltip on a small `?` icon —
// keeps the form vertically tight (philosophical helper text doesn't take a row each).
function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)]">{children}</span>
      {hint && (
        <span className="group relative inline-flex">
          <HelpCircle className="h-3 w-3 cursor-help text-[var(--ink-4)] transition-colors hover:text-[var(--ink-2)]" />
          <span
            role="tooltip"
            className="pointer-events-none invisible absolute left-0 top-full z-30 mt-1.5 w-64 rounded-md border border-[var(--hairline)] bg-[var(--canvas)] p-2.5 text-xs leading-relaxed text-[var(--ink-2)] opacity-0 shadow-2xl transition-opacity group-hover:visible group-hover:opacity-100"
          >
            {hint}
          </span>
        </span>
      )}
    </div>
  )
}

export default function PersonModal({ person, defaultCategory, onClose, onSaved }: PersonModalProps) {
  const { t } = useTranslation()
  const isEdit = !!person

  const [name, setName] = useState(person?.name ?? '')
  const [emoji, setEmoji] = useState<string | null>(person?.emoji ?? null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [category, setCategory] = useState<PersonCategory>(person?.category ?? defaultCategory ?? 'exploring')
  const [appreciation, setAppreciation] = useState(person?.appreciation ?? '')
  const [myNeeds, setMyNeeds] = useState(person?.myNeeds ?? '')
  const [legacyMessage, setLegacyMessage] = useState(person?.legacyMessage ?? '')
  const [groupIds, setGroupIds] = useState<string[]>(person?.groupIds ?? [])
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupColor, setNewGroupColor] = useState('#60a5fa')

  const groupsQuery = api.goals.groups.getAll.useQuery()
  const createGroupMutation = api.goals.groups.create.useMutation()
  const utils = api.useUtils()
  const [selfReflection, setSelfReflection] = useState(person?.selfReflection ?? '')
  const [decideBy, setDecideBy] = useState<Date | null>(
    person?.decideBy ?? (category === 'exploring' && !isEdit ? sixMonthsFromNow() : null),
  )

  const createMutation = api.goals.people.create.useMutation()
  const updateMutation = api.goals.people.update.useMutation()
  const archiveMutation = api.goals.people.archive.useMutation()
  const unarchiveMutation = api.goals.people.unarchive.useMutation()
  const deleteMutation = api.goals.people.delete.useMutation()
  const uploadImageMutation = api.goals.people.uploadImage.useMutation()

  const referentTasksQuery = api.goals.people.getTasksAsReferent.useQuery(
    { personId: person?.id ?? '' },
    { enabled: !!person?.id },
  )

  const bucketListItemsQuery = api.goals.people.getBucketListItemsAsParticipant.useQuery(
    { personId: person?.id ?? '' },
    { enabled: !!person?.id },
  )

  // Bids and important-dates sections were extracted to standalone components
  // (H2). The section owns its own queries + mutations + composer state — all
  // gated on `personId` so the unsaved-create flow shows a "save first" hint.
  // The parent only needs to know the personId to pass through.

  const isSaving =
    createMutation.isPending || updateMutation.isPending || archiveMutation.isPending || deleteMutation.isPending

  const handleCategoryChange = (value: string) => {
    const next = value as PersonCategory
    setCategory(next)
    if (next === 'exploring' && !decideBy) {
      setDecideBy(sixMonthsFromNow())
    }
  }

  const buildPayload = () => ({
    name: name.trim(),
    emoji,
    category,
    appreciation: appreciation.trim() || null,
    myNeeds: myNeeds.trim() || null,
    legacyMessage: legacyMessage.trim() || null,
    groupIds,
    selfReflection: selfReflection.trim() || null,
    decideBy: category === 'exploring' ? decideBy : null,
  })

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(t('personModal.nameRequired'))
      return
    }
    const payload = buildPayload()
    try {
      if (isEdit && person) {
        await updateMutation.mutateAsync({ id: person.id, ...payload })
        toast.success(t('personModal.updated'))
      } else {
        await createMutation.mutateAsync(payload)
        toast.success(t('personModal.added'))
      }
      onSaved()
      onClose()
    } catch {
      toast.error(t('personModal.saveFailed'))
    }
  }

  const handleArchiveToggle = async () => {
    if (!person) return
    try {
      if (person.archivedAt) {
        await unarchiveMutation.mutateAsync({ id: person.id })
        toast.success(t('personModal.unarchived'))
      } else {
        await archiveMutation.mutateAsync({ id: person.id })
        toast.success(t('personModal.archived'))
      }
      onSaved()
      onClose()
    } catch {
      toast.error(t('personModal.updateFailed'))
    }
  }

  const handleDelete = async () => {
    if (!person) return
    if (!confirm(t('personModal.confirmDelete', { name: person.name }))) return
    try {
      await deleteMutation.mutateAsync({ id: person.id })
      toast.success(t('personModal.deleted'))
      onSaved()
      onClose()
    } catch {
      toast.error(t('personModal.deleteFailed'))
    }
  }

  const handleEmojiClick = (data: EmojiClickData) => {
    setEmoji(data.emoji)
    setShowEmojiPicker(false)
  }

  // Read a local file as base64, upload it, stash the returned URL in
  // `emoji`. Server doesn't need a personId — the file lives at a
  // content-addressed path so the same flow works for new + existing people.
  const handleFileUpload = async (file: File) => {
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const { url } = await uploadImageMutation.mutateAsync({ fileName: file.name, data })
      setEmoji(url)
      setShowEmojiPicker(false)
      toast.success(t('personModal.pictureUploaded'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('personModal.uploadFailed'))
    }
  }

  const referentTasks = referentTasksQuery.data ?? []
  const bucketListItems = bucketListItemsQuery.data ?? []
  const groups = groupsQuery.data ?? []

  const activeCategoryHint = CATEGORY_OPTIONS.find((c) => c.value === category)?.hintKey

  return (
    <div
      className="bg-[var(--ink)]/80 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--hairline)] bg-[var(--canvas)] shadow-2xl backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--hairline)] bg-[var(--canvas)] px-6 py-4 backdrop-blur">
          <h2 className="text-lg font-medium tracking-tight">
            {isEdit ? t('personModal.editTitle') : t('personModal.addTitle')}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--ink-3)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 pb-6 pt-5">
          <div className="space-y-5">
            {/* Name + Avatar */}
            <div>
              <label className={fieldLabel}>{t('personModal.name')}</label>
              <div className="relative flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="rounded-lg ring-white/20 transition-all hover:ring-1"
                  title={t('personModal.clickToSetEmoji')}
                >
                  <Avatar name={name || '?'} emoji={emoji} size="md" />
                </button>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('personModal.namePlaceholder')}
                  className={`h-10 flex-1 rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-4 text-sm text-[var(--ink)] outline-none transition-all placeholder:text-[var(--ink-4)] focus:border-[var(--hairline-2)] focus:bg-[var(--vellum)]`}
                  autoFocus
                />
                {showEmojiPicker && (
                  <div className="absolute left-0 top-full z-50 mt-2 rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-2 shadow-2xl">
                    <EmojiPicker
                      onEmojiClick={handleEmojiClick}
                      width={350}
                      height={400}
                      theme={Theme.DARK}
                      searchPlaceHolder={t('personModal.searchEmoji')}
                    />
                    <div className="mt-2 space-y-2 border-t border-[var(--hairline)] pt-2">
                      <label className="block text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
                        {t('personModal.uploadPicture')}
                      </label>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadImageMutation.isPending}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--hairline)] bg-[var(--vellum)] px-3 py-2 text-xs text-[var(--ink-2)] transition-all hover:border-[var(--hairline-2)] hover:bg-[var(--vellum)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {uploadImageMutation.isPending ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            {t('personModal.uploading')}
                          </>
                        ) : (
                          <>
                            <Upload className="h-3.5 w-3.5" />
                            {t('personModal.chooseImage')}
                          </>
                        )}
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) void handleFileUpload(file)
                          e.target.value = '' // Allow re-selecting the same file
                        }}
                      />
                      {emoji && (
                        <button
                          type="button"
                          onClick={() => {
                            setEmoji(null)
                            setShowEmojiPicker(false)
                          }}
                          className="text-xs text-[var(--ink-3)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
                        >
                          {t('personModal.useInitial')}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Category */}
            <div>
              <FieldLabel hint={activeCategoryHint ? t(activeCategoryHint) : undefined}>
                {t('personModal.category')}
              </FieldLabel>
              <select value={category} onChange={(e) => handleCategoryChange(e.target.value)} className={inputClass}>
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-[var(--canvas)]">
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            {/* Groups — inline tag picker */}
            <div>
              <FieldLabel hint={t('personModal.groupsHint')}>{t('personModal.groups')}</FieldLabel>
              <div className="flex flex-wrap items-center gap-1.5">
                {groups.map((g) => {
                  const selected = groupIds.includes(g.id)
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() =>
                        setGroupIds((prev) => (prev.includes(g.id) ? prev.filter((x) => x !== g.id) : [...prev, g.id]))
                      }
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-all ${
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
                {creatingGroup ? (
                  <div className="flex items-center gap-1.5 rounded-full border border-[var(--hairline-2)] bg-[var(--vellum)] px-2 py-0.5">
                    <ColorPicker value={newGroupColor} onChange={setNewGroupColor} size="sm" />
                    <input
                      type="text"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && newGroupName.trim()) {
                          const g = await createGroupMutation.mutateAsync({
                            name: newGroupName.trim(),
                            color: newGroupColor,
                            orderIdx: 0,
                          })
                          await utils.goals.groups.getAll.invalidate()
                          if (g) setGroupIds((prev) => [...prev, g.id])
                          setNewGroupName('')
                          setCreatingGroup(false)
                        }
                        if (e.key === 'Escape') {
                          setNewGroupName('')
                          setCreatingGroup(false)
                        }
                      }}
                      placeholder={t('personModal.groupNamePlaceholder')}
                      className="w-28 bg-transparent text-xs text-[var(--ink)] outline-none placeholder:text-[var(--ink-3)]"
                      autoFocus
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCreatingGroup(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--hairline)] px-2.5 py-0.5 text-xs text-[var(--ink-3)] transition-all hover:border-[var(--hairline-2)] hover:text-[var(--ink)]"
                  >
                    {t('personModal.newGroup')}
                  </button>
                )}
              </div>
            </div>

            {/* Exploring-only: decide by */}
            {category === 'exploring' && (
              <div>
                <FieldLabel hint={t('personModal.decideByHint')}>{t('personModal.decideBy')}</FieldLabel>
                <DatePicker value={decideBy} onChange={setDecideBy} placeholder={t('personModal.pickDate')} />
              </div>
            )}

            {/* Reflection — quiet section divider */}
            <div className="pt-2">
              <div className="mb-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-[var(--vellum)]" />
                <span className="text-[10px] uppercase tracking-widest text-[var(--ink-4)]">
                  {t('personModal.reflection')}
                </span>
                <div className="h-px flex-1 bg-[var(--vellum)]" />
              </div>
            </div>

            {/* What I appreciate */}
            <div>
              <FieldLabel hint={t('personModal.appreciateHint')}>{t('personModal.appreciateLabel')}</FieldLabel>
              <textarea
                value={appreciation}
                onChange={(e) => setAppreciation(e.target.value)}
                placeholder={t('personModal.appreciatePlaceholder')}
                rows={3}
                className={textareaClass}
              />
            </div>

            {/* What I need from them */}
            <div>
              <FieldLabel hint={t('personModal.needsHint')}>{t('personModal.needsLabel')}</FieldLabel>
              <textarea
                value={myNeeds}
                onChange={(e) => setMyNeeds(e.target.value)}
                placeholder={t('personModal.needsPlaceholder')}
                rows={3}
                className={textareaClass}
              />
            </div>

            {/* Legacy message — also the place for unfinished business */}
            <div>
              <FieldLabel hint={t('personModal.legacyHint')}>{t('personModal.legacyLabel')}</FieldLabel>
              <textarea
                value={legacyMessage}
                onChange={(e) => setLegacyMessage(e.target.value)}
                placeholder={t('personModal.legacyPlaceholder')}
                rows={3}
                className={textareaClass}
              />
            </div>

            {/* Self reflection */}
            <div>
              <FieldLabel hint={t('personModal.selfReflectionHint')}>{t('personModal.selfReflectionLabel')}</FieldLabel>
              <textarea
                value={selfReflection}
                onChange={(e) => setSelfReflection(e.target.value)}
                placeholder={t('personModal.selfReflectionPlaceholder')}
                rows={3}
                className={textareaClass}
              />
            </div>

            <PersonBidsSection personId={person?.id} />

            <PersonImportantDatesSection personId={person?.id} />

            {/* Tasks where this person is a referent */}
            {isEdit && (
              <div className="pt-2">
                <div className="mb-3 flex items-center gap-3">
                  <div className="h-px flex-1 bg-[var(--vellum)]" />
                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-[var(--ink-4)]">
                    <Target className="h-3 w-3" />
                    {t('personModal.tasksReferentSection')}
                  </span>
                  <div className="h-px flex-1 bg-[var(--vellum)]" />
                </div>
                {referentTasksQuery.isLoading ? (
                  <p className="text-xs text-[var(--ink-3)]">{t('personModal.tasksReferentLoading')}</p>
                ) : referentTasks.length === 0 ? (
                  <p className="text-xs text-[var(--ink-4)]">{t('personModal.tasksReferentEmpty')}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {referentTasks.map((t) => (
                      <li
                        key={t.taskId}
                        className="flex items-start gap-2.5 rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-3 py-2 text-sm transition-colors hover:border-[var(--hairline)] hover:bg-[var(--vellum)]"
                      >
                        {t.completed ? (
                          <CheckSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--moss)]" />
                        ) : (
                          <Square className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-4)]" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div
                            className={`truncate ${t.completed ? 'text-[var(--ink-3)] line-through' : 'text-[var(--ink)]'}`}
                          >
                            {t.taskTitle}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-[var(--ink-3)]">
                            {t.goalEmoji && <span>{t.goalEmoji}</span>}
                            <span className="truncate">{t.goalTitle}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Bucket list items where this person is named — read-only counterpart
                to the people-picker on each bucket item. */}
            {isEdit && (
              <div className="pt-2">
                <div className="mb-3 flex items-center gap-3">
                  <div className="h-px flex-1 bg-[var(--vellum)]" />
                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-[var(--ink-4)]">
                    <Mountain className="h-3 w-3" />
                    {t('personModal.bucketTogetherSection')}
                  </span>
                  <div className="h-px flex-1 bg-[var(--vellum)]" />
                </div>
                {bucketListItemsQuery.isLoading ? (
                  <p className="text-xs text-[var(--ink-3)]">{t('personModal.tasksReferentLoading')}</p>
                ) : bucketListItems.length === 0 ? (
                  <p className="text-xs text-[var(--ink-4)]">{t('personModal.bucketTogetherEmpty')}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {bucketListItems.map((b) => (
                      <li
                        key={b.id}
                        className="flex items-start gap-2.5 rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-3 py-2 text-sm transition-colors hover:border-[var(--hairline)] hover:bg-[var(--vellum)]"
                      >
                        {b.completedAt ? (
                          <CheckSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--moss)]" />
                        ) : (
                          <Square className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-4)]" />
                        )}
                        <div
                          className={`min-w-0 flex-1 truncate ${
                            b.completedAt ? 'text-[var(--ink-3)] line-through' : 'text-[var(--ink)]'
                          }`}
                        >
                          {b.content}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sticky footer */}
        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-[var(--hairline)] bg-[var(--canvas)] px-6 py-4 backdrop-blur">
          <div className="flex items-center gap-1">
            {isEdit && (
              <>
                <button
                  onClick={handleArchiveToggle}
                  disabled={isSaving}
                  className="rounded-lg px-3 py-2 text-sm text-[var(--ink-3)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)] disabled:opacity-50"
                >
                  {person?.archivedAt ? t('personModal.unarchive') : t('personModal.archive')}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isSaving}
                  className="rounded-lg px-3 py-2 text-sm text-[var(--ink-3)] transition-all hover:bg-[var(--rust-soft)] hover:text-[var(--rust)] disabled:opacity-50"
                >
                  {t('common.delete')}
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="rounded-lg px-4 py-2 text-sm text-[var(--ink-2)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)] disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-lg bg-[var(--surface-inverse)] px-4 py-2 text-sm font-medium text-[var(--on-inverse)] transition-all hover:bg-[var(--surface-inverse)] disabled:opacity-50"
            >
              {isEdit ? t('common.saveChanges') : t('personModal.addPerson')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
