import { createFileRoute, redirect } from '@tanstack/react-router'

// Horizons is the board view of the Tasks tab since November 2026. Kept so old
// links and bookmarks land there, with the goal or task they named.
export const Route = createFileRoute('/app/horizons')({
  validateSearch: (search: Record<string, unknown>): { goal?: string; task?: string } => ({
    goal: typeof search.goal === 'string' ? search.goal : undefined,
    task: typeof search.task === 'string' ? search.task : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/app/tasks', search: { goal: search.goal, task: search.task }, replace: true })
  },
})
