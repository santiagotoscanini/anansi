import { queryOptions } from '@tanstack/react-query'
import { listSyncTemplates } from '~/server/fn/sync-templates.fn'
import { listTrackingItems } from '~/server/fn/tracking-items.fn'
import { getSyncByWeek, getWeeklyRetrospectiveData } from '~/server/fn/weekly-sync.fn'
import { qk } from './keys'

/** The tracking-item library, optionally narrowed to one goal. */
export const trackingItemsQueryOptions = (goalId?: string) =>
  queryOptions({
    queryKey: qk.trackingItemsFor(goalId),
    queryFn: ({ signal }) => listTrackingItems({ data: { goalId }, signal }),
  })

export const syncTemplatesQueryOptions = () =>
  queryOptions({
    queryKey: qk.syncTemplates,
    queryFn: ({ signal }) => listSyncTemplates({ signal }),
  })

/** Just the sync row for a week — null if the user hasn't started one. */
export const weeklySyncQueryOptions = (weekStart: Date) =>
  queryOptions({
    queryKey: qk.weeklySyncFor(weekStart),
    queryFn: ({ signal }) => getSyncByWeek({ data: { weekStart }, signal }),
  })

/**
 * Everything the retrospective screen renders, in one call: the sync row, the
 * full library, the goal-grouped items with attachments, and the unscoped ones.
 *
 * Every mutation on that screen invalidates this one key. That is coarser than
 * patching the affected item, and deliberately so — the payload is a
 * cross-joined view where an item's attachment count, its goal grouping and the
 * sync's fill counter all move together.
 */
export const weeklyRetrospectiveQueryOptions = (weekStart: Date) =>
  queryOptions({
    queryKey: qk.weeklyRetrospectiveFor(weekStart),
    queryFn: ({ signal }) => getWeeklyRetrospectiveData({ data: { weekStart }, signal }),
  })
