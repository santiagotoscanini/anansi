import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGoalProgress } from '~/lib/computation/use-goal-progress'
import { useGoalsData } from '~/lib/queries/goals'
import GoalModal from './GoalModal'
import { Page, ScreenHeader } from './ui'

export default function LifeProgress() {
  const { t } = useTranslation()
  const { goals, connections, values } = useGoalsData()
  const { getGoalProgress } = useGoalProgress(goals, connections)
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Find terminal goals (goals with no outgoing connections)
  const terminalGoals = useMemo(() => {
    const goalsWithOutgoing = new Set(connections.map((c) => c.source))
    return goals.filter((goal) => !goalsWithOutgoing.has(goal.id))
  }, [goals, connections])

  // Use the comprehensive progress for terminal goals
  const getFullPathCompletion = useCallback(
    (goalId: string): number => {
      // Simply use the total progress which already includes all predecessors
      return getGoalProgress(goalId).totalProgress
    },
    [getGoalProgress],
  )

  // Sort terminal goals by progress (highest first)
  const sortedTerminalGoals = useMemo(() => {
    return [...terminalGoals].sort((a, b) => {
      const progressA = getFullPathCompletion(a.id)
      const progressB = getFullPathCompletion(b.id)
      return progressB - progressA
    })
  }, [terminalGoals, getFullPathCompletion])

  const handleGoalClick = (goalId: string) => {
    setSelectedGoalId(goalId)
    setIsModalOpen(true)
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setSelectedGoalId(null)
  }

  const overall = terminalGoals.length
    ? terminalGoals.reduce((sum, goal) => sum + getFullPathCompletion(goal.id), 0) / terminalGoals.length
    : 0

  return (
    <Page>
      <ScreenHeader
        title={
          <>
            {t('lifeProgress.titlePre')}
            <span className="brand-em">{t('lifeProgress.titleEm')}</span>
          </>
        }
        sub={t('lifeProgress.subtitle')}
        actions={
          terminalGoals.length > 0 && (
            <div className="text-right">
              <div
                className="text-[var(--ink)] tabular-nums"
                style={{ fontFamily: 'var(--font-display)', fontSize: 30, lineHeight: 1 }}
              >
                {Math.round(overall)}%
              </div>
              <div className="mt-1 text-xs text-[var(--ink-3)]">
                {t('lifeProgress.ultimateGoal', { count: terminalGoals.length })}
              </div>
            </div>
          )
        }
      />

      {terminalGoals.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-[var(--ink)]" style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>
            {t('lifeProgress.noTerminalGoals')}
          </p>
          <p className="mt-1 text-sm text-[var(--ink-3)]">{t('lifeProgress.noTerminalGoalsHelp')}</p>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--hairline)] border-t border-[var(--hairline)]">
          {sortedTerminalGoals.map((goal) => {
            const progressData = getGoalProgress(goal.id)
            const progress = progressData.totalProgress
            const hasPredecessors = connections.some((c) => c.target === goal.id)
            const associatedValues = goal.valueIds ? values.filter((v) => goal.valueIds.includes(v.id)) : []
            return (
              <li key={goal.id}>
                <button
                  type="button"
                  onClick={() => handleGoalClick(goal.id)}
                  className="-mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 py-4 text-left transition-colors hover:bg-[var(--vellum)]/60"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="flex min-w-0 items-center gap-2">
                      {goal.emoji && !goal.emoji.startsWith('http') && (
                        <span className="leading-none">{goal.emoji}</span>
                      )}
                      <span className="truncate text-[15px] text-[var(--ink)]">{goal.title}</span>
                      {associatedValues.map((value) => (
                        <span
                          key={value.id}
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: value.color }}
                          title={value.name}
                        />
                      ))}
                    </span>
                    <span className="shrink-0 text-sm text-[var(--ink)] tabular-nums">{Math.round(progress)}%</span>
                  </div>
                  <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-[var(--hairline-2)]">
                    <div
                      className="h-full rounded-full bg-[var(--clay)] transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  {hasPredecessors && (
                    <div className="mt-1.5 flex justify-between text-[11px] text-[var(--ink-4)] tabular-nums">
                      <span>{t('lifeProgress.ownLabel', { percent: Math.round(progressData.ownProgress) })}</span>
                      <span>
                        {t('lifeProgress.dependenciesLabel', {
                          percent: Math.round(progressData.dependenciesProgress),
                        })}
                      </span>
                    </div>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {isModalOpen && <GoalModal goalId={selectedGoalId} onClose={handleModalClose} />}
    </Page>
  )
}
