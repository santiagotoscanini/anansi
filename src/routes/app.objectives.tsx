import { createFileRoute } from '@tanstack/react-router'
import GoalsGraph from '~/components/goals/GoalsGraph'
import { TabError } from '~/components/goals/TabError'

// The graph payload is loaded by the /app layout, which needs it for the
// sidebar's per-group task counts — so this route adds no loader of its own.
export const Route = createFileRoute('/app/objectives')({
  // `?goal=<id>` deep-links a goal's editor and `?goal=new` the create form, so
  // a goal is linkable and the modal survives a reload.
  //
  // Inline function literal, never a call to a generic helper: this module is
  // circular with routeTree.gen.ts, and TypeScript resolves that for a literal
  // but falls back to AnySchema for a generic call — silently emptying the
  // search type at every navigation site. See AGENTS.md.
  validateSearch: (search: Record<string, unknown>): { goal?: string } => ({
    goal: typeof search.goal === 'string' ? search.goal : undefined,
  }),
  component: GoalsGraph,
  errorComponent: TabError,
})
