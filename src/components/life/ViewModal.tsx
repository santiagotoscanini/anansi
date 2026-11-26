import { useState } from 'react'
import { Check, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useCreateLifeView, useDeleteLifeView, useUpdateLifeView } from '~/lib/mutations/life'
import type { LifeData, LifeView } from '~/lib/queries/life'

// A view: a name and the chapters it shows ("Education", "Where I lived").

export default function ViewModal({
  life,
  view,
  onClose,
  onSaved,
}: {
  life: LifeData
  view: LifeView | null
  onClose: () => void
  onSaved: (id: string | null) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(view?.name ?? '')
  const [chapterIds, setChapterIds] = useState<string[]>(view?.chapterIds ?? [])
  const create = useCreateLifeView()
  const update = useUpdateLifeView()
  const remove = useDeleteLifeView()
  const saving = create.isPending || update.isPending || remove.isPending

  const save = async () => {
    if (!name.trim()) {
      toast.error(t('life.view.needsName'))
      return
    }
    try {
      const saved = view
        ? await update.mutateAsync({ id: view.id, name: name.trim(), chapterIds })
        : await create.mutateAsync({ name: name.trim(), chapterIds })
      onSaved(saved.id)
    } catch {
      toast.error(t('common.saveFailed'))
    }
  }

  const destroy = async () => {
    if (!view || !confirm(t('life.view.confirmDelete', { name: view.name }))) return
    try {
      await remove.mutateAsync(view.id)
      onSaved(null)
    } catch {
      toast.error(t('common.deleteFailed'))
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--scrim)]/70 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-md flex-col rounded-t-2xl bg-[var(--canvas)] shadow-[var(--shadow-pop)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-6 pt-5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('life.view.namePlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-2xl text-[var(--ink)] outline-hidden placeholder:text-[var(--ink-4)]"
            style={{ fontFamily: 'var(--font-display)' }}
          />
          <button type="button" onClick={onClose} className="text-[var(--ink-3)] hover:text-[var(--ink)]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="px-6 pt-1 text-sm text-[var(--ink-3)] italic" style={{ fontFamily: 'var(--font-text)' }}>
          {t('life.view.help')}
        </p>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          {life.chapters.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-[var(--ink-4)] italic">{t('life.view.noChapters')}</p>
          ) : (
            <ul>
              {life.chapters.map((c) => {
                const on = chapterIds.includes(c.id)
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setChapterIds((ids) => (on ? ids.filter((i) => i !== c.id) : [...ids, c.id]))}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-[var(--vellum)]/60"
                    >
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border"
                        style={{
                          borderColor: on ? c.color : 'var(--hairline-2)',
                          background: on ? c.color : 'transparent',
                        }}
                      >
                        {on && <Check className="h-3.5 w-3.5 text-white" />}
                      </span>
                      <span className="truncate text-[var(--ink)]">
                        {c.emoji ? `${c.emoji} ` : ''}
                        {c.title}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-[var(--hairline)] px-6 py-4">
          {view ? (
            <button
              type="button"
              onClick={() => void destroy()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 text-xs text-[var(--ink-3)] hover:text-[var(--rust)]"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t('life.view.delete')}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-[var(--ink-2)]">
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--paper)] disabled:opacity-50"
            >
              {saving ? t('common.saving') : view ? t('common.save') : t('life.view.create')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
