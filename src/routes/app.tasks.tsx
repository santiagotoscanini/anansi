import { createFileRoute } from '@tanstack/react-router'
import Tasks from '~/components/goals/Tasks'
import { TabError } from '~/components/goals/TabError'

// `task` + `goal` together address one TaskModal. Both are needed: the task
// editor is scoped to its goal, and the flat cross-goal list has no other way
// to say which goal a task belongs to.
//
// A hand-written validator rather than a zod schema — see the note in
// login.tsx. It is also tolerant by construction: a hand-edited or truncated
// link renders the tab with no modal open instead of erroring out of a screen
// the user can otherwise use.
export const Route = createFileRoute('/app/tasks')({
  validateSearch: (search: Record<string, unknown>): { task?: string; goal?: string } => ({
    task: typeof search.task === 'string' ? search.task : undefined,
    goal: typeof search.goal === 'string' ? search.goal : undefined,
  }),
  component: Tasks,
  errorComponent: TabError,
})
