import { queryOptions } from '@tanstack/react-query'
import { listSyncTemplates } from '~/server/fn/sync-templates.fn'
import { getTrackingItemHistory, listTrackingItems } from '~/server/fn/tracking-items.fn'
import { getSyncByWeek, getWeeklyRetrospectiveData } from '~/server/fn/weekly-sync.fn'
import { qk } from './keys'

/** The tracking-item library, optionally narrowed to one goal. */
export const trackingItemsQueryOptions = (goalId?: string) =>
  queryOptions({
    queryKey: qk.trackingItemsFor(goalId),
    queryFn: ({ signal }) => listTrackingItems({ data: { goalId }, signal }),
  })

/** One library row, hydrated with its goal's title for the "Unscoped" pill. */
export type TrackingItemRow = Awaited<ReturnType<typeof listTrackingItems>>[number]

export const syncTemplatesQueryOptions = () =>
  queryOptions({
    queryKey: qk.syncTemplates,
    queryFn: ({ signal }) => listSyncTemplates({ signal }),
  })

/** A template with its ordered items — what the default-sync editor renders. */
export type SyncTemplateRow = Awaited<ReturnType<typeof listSyncTemplates>>[number]

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

export type WeeklyRetrospectiveData = Awaited<ReturnType<typeof getWeeklyRetrospectiveData>>

/**
 * One item on a sync: its text, its attachments, and the library row behind it.
 *
 * Read off `unscopedItems` rather than off a goal group because the two are the
 * same row shape and this one needs no index into `goals`.
 */
export type SyncItem = WeeklyRetrospectiveData['unscopedItems'][number]

/** One item over time: every week that recorded something for it, oldest first. */
export const trackingItemHistoryQueryOptions = (id: string) =>
  queryOptions({
    queryKey: qk.trackingItemHistory(id),
    queryFn: ({ signal }) => getTrackingItemHistory({ data: { id }, signal }),
  })

export type TrackingItemHistory = Awaited<ReturnType<typeof getTrackingItemHistory>>
