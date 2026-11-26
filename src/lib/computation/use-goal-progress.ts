import { useMemo } from 'react'
import type { Connection, Goal } from '~/lib/api/types'
import { computeGoalProgress, ZERO_PROGRESS, type ProgressEntry } from './goal-progress'

export type { ProgressEntry }
const ZERO = ZERO_PROGRESS

// The progress engine, lifted verbatim out of GoalsContext when that context
// was dissolved. It was the one part of the context worth keeping: the rest was
// thin wrappers over tRPC mutations, but this is real logic with a real reason
// to be memoized.
//
// Everything is computed once per change to `goals`/`connections` and looked up
// in O(1) afterwards. The naive version recursed per-render per-goal, which on
// a 30-node graph meant roughly 900 traversals per render of the canvas.

export type GoalProgress = {
  /** Own task completion, weighted by difficulty. 0 when the goal has no tasks. */
  getGoalCompletion: (goalId: string) => number
  /** Mean own-completion across the goal and every ancestor via `parentId`. */
  getPathCompletion: (goalId: string) => number
  /** Own + dependency progress, blended by whether the goal has tasks of its own. */
  getGoalProgress: (goalId: string) => ProgressEntry
}

/**
 * Build the progress lookups for a set of goals and connections.
 *
 * Callers pass the arrays straight out of `goalsDataQueryOptions`. Those come
 * from the query cache, so their identity is stable between renders and the
 * memo actually holds — passing freshly-built arrays would recompute the whole
 * graph every render and quietly undo the point of this module.
 */
export function useGoalProgress(goals: Goal[], connections: Connection[]): GoalProgress {
  const caches = useMemo(() => computeGoalProgress(goals, connections), [goals, connections])

  return useMemo(
    () => ({
      getGoalCompletion: (goalId: string) => caches.completions.get(goalId) ?? 0,

      getPathCompletion: (goalId: string) => {
        const ids: string[] = []
        let cur: string | undefined = goalId
        while (cur) {
          ids.push(cur)
          cur = caches.goalsById.get(cur)?.parentId
        }
        if (ids.length === 0) return 0
        const sum = ids.reduce((s, id) => s + (caches.completions.get(id) ?? 0), 0)
        return sum / ids.length
      },

      getGoalProgress: (goalId: string) => caches.progresses.get(goalId) ?? ZERO,
    }),
    [caches],
  )
}
