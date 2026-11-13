import { queryOptions } from '@tanstack/react-query'
import { getJournalEntry, listJournalEntries } from '~/server/fn/journal.fn'
import { qk } from './keys'

/**
 * One day of the journal, or null.
 *
 * Never prefetched in a loader when the day is "today": today is the browser's
 * calendar day, and a loader also runs on a server whose clock is UTC (the same
 * reason the week-keyed queries are not prefetched).
 */
export const journalEntryQueryOptions = (day: string) =>
  queryOptions({
    queryKey: qk.journalDay(day),
    queryFn: ({ signal }) => getJournalEntry({ data: { day }, signal }),
  })

export type JournalEntryRow = NonNullable<Awaited<ReturnType<typeof getJournalEntry>>>

/** The latest entries, for the list beside the day. */
export const journalRecentQueryOptions = (query?: string) =>
  queryOptions({
    queryKey: qk.journalRecent(query),
    queryFn: ({ signal }) =>
      listJournalEntries({ data: { limit: 60, query: query === '' ? undefined : query }, signal }),
  })
