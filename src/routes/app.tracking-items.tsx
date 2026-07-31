import { createFileRoute } from '@tanstack/react-router'
import { TabError } from '~/components/goals/TabError'
import TrackingItemsLibrary from '~/components/goals/TrackingItemsLibrary'
import { trackingItemsQueryOptions } from '~/lib/queries/sync'

// No goalId — the library view is every item, including the unscoped ones.
export const Route = createFileRoute('/app/tracking-items')({
  loader: ({ context }) => context.queryClient.ensureQueryData(trackingItemsQueryOptions()),
  component: TrackingItemsLibrary,
  errorComponent: TabError,
})
