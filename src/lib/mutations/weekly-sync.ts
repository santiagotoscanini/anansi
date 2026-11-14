import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { qk } from '~/lib/queries/keys'
import { deleteAttachment, uploadAttachment } from '~/server/fn/attachments.fn'
import {
  addSyncItem,
  createWeeklySync,
  removeSyncItem,
  reorderSyncItems,
  setSyncItemText,
} from '~/server/fn/weekly-sync.fn'

// Writes against a weekly retrospective.
//
// Every one of these invalidates the whole `weekly-sync` key root rather than
// the specific week. The retrospective payload is a cross-joined view — an
// item's attachment count, its goal grouping and the sync's fill state all move
// together — so patching one field of it is not meaningfully cheaper than
// refetching, and is much easier to get wrong. The root covers both
// `weeklySyncFor(week)` and `weeklyRetrospectiveFor(week)` by prefix.

const invalidateSync = (queryClient: QueryClient) => queryClient.invalidateQueries({ queryKey: qk.weeklySync })

export function useCreateWeeklySync() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof createWeeklySync>[0]['data']) => createWeeklySync({ data }),
    onSuccess: () => invalidateSync(queryClient),
  })
}

/** Put a library item on a sync. Idempotent — returns the existing row if present. */
export function useAddSyncItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof addSyncItem>[0]['data']) => addSyncItem({ data }),
    onSuccess: () => invalidateSync(queryClient),
  })
}

/** Drop an item from this sync only. The library row survives. */
export function useRemoveSyncItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof removeSyncItem>[0]['data']) => removeSyncItem({ data }),
    onSuccess: () => invalidateSync(queryClient),
  })
}

export function useSetSyncItemText() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof setSyncItemText>[0]['data']) => setSyncItemText({ data }),
    onSuccess: () => invalidateSync(queryClient),
  })
}

export function useReorderSyncItems() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof reorderSyncItems>[0]['data']) => reorderSyncItems({ data }),
    onSuccess: () => invalidateSync(queryClient),
  })
}

/**
 * Attach a file to a tracking item on a sync.
 *
 * Two calls, because attachments hang off the `(sync, tracking item)` row and
 * the user can upload against an item that has no row yet — the retrospective
 * lists every library item, whether or not it has been touched this week.
 * `addSyncItem` is idempotent, so this is safe to run on every upload rather
 * than only the first.
 */
export function useUploadSyncAttachment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      weeklySyncId: string
      trackingItemId: string
      fileName: string
      fileType: 'image' | 'document' | 'video' | 'audio' | 'other'
      /** Base64 data-URL envelope, straight off a FileReader. */
      data: string
    }) => {
      const item = await addSyncItem({
        data: { weeklySyncId: input.weeklySyncId, trackingItemId: input.trackingItemId },
      })
      return uploadAttachment({
        data: {
          parentType: 'weekly_sync_item',
          parentId: item.id,
          fileName: input.fileName,
          fileType: input.fileType,
          data: input.data,
        },
      })
    },
    onSuccess: () => invalidateSync(queryClient),
  })
}

/** The `id` is an `attachments.id`; the blob is removed with it by FK cascade. */
export function useDeleteAttachment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteAttachment({ data: { id } }),
    onSuccess: () => invalidateSync(queryClient),
  })
}

/** Several attachments, one after the other; answers how many went. What the Over time sheet removes with. */
export function useDeleteAttachments() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await deleteAttachment({ data: { id } })
      return ids.length
    },
    // Settled, not success: one that failed halfway still removed the ones before it.
    onSettled: () => invalidateSync(queryClient),
  })
}
