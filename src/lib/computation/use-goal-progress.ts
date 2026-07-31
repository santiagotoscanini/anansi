import { useMemo } from 'react'
import type { Connection, Goal } from '~/lib/api/types'

// The progress engine, lifted verbatim out of GoalsContext when that context
// was dissolved. It was the one part of the context worth keeping: the rest was
// thin wrappers over tRPC mutations, but this is real logic with a real reason
// to be memoized.
//
// Everything is computed once per change to `goals`/`connections` and looked up
// in O(1) afterwards. The naive version recursed per-render per-goal, which on
// a 30-node graph meant roughly 900 traversals per render of the canvas.

export type ProgressEntry = {
  ownProgress: number
  dependenciesProgress: number
  totalProgress: number
}

const ZERO: ProgressEntry = { ownProgress: 0, dependenciesProgress: 0, totalProgress: 0 }

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
  const caches = useMemo(() => {
    const goalsById = new Map<string, Goal>()
    for (const g of goals) goalsById.set(g.id, g)

    // Incoming edges per goal — the predecessors whose progress feeds into it.
    const predsByTarget = new Map<string, Connection[]>()
    for (const c of connections) {
      const arr = predsByTarget.get(c.target)
      if (arr) arr.push(c)
      else predsByTarget.set(c.target, [c])
    }

    // Own completion: task difficulty is the weight, so a hard task finished
    // counts for more than an easy one. One pass over all goals.
    const completions = new Map<string, number>()
    for (const g of goals) {
      if (g.tasks.length === 0) {
        completions.set(g.id, 0)
        continue
      }
      const total = g.tasks.reduce((s, t) => s + t.difficulty, 0)
      const done = g.tasks.filter((t) => t.completed).reduce((s, t) => s + t.difficulty, 0)
      completions.set(g.id, total > 0 ? (done / total) * 100 : 0)
    }

    // Total progress: DFS with a memo plus a visiting-set, because the goal
    // graph is user-authored and may contain cycles. Still O(N + E) overall.
    const progresses = new Map<string, ProgressEntry>()
    const visiting = new Set<string>()

    const compute = (goalId: string): ProgressEntry => {
      const cached = progresses.get(goalId)
      if (cached) return cached
      const goal = goalsById.get(goalId)
      if (!goal) return ZERO

      // Cycle guard — on re-entry, pretend the goal has no predecessors rather
      // than recursing forever.
      if (visiting.has(goalId)) {
        const own = completions.get(goalId) ?? 0
        return { ownProgress: own, dependenciesProgress: 0, totalProgress: own }
      }
      visiting.add(goalId)

      const ownProgress = completions.get(goalId) ?? 0
      const preds = predsByTarget.get(goalId) ?? []

      let entry: ProgressEntry
      if (preds.length === 0) {
        entry = { ownProgress, dependenciesProgress: 0, totalProgress: ownProgress }
      } else {
        let totalPredWeight = 0
        let weightedPredCompletion = 0
        for (const conn of preds) {
          if (!goalsById.has(conn.source)) continue
          const predProgress = compute(conn.source).totalProgress
          const weight = conn.weight || 1
          totalPredWeight += weight
          weightedPredCompletion += predProgress * weight
        }
        const dependenciesProgress = totalPredWeight > 0 ? weightedPredCompletion / totalPredWeight : 0
        // A goal with its own tasks is mostly judged on those; a pure
        // roll-up goal is almost entirely its dependencies.
        const hasOwnTasks = goal.tasks.length > 0
        const ownWeight = hasOwnTasks ? 0.4 : 0.1
        const predWeight = hasOwnTasks ? 0.6 : 0.9
        const totalProgress = Math.min(100, Math.max(0, ownProgress * ownWeight + dependenciesProgress * predWeight))
        entry = {
          ownProgress: Math.min(100, Math.max(0, ownProgress)),
          dependenciesProgress: Math.min(100, Math.max(0, dependenciesProgress)),
          totalProgress,
        }
      }

      visiting.delete(goalId)
      progresses.set(goalId, entry)
      return entry
    }

    for (const g of goals) compute(g.id)

    return { goalsById, completions, progresses }
  }, [goals, connections])

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
