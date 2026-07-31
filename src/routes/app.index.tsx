import { createFileRoute } from '@tanstack/react-router'
import GoalsGraph from '~/components/goals/GoalsGraph'
import { TabError } from '~/components/goals/TabError'

// `/app` renders the graph AT `/app`, rather than redirecting to
// `/app/objectives`. That is what the Next version did and it is the URL people
// bookmarked; both paths work and neither rewrites the other.
export const Route = createFileRoute('/app/')({
  component: GoalsGraph,
  errorComponent: TabError,
})
