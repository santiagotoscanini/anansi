import { useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import type { BucketListItem } from '~/lib/api/types'
import { useCreateBucketListItem, useDeleteBucketListItem, useUpdateBucketListItem } from '~/lib/mutations/people'
import { peopleQueryOptions } from '~/lib/queries/people'
import Avatar from './Avatar'

const fieldLabel = 'mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)]'
const inputClass =
  'w-full rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-4 py-2 text-sm text-[var(--ink)] outline-none transition-all placeholder:text-[var(--ink-4)] focus:border-[var(--hairline-2)] focus:bg-[var(--vellum)]'
const textareaClass = `${inputClass} resize-none`

type Mode = { kind: 'create' } | { kind: 'edit'; item: BucketListItem }

// No `onSaved` callback: every mutation in here invalidates the bucket-list
// and people keys itself, so the parent has nothing to do after a save.
interface BucketListItemModalProps {
  mode: Mode
  onClose: () => void
}

export default function BucketListItemModal({ mode, onClose }: BucketListItemModalProps) {
  const { t } = useTranslation()
  const isEdit = mode.kind === 'edit'
  const item = isEdit ? mode.item : null

  const [content, setContent] = useState(item?.content ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [personIds, setPersonIds] = useState<string[]>(item?.personIds ?? [])

  const { data: people } = useSuspenseQuery(peopleQueryOptions(false))
  const createMutation = useCreateBucketListItem()
  const updateMutation = useUpdateBucketListItem()
  const deleteMutation = useDeleteBucketListItem()

  const isSaving = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending

  const togglePerson = (id: string) => {
    setPersonIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
  }

  const handleSave = async () => {
    const trimmed = content.trim()
    if (!trimmed) {
      toast.error(t('bucketItem.addName'))
      return
    }
    try {
      if (isEdit && item) {
        await updateMutation.mutateAsync({
          id: item.id,
          content: trimmed,
          description: description.trim() || null,
          personIds,
        })
        toast.success(t('bucketItem.saved'))
      } else {
        await createMutation.mutateAsync({
          content: trimmed,
          description: description.trim() || null,
          personIds,
        })
        toast.success(t('bucketItem.added'))
      }
      onClose()
    } catch {
      toast.error(t('bucketItem.saveFailed'))
    }
  }

  const handleDelete = async () => {
    if (!item) return
    if (!confirm(t('bucketItem.confirmDelete'))) return
    try {
      await deleteMutation.mutateAsync(item.id)
      toast.success(t('bucketItem.deleted'))
      onClose()
    } catch {
      toast.error(t('bucketItem.deleteFailed'))
    }
  }

  const sortedPeople = [...people].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div
      className="bg-[var(--ink)]/80 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[var(--hairline)] bg-[var(--canvas)] shadow-2xl backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--hairline)] bg-[var(--canvas)] px-6 py-4 backdrop-blur">
          <h2 className="text-lg font-medium tracking-tight">
            {isEdit ? t('bucketItem.editTitle') : t('bucketItem.addTitle')}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--ink-3)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-6 pb-6 pt-5">
          {/* Content */}
          <div>
            <label className={fieldLabel}>{t('bucketItem.thingToDo')}</label>
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  void handleSave()
                }
              }}
              placeholder={t('bucketItem.thingPlaceholder')}
              maxLength={500}
              autoFocus
              className={inputClass}
            />
          </div>

          {/* Description */}
          <div>
            <label className={fieldLabel}>{t('bucketItem.descriptionLabel')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('bucketItem.descriptionPlaceholder')}
              rows={4}
              maxLength={2000}
              className={textareaClass}
            />
          </div>

          {/* People to do it with */}
          <div>
            <label className={fieldLabel}>{t('bucketItem.peopleLabel')}</label>
            {sortedPeople.length === 0 ? (
              <p className="text-xs text-[var(--ink-3)]">{t('bucketItem.noPeopleYet')}</p>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                {sortedPeople.map((p) => {
                  const selected = personIds.includes(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePerson(p.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all ${
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
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-[var(--hairline)] bg-[var(--canvas)] px-6 py-3 backdrop-blur">
          {isEdit ? (
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rust)] bg-[var(--rust-soft)] px-3 py-1.5 text-xs text-[var(--rust)] transition-all hover:bg-[var(--rust-soft)] hover:text-[var(--rust)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('common.delete')}
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--hairline)] bg-transparent px-4 py-1.5 text-sm text-[var(--ink-2)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving || !content.trim()}
              className="rounded-lg border border-[var(--hairline-2)] bg-[var(--surface-inverse)] px-4 py-1.5 text-sm text-[var(--on-inverse)] transition-all hover:bg-[var(--surface-inverse)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isEdit ? t('common.save') : t('common.add')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
