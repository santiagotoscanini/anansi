import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { qk } from '~/lib/queries/keys'
import {
  createSelfListItem,
  deleteSelfListItem,
  reorderSelfListItems,
  updateSelfListItem,
  type listSelfListItems,
} from '~/server/fn/self-list-items.fn'
import { updateSelf } from '~/server/fn/self.fn'
import { createValueBehavior, deleteValueBehavior } from '~/server/fn/value-behaviors.fn'

// Writes for the Self page and for the behaviours attached to a value. Both are
// small, list-shaped surfaces with no cross-entity fan-out, so the invalidation
// here is as narrow as it looks.

// ── Self ────────────────────────────────────────────────────────────────────

/** Partial upsert: only the fields passed are written. */
export function useUpdateSelf() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof updateSelf>[0]['data']) => updateSelf({ data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.self }),
  })
}

const invalidateSelfItems = (queryClient: QueryClient) => queryClient.invalidateQueries({ queryKey: qk.selfListItems })

// All three list mutations are optimistic. The Self page is a writing surface —
// typing a line and pressing enter has to feel like typing into a document, not
// like submitting a form and waiting. Each one snapshots, patches, and rolls
// back on failure, then invalidates on settle so the server's ids and ordering
// replace the guesses.
type SelfListItems = Awaited<ReturnType<typeof listSelfListItems>>

/** Cancel in-flight refetches, snapshot, apply `patch`. Shared by all three. */
function useOptimisticSelfItems() {
  const queryClient = useQueryClient()
  return {
    queryClient,
    begin: async (patch: (old: SelfListItems) => SelfListItems) => {
      await queryClient.cancelQueries({ queryKey: qk.selfListItems })
      const snapshot = queryClient.getQueryData<SelfListItems>(qk.selfListItems)
      if (snapshot) queryClient.setQueryData<SelfListItems>(qk.selfListItems, patch(snapshot))
      return { snapshot }
    },
    rollback: (context: { snapshot?: SelfListItems } | undefined) => {
      if (context?.snapshot) queryClient.setQueryData(qk.selfListItems, context.snapshot)
    },
  }
}

export function useCreateSelfListItem() {
  const { queryClient, begin, rollback } = useOptimisticSelfItems()
  return useMutation({
    mutationFn: (data: Parameters<typeof createSelfListItem>[0]['data']) => createSelfListItem({ data }),
    onMutate: (input) =>
      begin((old) => [
        ...old,
        {
          // A placeholder id, replaced by the server's on settle. It only has
          // to be unique within this render — nothing round-trips it.
          id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          userId: '',
          kind: input.kind,
          // The server zeroes patternCategory for every kind but 'pattern';
          // mirror that here or the optimistic row renders in a category the
          // refetch will take it out of.
          patternCategory: input.kind === 'pattern' ? (input.patternCategory ?? null) : null,
          content: input.content,
          orderIdx: old.filter((i) => i.kind === input.kind).length,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    onError: (_err, _vars, context) => rollback(context),
    onSettled: () => invalidateSelfItems(queryClient),
  })
}

export function useUpdateSelfListItem() {
  const { queryClient, begin, rollback } = useOptimisticSelfItems()
  return useMutation({
    mutationFn: (data: Parameters<typeof updateSelfListItem>[0]['data']) => updateSelfListItem({ data }),
    onMutate: (input) =>
      begin((old) => old.map((it) => (it.id === input.id ? { ...it, ...input, updatedAt: new Date() } : it))),
    onError: (_err, _vars, context) => rollback(context),
    onSettled: () => invalidateSelfItems(queryClient),
  })
}

export function useDeleteSelfListItem() {
  const { queryClient, begin, rollback } = useOptimisticSelfItems()
  return useMutation({
    mutationFn: (id: string) => deleteSelfListItem({ data: { id } }),
    onMutate: (id) => begin((old) => old.filter((it) => it.id !== id)),
    onError: (_err, _vars, context) => rollback(context),
    onSettled: () => invalidateSelfItems(queryClient),
  })
}

export function useReorderSelfListItems() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof reorderSelfListItems>[0]['data']) => reorderSelfListItems({ data }),
    onSuccess: () => invalidateSelfItems(queryClient),
  })
}

// ── Value behaviours ────────────────────────────────────────────────────────
// The `value-behaviors` root covers both the all-values list the Values tab
// renders and any single-value query.

const invalidateBehaviors = (queryClient: QueryClient) => queryClient.invalidateQueries({ queryKey: qk.valueBehaviors })

export function useCreateValueBehavior() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof createValueBehavior>[0]['data']) => createValueBehavior({ data }),
    onSuccess: () => invalidateBehaviors(queryClient),
  })
}

export function useDeleteValueBehavior() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteValueBehavior({ data: { id } }),
    onSuccess: () => invalidateBehaviors(queryClient),
  })
}
