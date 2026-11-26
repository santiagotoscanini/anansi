import { useMutation, useQueryClient } from '@tanstack/react-query'
import { qk } from '~/lib/queries/keys'
import {
  createLifeChapter,
  createLifeView,
  deleteLifeChapter,
  deleteLifeView,
  setLifeSettings,
  updateLifeChapter,
  updateLifeView,
} from '~/server/fn/life.fn'

// Writes for the Life tab. Not optimistic: each comes from a small form that
// closes on success, and the grid redraws from the server's answer.

function useLifeMutation<T, R>(fn: (data: T) => Promise<R>, alsoMe = false) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.life })
      if (alsoMe) await queryClient.invalidateQueries({ queryKey: qk.me })
    },
  })
}

export const useSetLifeSettings = () =>
  useLifeMutation((data: Parameters<typeof setLifeSettings>[0]['data']) => setLifeSettings({ data }), true)
export const useCreateLifeChapter = () =>
  useLifeMutation((data: Parameters<typeof createLifeChapter>[0]['data']) => createLifeChapter({ data }))
export const useUpdateLifeChapter = () =>
  useLifeMutation((data: Parameters<typeof updateLifeChapter>[0]['data']) => updateLifeChapter({ data }))
export const useDeleteLifeChapter = () => useLifeMutation((id: string) => deleteLifeChapter({ data: { id } }))
export const useCreateLifeView = () =>
  useLifeMutation((data: Parameters<typeof createLifeView>[0]['data']) => createLifeView({ data }))
export const useUpdateLifeView = () =>
  useLifeMutation((data: Parameters<typeof updateLifeView>[0]['data']) => updateLifeView({ data }))
export const useDeleteLifeView = () => useLifeMutation((id: string) => deleteLifeView({ data: { id } }))
