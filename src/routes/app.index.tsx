import { createFileRoute } from '@tanstack/react-router'
import GoalsGraph from '~/components/goals/GoalsGraph'
import { TabError } from '~/components/goals/TabError'

// `/app` renders the graph AT `/app`, rather than redirecting to
// `/app/objectives`. That is what the Next version did and it is the URL people
// bookmarked; both paths work and neither rewrites the other.
export const Route = createFileRoute('/app/')({
  // `?goal=` is declared on BOTH graph routes, because the graph renders under
  // both and an undeclared param would be stripped at this one. GoalsGraph
  // therefore reads it with the route-agnostic hooks rather than a bound
  // `Route.useSearch()`, which throws "Invariant failed" on whichever route it
  // was not bound to. Inline literal — see the note in app.objectives.tsx.
  validateSearch: (search: Record<string, unknown>): { goal?: string } => ({
    goal: typeof search.goal === 'string' ? search.goal : undefined,
  }),
  component: GoalsGraph,
  errorComponent: TabError,
})
