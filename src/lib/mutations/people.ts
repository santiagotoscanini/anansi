import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { qk } from '~/lib/queries/keys'
import type { PersonRow } from '~/lib/queries/people'
import {
  createBucketListItem,
  deleteBucketListItem,
  toggleBucketListItemCompleted,
  updateBucketListItem,
} from '~/server/fn/bucket-list.fn'
import { createGroup, deleteGroup, updateGroup } from '~/server/fn/groups.fn'
import { createImportantDate, deleteImportantDate, updateImportantDate } from '~/server/fn/important-dates.fn'
import { createNextBid, deleteNextBid, setNextBidCompleted, updateNextBid } from '~/server/fn/next-bids.fn'
import {
  archivePerson,
  createPerson,
  deletePerson,
  setPersonCategory,
  unarchivePerson,
  updatePerson,
  uploadPersonImage,
} from '~/server/fn/people.fn'

// Writes across the Personal CRM: people, groups, bids, dates, bucket list.
//
// Invalidation is by key ROOT throughout (`qk.people`, not
// `qk.peopleList(false)`). The people surface is heavily cross-linked — a
// person's row, their detail, their referent tasks and the archived/unarchived
// lists are four cache entries that move together — and prefix matching is
// exactly what the key shape in keys.ts was built for.

const invalidatePeople = (queryClient: QueryClient) => queryClient.invalidateQueries({ queryKey: qk.people })

// ── People ──────────────────────────────────────────────────────────────────

export function useCreatePerson() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof createPerson>[0]['data']) => createPerson({ data }),
    onSuccess: () => invalidatePeople(queryClient),
  })
}

export function useUpdatePerson() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof updatePerson>[0]['data']) => updatePerson({ data }),
    onSuccess: () => invalidatePeople(queryClient),
  })
}

/** The preferred way to remove someone — reversible, and the history survives. */
export function useArchivePerson() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => archivePerson({ data: { id } }),
    onSuccess: () => invalidatePeople(queryClient),
  })
}

export function useUnarchivePerson() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => unarchivePerson({ data: { id } }),
    onSuccess: () => invalidatePeople(queryClient),
  })
}

/** Hard delete, for a row entered by mistake. Archiving is what users want. */
export function useDeletePerson() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deletePerson({ data: { id } }),
    onSuccess: () => invalidatePeople(queryClient),
  })
}

/**
 * The Relationships board's drag-drop endpoint: category + position only.
 *
 * Optimistic, because without it the card visibly snaps back to its source
 * column and then jumps to the target once the mutation resolves. Patches only
 * the unarchived list — the board never shows archived people, so the archived
 * entry is left for the invalidation on settle.
 */
export function useSetPersonCategory(options?: { onError?: () => void }) {
  const queryClient = useQueryClient()
  const key = qk.peopleList(false)
  return useMutation({
    mutationFn: (data: Parameters<typeof setPersonCategory>[0]['data']) => setPersonCategory({ data }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key })
      const snapshot = queryClient.getQueryData<PersonRow[]>(key)
      if (snapshot) {
        queryClient.setQueryData<PersonRow[]>(
          key,
          snapshot.map((p) =>
            p.id === vars.id ? { ...p, category: vars.category, boardOrder: vars.boardOrder ?? 0 } : p,
          ),
        )
      }
      return { snapshot }
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) queryClient.setQueryData(key, context.snapshot)
      options?.onError?.()
    },
    onSettled: () => invalidatePeople(queryClient),
  })
}

export function useUploadPersonImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof uploadPersonImage>[0]['data']) => uploadPersonImage({ data }),
    onSuccess: () => invalidatePeople(queryClient),
  })
}

// ── Groups ──────────────────────────────────────────────────────────────────
// Groups tag both people and tasks, so a group edit can change what the Tasks
// tab shows as well as the People one — hence the goals payload invalidation
// alongside the group keys.
const invalidateGroups = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.groups }),
    queryClient.invalidateQueries({ queryKey: qk.people }),
    queryClient.invalidateQueries({ queryKey: qk.goalsData }),
  ])

export function useCreateGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof createGroup>[0]['data']) => createGroup({ data }),
    onSuccess: () => invalidateGroups(queryClient),
  })
}

export function useUpdateGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof updateGroup>[0]['data']) => updateGroup({ data }),
    onSuccess: () => invalidateGroups(queryClient),
  })
}

export function useDeleteGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteGroup({ data: { id } }),
    onSuccess: () => invalidateGroups(queryClient),
  })
}

// ── Next bids ───────────────────────────────────────────────────────────────
// `qk.nextBids` covers both the per-person list and the Pulse upcoming feed.

const invalidateBids = (queryClient: QueryClient) => queryClient.invalidateQueries({ queryKey: qk.nextBids })

export function useCreateNextBid() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof createNextBid>[0]['data']) => createNextBid({ data }),
    onSuccess: () => invalidateBids(queryClient),
  })
}

export function useUpdateNextBid() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof updateNextBid>[0]['data']) => updateNextBid({ data }),
    onSuccess: () => invalidateBids(queryClient),
  })
}

/** Completing a bid does not hide it — the trail is the point. */
export function useSetNextBidCompleted() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof setNextBidCompleted>[0]['data']) => setNextBidCompleted({ data }),
    onSuccess: () => invalidateBids(queryClient),
  })
}

export function useDeleteNextBid() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteNextBid({ data: { id } }),
    onSuccess: () => invalidateBids(queryClient),
  })
}

// ── Important dates ─────────────────────────────────────────────────────────

const invalidateDates = (queryClient: QueryClient) => queryClient.invalidateQueries({ queryKey: qk.importantDates })

export function useCreateImportantDate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof createImportantDate>[0]['data']) => createImportantDate({ data }),
    onSuccess: () => invalidateDates(queryClient),
  })
}

export function useUpdateImportantDate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof updateImportantDate>[0]['data']) => updateImportantDate({ data }),
    onSuccess: () => invalidateDates(queryClient),
  })
}

export function useDeleteImportantDate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteImportantDate({ data: { id } }),
    onSuccess: () => invalidateDates(queryClient),
  })
}

// ── Bucket list ─────────────────────────────────────────────────────────────
// Items link to people ("people I want to do this with"), and PersonModal
// renders that link from its own cache entry — so both roots are invalidated.

const invalidateBucketList = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.bucketList }),
    queryClient.invalidateQueries({ queryKey: qk.people }),
  ])

export function useCreateBucketListItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof createBucketListItem>[0]['data']) => createBucketListItem({ data }),
    onSuccess: () => invalidateBucketList(queryClient),
  })
}

export function useUpdateBucketListItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof updateBucketListItem>[0]['data']) => updateBucketListItem({ data }),
    onSuccess: () => invalidateBucketList(queryClient),
  })
}

export function useToggleBucketListItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { id: string; completed: boolean }) => toggleBucketListItemCompleted({ data }),
    onSuccess: () => invalidateBucketList(queryClient),
  })
}

export function useDeleteBucketListItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteBucketListItem({ data: { id } }),
    onSuccess: () => invalidateBucketList(queryClient),
  })
}
