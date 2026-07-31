import { createFileRoute } from '@tanstack/react-router'
import Pulse from '~/components/goals/Pulse'
import { TabError } from '~/components/goals/TabError'
import { importantDatesQueryOptions, upcomingNextBidsQueryOptions } from '~/lib/queries/people'

// The retrospective half of Pulse is NOT prefetched here, deliberately.
//
// Its cache key is the current week's Monday at LOCAL midnight, and a loader
// runs on the server as well as the client. A server in UTC and a browser in
// UTC-3 compute different instants for "this week", so a prefetch would warm a
// key the client never reads and the client would refetch anyway. The component
// computes the week once on mount and fetches it there.
export const Route = createFileRoute('/app/pulse')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(upcomingNextBidsQueryOptions()),
      context.queryClient.ensureQueryData(importantDatesQueryOptions()),
    ]),
  component: Pulse,
  errorComponent: TabError,
})
