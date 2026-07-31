import { createFileRoute } from '@tanstack/react-router'
import Horizons from '~/components/goals/Horizons'
import { TabError } from '~/components/goals/TabError'

// Horizons opens the GOAL modal, not the task one — a task row here links back
// to the goal that owns it. `task` is accepted for symmetry with /app/tasks so
// the two tabs can hand links to each other.
export const Route = createFileRoute('/app/horizons')({
  validateSearch: (search: Record<string, unknown>): { goal?: string; task?: string } => ({
    goal: typeof search.goal === 'string' ? search.goal : undefined,
    task: typeof search.task === 'string' ? search.task : undefined,
  }),
  component: Horizons,
  errorComponent: TabError,
})
