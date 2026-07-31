import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { CalendarDays, HelpCircle, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useCreateImportantDate, useDeleteImportantDate, useUpdateImportantDate } from '~/lib/mutations/people'
import { importantDatesQueryOptions } from '~/lib/queries/people'
import DatePicker from './DatePicker'

const fieldHelper = 'mt-1.5 text-xs text-[var(--ink-3)]'
const inputClass =
  'w-full rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-4 py-2 text-sm text-[var(--ink)] outline-none transition-all placeholder:text-[var(--ink-4)] focus:border-[var(--hairline-2)] focus:bg-[var(--vellum)]'

// Yearly recurring per-person dates (birthdays, anniversaries). Pulse surfaces
// them when the next occurrence is within 30 days. Year is optional but kept
// when set so 'turning N' math stays correct.
//
// Extracted from PersonModal as part of H2.
export default function PersonImportantDatesSection({ personId }: { personId: string | null | undefined }) {
  const { t } = useTranslation()
  const enabled = !!personId

  // See PersonBidsSection: gated on a saved parent row, so `enabled` rather
  // than suspense.
  const query = useQuery({ ...importantDatesQueryOptions(personId ?? ''), enabled })
  const create = useCreateImportantDate()
  const update = useUpdateImportantDate()
  const remove = useDeleteImportantDate()

  const [labelDraft, setLabelDraft] = useState('')
  const [dateDraft, setDateDraft] = useState<Date | null>(null)

  const handleAdd = async () => {
    if (!personId) return
    const label = labelDraft.trim()
    if (!label || !dateDraft) return
    try {
      await create.mutateAsync({
        personId,
        label,
        month: dateDraft.getMonth() + 1,
        day: dateDraft.getDate(),
        year: dateDraft.getFullYear(),
      })
      setLabelDraft('')
      setDateDraft(null)
    } catch {
      toast.error(t('personDates.addFailed'))
    }
  }

  return (
    <div>
      <SectionLabel hint={t('personDates.sectionHint')}>{t('personDates.sectionTitle')}</SectionLabel>

      {!enabled ? (
        <p className={fieldHelper}>{t('personDates.saveFirst')}</p>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleAdd()
                }
              }}
              placeholder={t('personDates.labelPlaceholder')}
              className={`${inputClass} flex-1`}
            />
            <DatePicker
              value={dateDraft}
              onChange={setDateDraft}
              placeholder={t('personDates.pickDate')}
              className="sm:w-48"
            />
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={!labelDraft.trim() || !dateDraft || create.isPending}
              className="shrink-0 rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-4 py-2 text-sm text-[var(--ink)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('common.add')}
            </button>
          </div>

          {query.data && query.data.length > 0 && (
            <ul className="mt-3 divide-y divide-[var(--hairline)]">
              {query.data.map((date) => (
                <ImportantDateRow
                  key={date.id}
                  date={date}
                  onEditLabel={async (label) => {
                    const trimmed = label.trim()
                    if (!trimmed) return
                    try {
                      await update.mutateAsync({ id: date.id, label: trimmed })
                    } catch {
                      toast.error(t('personDates.updateFailed'))
                    }
                  }}
                  onEditDate={async (next) => {
                    if (!next) return
                    try {
                      await update.mutateAsync({
                        id: date.id,
                        month: next.getMonth() + 1,
                        day: next.getDate(),
                        year: next.getFullYear(),
                      })
                    } catch {
                      toast.error(t('personDates.updateFailed'))
                    }
                  }}
                  onDelete={async () => {
                    try {
                      await remove.mutateAsync(date.id)
                    } catch {
                      toast.error(t('personDates.removeFailed'))
                    }
                  }}
                  deleteDisabled={remove.isPending}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function SectionLabel({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
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

// Single-line row: icon · label · date pill · ×. Click the label to rename;
// click the date pill to repick.
function ImportantDateRow({
  date,
  onEditLabel,
  onEditDate,
  onDelete,
  deleteDisabled,
}: {
  date: { id: string; label: string; month: number; day: number; year: number | null }
  onEditLabel: (label: string) => void
  onEditDate: (date: Date | null) => void
  onDelete: () => void
  deleteDisabled: boolean
}) {
  const { t } = useTranslation()
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelDraft, setLabelDraft] = useState(date.label)
  const dateAsObject = new Date(date.year ?? new Date().getFullYear(), date.month - 1, date.day)

  const commit = () => {
    const trimmed = labelDraft.trim()
    if (trimmed && trimmed !== date.label) onEditLabel(trimmed)
    else setLabelDraft(date.label)
    setEditingLabel(false)
  }

  return (
    <li className="group flex h-10 items-center gap-3 px-3 transition-colors hover:bg-[var(--vellum)]">
      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]" />
      <div className="min-w-0 flex-1">
        {editingLabel ? (
          <input
            type="text"
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commit()
              }
              if (e.key === 'Escape') {
                setLabelDraft(date.label)
                setEditingLabel(false)
              }
            }}
            autoFocus
            className="w-full border-0 bg-transparent p-0 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-4)]"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setLabelDraft(date.label)
              setEditingLabel(true)
            }}
            className="block w-full truncate text-left text-sm text-[var(--ink)] transition-colors hover:text-[var(--ink)]"
            title={t('personDates.clickToRename')}
          >
            {date.label}
          </button>
        )}
      </div>
      <DatePicker value={dateAsObject} onChange={onEditDate} clearable={false} size="sm" align="right" />
      <button
        type="button"
        onClick={onDelete}
        disabled={deleteDisabled}
        className="shrink-0 rounded p-1 text-[var(--ink-4)] opacity-100 transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)] disabled:cursor-not-allowed md:opacity-0 md:group-hover:opacity-100"
        aria-label={t('personDates.removeDate')}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  )
}
