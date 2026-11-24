import { useMutation, useQueryClient } from '@tanstack/react-query'
import { qk } from '~/lib/queries/keys'
import { deletePersonalityResult, recordPersonalityResult, updatePersonalityResult } from '~/server/fn/personality.fn'

// Writes for the personality results on the Self page. Not optimistic: they
// come from a form that is closed on success, and a result the server refuses
// (details that do not fit the test) must not flash in first.

export function useRecordPersonalityResult() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof recordPersonalityResult>[0]['data']) => recordPersonalityResult({ data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.personalityResults }),
  })
}

export function useUpdatePersonalityResult() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof updatePersonalityResult>[0]['data']) => updatePersonalityResult({ data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.personalityResults }),
  })
}

export function useDeletePersonalityResult() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deletePersonalityResult({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.personalityResults }),
  })
}
