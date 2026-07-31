import { X, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Goal } from '~/lib/api/types'

interface DeleteConfirmationModalProps {
  goals: Goal[]
  onConfirm: () => void
  onClose: () => void
}

export default function DeleteConfirmationModal({ goals, onConfirm, onClose }: DeleteConfirmationModalProps) {
  const { t } = useTranslation()
  const goalCount = goals.length

  return (
    <div className="bg-[var(--ink)]/80 fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-[var(--hairline-2)] bg-[var(--paper)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-[var(--rust)]" />
            <h3 className="text-lg font-light">{t('deleteConfirm.title', { count: goalCount })}</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 transition-all hover:bg-[var(--vellum)]"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="mb-6">
          <p className="mb-4 text-sm text-[var(--ink-2)]">{t('deleteConfirm.prompt', { count: goalCount })}</p>

          {/* Goals List */}
          <div className="max-h-[300px] space-y-1 overflow-y-auto rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] p-3">
            {goals.map((goal) => (
              <div key={goal.id} className="flex items-center gap-2 py-1">
                <div className="h-1.5 w-1.5 rounded-full bg-[var(--vellum)]" />
                <span className="text-sm text-[var(--ink)]">{goal.title}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-[var(--hairline-2)] px-4 py-2 transition-all hover:bg-[var(--vellum)]"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-lg border border-[var(--rust)] bg-[var(--rust-soft)] px-4 py-2 text-[var(--rust)] transition-all hover:bg-[var(--rust-soft)]"
          >
            {t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}
