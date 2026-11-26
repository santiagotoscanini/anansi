import type { Connection, Goal } from '~/lib/api/types'

// The progress engine, pure: the web memoizes it in useGoalProgress, the phone
// API (`/api/v1/goals/board`) runs it on the server. See the hook for the rules.

export type ProgressEntry = {
  ownProgress: number
  dependenciesProgress: number
  totalProgress: number
}

export const ZERO_PROGRESS: ProgressEntry = { ownProgress: 0, dependenciesProgress: 0, totalProgress: 0 }
const ZERO = ZERO_PROGRESS

type ProgressGoal = Pick<Goal, 'id' | 'tasks'> & { parentId?: string }

/** Every goal's own completion and total progress, in one O(N + E) pass. */
export function computeGoalProgress<G extends ProgressGoal>(goals: readonly G[], connections: readonly Connection[]) {
  const goalsById = new Map<string, G>()
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
}
