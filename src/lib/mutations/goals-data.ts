import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { qk } from '~/lib/queries/keys'
import type { GoalsData } from '~/lib/queries/goals'
import type { UpdateTaskInput } from '~/lib/api/types'
import { createConnection, deleteConnection, updateConnection } from '~/server/fn/connections.fn'
import { createGoal, deleteGoal, updateGoal, arrangeGoals, setGoalPositions } from '~/server/fn/goals.fn'
import { createTask, deleteTask, setTaskScheduled, updateTask } from '~/server/fn/tasks.fn'
import { createValue, deleteValue, updateValue } from '~/server/fn/values.fn'

// Writes against the graph payload: values, goals, tasks, connections.
//
// These were methods on GoalsContext. Dissolving that context did not mean
// scattering them into components — they share one invalidation target
// (`qk.goalsData`) and two of them carry optimistic-update logic that is easy
// to get subtly wrong, so they stay together. What changed is that a component
// now imports the one hook it needs instead of destructuring a 40-member object.
//
// Error handling also changed, deliberately. The context wrappers swallowed
// every failure into `console.error` and resolved successfully, so a failed save
// looked identical to a successful one. These reject, and call sites catch and
// toast — which is what every non-context mutation in the app already did.

/** Invalidate the graph payload. Deliberately not `refetch`: this doesn't block. */
const invalidateGraph = (queryClient: QueryClient) => queryClient.invalidateQueries({ queryKey: qk.goalsData })

// ── Values ──────────────────────────────────────────────────────────────────
// Values live in two caches: `qk.values` (the Values tab, which doesn't need
// goals at all) and inside `qk.goalsData` (the graph, where they tag goals).
// Both get invalidated or the Values tab and the canvas disagree about a colour.
const invalidateValues = (queryClient: QueryClient) =>
  Promise.all([queryClient.invalidateQueries({ queryKey: qk.values }), invalidateGraph(queryClient)])

export function useCreateValue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof createValue>[0]['data']) => createValue({ data }),
    onSuccess: () => invalidateValues(queryClient),
  })
}

export function useUpdateValue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof updateValue>[0]['data']) => updateValue({ data }),
    onSuccess: () => invalidateValues(queryClient),
  })
}

export function useDeleteValue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteValue({ data: { id } }),
    onSuccess: () => invalidateValues(queryClient),
  })
}

// ── Goals ───────────────────────────────────────────────────────────────────

export function useCreateGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof createGoal>[0]['data']) => createGoal({ data }),
    onSuccess: () => invalidateGraph(queryClient),
  })
}

/**
 * Update a goal, patching the cache before the request lands.
 *
 * The optimistic path is load-bearing for canvas drag, not a nicety. Without it
 * every node drop invalidated the whole payload, which replaced the `goals`
 * array, which forced React Flow to rebuild and remeasure every node. Starting
 * a second drag before measurement finished produced the "trying to drag a node
 * that is not initialized" warning.
 *
 * `importance` is absent from the input type by construction — the schema omits
 * it, because it is derived from connection weights server-side rather than
 * stored on the goal row. Under GoalsContext the caller passed a `Partial<Goal>`
 * and the wrapper had to strip it by hand; here it simply cannot be passed.
 *
 * There is no success-path invalidation: the patch already matches what the
 * server committed, so a refetch would burn a round trip for identical data.
 */
export function useUpdateGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof updateGoal>[0]['data']) => updateGoal({ data }),
    onMutate: async ({ id, ...patch }) => {
      // Cancel in-flight refetches first, or one that resolves mid-mutation
      // overwrites the patch with pre-mutation data.
      await queryClient.cancelQueries({ queryKey: qk.goalsData })
      const snapshot = queryClient.getQueryData<GoalsData>(qk.goalsData)
      if (snapshot) {
        queryClient.setQueryData<GoalsData>(qk.goalsData, {
          ...snapshot,
          goals: snapshot.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
        })
      }
      return { snapshot }
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) queryClient.setQueryData(qk.goalsData, context.snapshot)
      return invalidateGraph(queryClient)
    },
  })
}

export function useDeleteGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteGoal({ data: { id } }),
    onSuccess: () => invalidateGraph(queryClient),
  })
}

// ── Tasks ───────────────────────────────────────────────────────────────────

export function useCreateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof createTask>[0]['data']) => createTask({ data }),
    onSuccess: () => invalidateGraph(queryClient),
  })
}

/**
 * Update a task, patching the cache before the request lands.
 *
 * The hot path is the completion checkbox on the canvas — the flip has to be
 * instant. Same reasoning as `useUpdateGoal`: no invalidation on success,
 * rollback plus invalidation on failure.
 */
export function useUpdateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    // Typed as the schema's OUTPUT (`UpdateTask`), not its input.
    //
    // `scheduledAt` is `z.coerce.date()`, whose input type is `unknown` — that
    // is correct and deliberate, because MCP hands it an ISO string. But the
    // optimistic patch below spreads these fields straight onto a cached task,
    // where `scheduledAt` is a real `Date | null`, and `unknown` does not go
    // there. The UI has an actual Date in hand at every call site, so asking
    // for the output type is both honest and what the callers already pass;
    // the coercion stays available for the string-shaped MCP path.
    mutationFn: (data: UpdateTaskInput) => updateTask({ data }),
    // The one case the optimistic patch is not what the server stored: text
    // with an `@` in it comes back with its mentions linked.
    onSuccess: (_data, vars) => {
      if (vars.title?.includes('@') || vars.description?.includes('@')) return invalidateGraph(queryClient)
    },
    onMutate: async ({ id, goalId, ...patch }) => {
      await queryClient.cancelQueries({ queryKey: qk.goalsData })
      const snapshot = queryClient.getQueryData<GoalsData>(qk.goalsData)
      if (snapshot) {
        queryClient.setQueryData<GoalsData>(qk.goalsData, {
          ...snapshot,
          goals: snapshot.goals.map((g) =>
            g.id !== goalId ? g : { ...g, tasks: g.tasks.map((t) => (t.id !== id ? t : { ...t, ...patch })) },
          ),
        })
      }
      return { snapshot }
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) queryClient.setQueryData(qk.goalsData, context.snapshot)
      return invalidateGraph(queryClient)
    },
  })
}

export function useDeleteTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { id: string; goalId: string }) => deleteTask({ data }),
    onSuccess: () => invalidateGraph(queryClient),
  })
}

/**
 * Move a task's deadline. The Horizons drag-drop endpoint.
 *
 * Optimistic for the same reason as the two above — the card has to land in the
 * new column on drop, not a round trip later. Unlike them this DOES invalidate
 * on settle: the horizon bucket is recomputed from `scheduledAt` at render, so
 * a stale value puts the card in a visibly wrong column rather than just
 * showing an out-of-date field.
 *
 * The task id alone identifies the row, so unlike `useUpdateTask` this walks
 * every goal rather than indexing into one.
 *
 * `onError` is a parameter because the only caller wants to toast a message
 * that is specific to dragging ("couldn't move that"), and a rollback with no
 * visible explanation reads as the card silently refusing to move.
 */
export function useSetTaskScheduled(options?: { onError?: () => void }) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { id: string; scheduledAt: Date | null }) => setTaskScheduled({ data }),
    onMutate: async ({ id, scheduledAt }) => {
      await queryClient.cancelQueries({ queryKey: qk.goalsData })
      const snapshot = queryClient.getQueryData<GoalsData>(qk.goalsData)
      if (snapshot) {
        queryClient.setQueryData<GoalsData>(qk.goalsData, {
          ...snapshot,
          goals: snapshot.goals.map((g) => ({
            ...g,
            tasks: g.tasks.map((task) => (task.id === id ? { ...task, scheduledAt } : task)),
          })),
        })
      }
      return { snapshot }
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) queryClient.setQueryData(qk.goalsData, context.snapshot)
      options?.onError?.()
    },
    onSettled: () => invalidateGraph(queryClient),
  })
}

// ── Connections ─────────────────────────────────────────────────────────────

export function useCreateConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof createConnection>[0]['data']) => createConnection({ data }),
    onSuccess: () => invalidateGraph(queryClient),
  })
}

export function useUpdateConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof updateConnection>[0]['data']) => updateConnection({ data }),
    onSuccess: () => invalidateGraph(queryClient),
  })
}

export function useDeleteConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteConnection({ data: { id } }),
    onSuccess: () => invalidateGraph(queryClient),
  })
}

/**
 * Lay the whole graph out from its connections. The server computes it (the
 * same function the `arrange_goals` MCP tool runs) and answers what moved and
 * from where, which the caller keeps for its undo.
 */
export function useArrangeGoals() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => arrangeGoals(),
    onSuccess: () => invalidateGraph(queryClient),
  })
}

/** Move several goals in one write: the undo of an arrange. */
export function useSetGoalPositions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (positions: Parameters<typeof setGoalPositions>[0]['data']['positions']) =>
      setGoalPositions({ data: { positions } }),
    onSuccess: () => invalidateGraph(queryClient),
  })
}
