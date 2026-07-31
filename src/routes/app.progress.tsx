import { createFileRoute } from '@tanstack/react-router'
import LifeProgress from '~/components/goals/LifeProgress'
import { TabError } from '~/components/goals/TabError'

export const Route = createFileRoute('/app/progress')({
  component: LifeProgress,
  errorComponent: TabError,
})
