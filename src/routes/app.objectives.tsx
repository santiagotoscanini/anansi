import { createFileRoute } from '@tanstack/react-router'
import GoalsGraph from '~/components/goals/GoalsGraph'
import { TabError } from '~/components/goals/TabError'

// The graph payload is loaded by the /app layout, which needs it for the
// sidebar's per-group task counts — so this route adds no loader of its own.
export const Route = createFileRoute('/app/objectives')({
  component: GoalsGraph,
  errorComponent: TabError,
})
