import { createFileRoute, redirect } from '@tanstack/react-router'
import ItemOverTime, { type OverTimeView } from '~/components/goals/ItemOverTime'
import { TabError } from '~/components/goals/TabError'
import TrackingItemsLibrary from '~/components/goals/TrackingItemsLibrary'
import { parseAppError } from '~/lib/queries/errors'
import { prime } from '~/lib/queries/prime'
import { trackingItemHistoryQueryOptions, trackingItemsQueryOptions } from '~/lib/queries/sync'

// The library, or with `?item=<id>` that one item over time (`view` picks how:
// as a time-lapse, two weeks compared, or every week on a sheet). Unlike the
// week-keyed screens this is prefetched: the service names each week by its
// Sunday's calendar day, so nothing here depends on whose clock runs the loader.
//
// An inline function literal, never a generic helper: see app.bucket.tsx.
export const Route = createFileRoute('/app/tracking-items')({
  validateSearch: (search: Record<string, unknown>): { item?: string; view?: OverTimeView } => ({
    item: typeof search.item === 'string' && search.item ? search.item : undefined,
    view: search.view === 'play' || search.view === 'compare' || search.view === 'all' ? search.view : undefined,
  }),
  loaderDeps: ({ search }) => ({ item: search.item }),
  loader: async ({ context, deps }) => {
    // No goalId: the library view is every item, including the unscoped ones.
    // The library alone does not wait in the browser (see prime); a deep link
    // to one item does, since a gone item redirects.
    if (!deps.item) return prime(context.queryClient, trackingItemsQueryOptions())
    const library = context.queryClient.ensureQueryData(trackingItemsQueryOptions())
    try {
      await context.queryClient.ensureQueryData(trackingItemHistoryQueryOptions(deps.item))
    } catch (error) {
      // A link to an item that is gone opens the library, not an error card.
      if (parseAppError(error).code === 'NOT_FOUND') throw redirect({ to: '/app/tracking-items' })
      throw error
    }
    await library
  },
  component: TrackingItems,
  errorComponent: TabError,
})

function TrackingItems() {
  const { item, view } = Route.useSearch()
  // Keyed by item, so another item starts from its own latest picture.
  return item ? <ItemOverTime key={item} itemId={item} view={view} /> : <TrackingItemsLibrary />
}
