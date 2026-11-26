import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { lifeQueryOptions } from '~/lib/queries/life'
import LifeSettingsForm from './LifeSettingsForm'

// Profile → Your life: the birth date and the years planned, the same two
// settings the Life tab draws its weeks from.
export default function LifeSection({ fieldLabel, sectionClass }: { fieldLabel: string; sectionClass: string }) {
  const { t } = useTranslation()
  const { data } = useQuery(lifeQueryOptions())
  return (
    <div className={sectionClass}>
      <div className={fieldLabel}>{t('life.settings.title')}</div>
      {data ? (
        <LifeSettingsForm
          key={`${data.birthDate}-${data.lifeExpectancyYears}`}
          birthDate={data.birthDate}
          lifeExpectancyYears={data.lifeExpectancyYears}
        />
      ) : (
        <div className="h-16 animate-pulse rounded-lg bg-[var(--vellum)]" />
      )}
    </div>
  )
}
