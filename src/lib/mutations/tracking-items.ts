import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { qk } from '~/lib/queries/keys'
import {
  createSyncTemplate,
  deleteSyncTemplate,
  setSyncTemplateItems,
  updateSyncTemplate,
} from '~/server/fn/sync-templates.fn'
import { createTrackingItem, deleteTrackingItem, updateTrackingItem } from '~/server/fn/tracking-items.fn'

// Writes for the tracking-item library and the sync templates built from it.
//
// Both invalidate the weekly-sync root as well as their own. A template edit
// changes what a NEW sync snapshots, and a library edit changes the titles
// rendered inside an existing one — the retrospective payload joins across all
// three, so leaving it stale shows a renamed item under its old name.

const invalidateLibrary = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.trackingItems }),
    queryClient.invalidateQueries({ queryKey: qk.weeklySync }),
  ])

export function useCreateTrackingItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof createTrackingItem>[0]['data']) => createTrackingItem({ data }),
    onSuccess: () => invalidateLibrary(queryClient),
  })
}

export function useUpdateTrackingItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof updateTrackingItem>[0]['data']) => updateTrackingItem({ data }),
    onSuccess: () => invalidateLibrary(queryClient),
  })
}

/**
 * Delete a library item.
 *
 * Soft when an existing sync references it, hard otherwise — the server decides
 * and reports which in the result, so callers can word the confirmation
 * honestly instead of promising a removal that didn't happen.
 */
export function useDeleteTrackingItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteTrackingItem({ data: { id } }),
    onSuccess: () => invalidateLibrary(queryClient),
  })
}

const invalidateTemplates = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.syncTemplates }),
    queryClient.invalidateQueries({ queryKey: qk.weeklySync }),
  ])

export function useCreateSyncTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof createSyncTemplate>[0]['data']) => createSyncTemplate({ data }),
    onSuccess: () => invalidateTemplates(queryClient),
  })
}

export function useUpdateSyncTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof updateSyncTemplate>[0]['data']) => updateSyncTemplate({ data }),
    onSuccess: () => invalidateTemplates(queryClient),
  })
}

export function useDeleteSyncTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteSyncTemplate({ data: { id } }),
    onSuccess: () => invalidateTemplates(queryClient),
  })
}

/** Replace-set: the array passed becomes the template's contents, in order. */
export function useSetSyncTemplateItems() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof setSyncTemplateItems>[0]['data']) => setSyncTemplateItems({ data }),
    onSuccess: () => invalidateTemplates(queryClient),
  })
}
