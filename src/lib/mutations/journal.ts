import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { qk } from '~/lib/queries/keys'
import { deleteAttachment } from '~/server/fn/attachments.fn'
import { deleteJournalEntry, uploadJournalAttachment, writeJournalEntry } from '~/server/fn/journal.fn'

// Writes against the journal. Each invalidates the whole `journal` root: a day,
// the list beside it and a person's mentions are three views of the same rows,
// and a write to one changes the others (a new mention, a first highlight).

const invalidateJournal = (queryClient: QueryClient) => queryClient.invalidateQueries({ queryKey: qk.journal })

/** Replace-set on the fields passed; a day written empty is deleted. */
export function useWriteJournalEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof writeJournalEntry>[0]['data']) => writeJournalEntry({ data }),
    onSuccess: (entry, input) => {
      // The day's own query is answered by the write, so the editor does not
      // wait for a refetch to show what was saved.
      queryClient.setQueryData(qk.journalDay(input.day), entry)
      return invalidateJournal(queryClient)
    },
  })
}

export function useDeleteJournalEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof deleteJournalEntry>[0]['data']) => deleteJournalEntry({ data }),
    onSuccess: () => invalidateJournal(queryClient),
  })
}

export function useUploadJournalAttachment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof uploadJournalAttachment>[0]['data']) => uploadJournalAttachment({ data }),
    onSuccess: () => invalidateJournal(queryClient),
  })
}

export function useDeleteJournalAttachment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteAttachment({ data: { id } }),
    onSuccess: () => invalidateJournal(queryClient),
  })
}
