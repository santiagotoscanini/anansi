import { useMutation, useQueryClient } from '@tanstack/react-query'
import { qk } from '~/lib/queries/keys'
import type { CaptureRow } from '~/lib/queries/captures'
import {
  createCapture,
  deleteCapture,
  deleteCaptureTerm,
  retranscribeCapture,
  retryCapture,
  saveCaptureTerm,
  updateCapture,
} from '~/server/fn/captures.fn'

// Writes for the Inbox. Archive and delete are optimistic (the row goes at
// once and comes back on failure); a move to a question waits for the server,
// which answers where the capture went. A note added to a question also
// changes the Self page's open questions.

function useCaptureCache() {
  const queryClient = useQueryClient()
  return {
    begin: async (patch: (old: CaptureRow[]) => CaptureRow[]) => {
      await queryClient.cancelQueries({ queryKey: qk.captures })
      const snapshot = queryClient.getQueryData<CaptureRow[]>(qk.captures)
      if (snapshot) queryClient.setQueryData<CaptureRow[]>(qk.captures, patch(snapshot))
      return { snapshot }
    },
    rollback: (context: { snapshot?: CaptureRow[] } | undefined) => {
      if (context?.snapshot) queryClient.setQueryData(qk.captures, context.snapshot)
    },
    settle: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.captures }),
        queryClient.invalidateQueries({ queryKey: qk.openQuestions }),
      ]),
  }
}

export function useCreateCapture() {
  const { settle } = useCaptureCache()
  return useMutation({
    mutationFn: (data: { text: string; questionId?: string | null }) => createCapture({ data }),
    onSettled: settle,
  })
}

export function useUpdateCapture() {
  const { begin, rollback, settle } = useCaptureCache()
  return useMutation({
    mutationFn: (data: Parameters<typeof updateCapture>[0]['data']) => updateCapture({ data }),
    onMutate: (input) =>
      input.status === 'archived'
        ? begin((old) => old.map((c) => (c.id === input.id ? { ...c, status: 'archived' } : c)))
        : undefined,
    onError: (_e, _input, context) => rollback(context),
    onSettled: settle,
  })
}

export function useRetryCapture() {
  const { settle } = useCaptureCache()
  return useMutation({
    mutationFn: (id: string) => retryCapture({ data: { id } }),
    onSettled: settle,
  })
}

export function useDeleteCapture() {
  const { begin, rollback, settle } = useCaptureCache()
  return useMutation({
    mutationFn: (id: string) => deleteCapture({ data: { id } }),
    onMutate: (id) => begin((old) => old.filter((c) => c.id !== id)),
    onError: (_e, _id, context) => rollback(context),
    onSettled: settle,
  })
}

export function useRetranscribeCapture() {
  const { settle } = useCaptureCache()
  return useMutation({
    mutationFn: (id: string) => retranscribeCapture({ data: { id } }),
    onSettled: settle,
  })
}

export function useSaveCaptureTerm() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { heard: string; meant: string }) => saveCaptureTerm({ data }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.captureTerms }),
  })
}

export function useDeleteCaptureTerm() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteCaptureTerm({ data: { id } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.captureTerms }),
  })
}
