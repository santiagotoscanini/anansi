import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useSetLifeSettings } from '~/lib/mutations/life'

// The two numbers a life in weeks needs: when it started and how long it is
// planned to be. On the Life tab (first visit and its settings) and in Profile.

const fieldLabel = 'mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)]'
const inputClass =
  'w-full rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-3 py-2 text-sm text-[var(--ink)] outline-hidden transition-all focus:border-[var(--hairline-2)]'

export default function LifeSettingsForm({
  birthDate,
  lifeExpectancyYears,
  onSaved,
  submitLabel,
}: {
  birthDate: string | null
  lifeExpectancyYears: number
  onSaved?: () => void
  submitLabel?: string
}) {
  const { t } = useTranslation()
  const [birth, setBirth] = useState(birthDate ?? '')
  const [years, setYears] = useState(String(lifeExpectancyYears))
  const save = useSetLifeSettings()
  const dirty = birth !== (birthDate ?? '') || years !== String(lifeExpectancyYears)

  const submit = async () => {
    const n = Number(years)
    if (!Number.isInteger(n) || n < 1 || n > 130) {
      toast.error(t('life.settings.badYears'))
      return
    }
    try {
      await save.mutateAsync({ birthDate: birth || null, lifeExpectancyYears: n })
      toast.success(t('life.settings.saved'))
      onSaved?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message.replace(/^[A-Z_]+: /, '') : t('common.saveFailed'))
    }
  }

  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
        <div>
          <label className={fieldLabel}>{t('life.settings.birthDate')}</label>
          <input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={fieldLabel}>{t('life.settings.years')}</label>
          <input
            inputMode="numeric"
            value={years}
            onChange={(e) => setYears(e.target.value.replace(/\D/g, '').slice(0, 3))}
            className={`${inputClass} tabular-nums`}
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-[var(--ink-3)]">{t('life.settings.help')}</p>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={(!dirty && Boolean(birthDate)) || !birth || save.isPending}
          className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {save.isPending ? t('common.saving') : (submitLabel ?? t('common.saveChanges'))}
        </button>
      </div>
    </div>
  )
}
