import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { listConnections } from '~/server/fn/connections.fn'
import { fetchGoalsData } from '~/server/fn/data.fn'
import { listGoals } from '~/server/fn/goals.fn'
import { qk } from './keys'

// Client-safe: importing a server fn pulls in a thin RPC stub, never the
// handler body. The `no-restricted-imports` boundary in eslint.config keeps it
// that way — components import from here, not from ~/server/**.

/**
 * The graph's boot payload: values + goals + connections in one round trip.
 *
 * Prefer this over composing the three below. Server functions do not batch the
 * way tRPC's httpBatchLink did, so three separate queries would be three
 * requests on every client-side navigation into the graph.
 */
export const goalsDataQueryOptions = () =>
  queryOptions({
    queryKey: qk.goalsData,
    queryFn: ({ signal }) => fetchGoalsData({ signal }),
  })

/** Goals with their tasks, without values or connections. */
export const goalsQueryOptions = () =>
  queryOptions({
    queryKey: qk.goals,
    queryFn: ({ signal }) => listGoals({ signal }),
  })

export const connectionsQueryOptions = () =>
  queryOptions({
    queryKey: qk.connections,
    queryFn: ({ signal }) => listConnections({ signal }),
  })

export type GoalsData = Awaited<ReturnType<typeof fetchGoalsData>>

/**
 * The graph payload, for components rather than loaders.
 *
 * Suspense rather than `useQuery` because every route that renders one of these
 * components already calls `ensureQueryData(goalsDataQueryOptions())` in its
 * loader, so the data is in the cache before the component mounts and this
 * never actually suspends on first paint. That is what replaced the
 * `isDataLoading` spinner the dashboard used to render — with the loader
 * prefetch there is no loading state left to show.
 *
 * A component that reaches this without its route having loaded it will
 * suspend, not crash. Fixing that means adding the query to the route's loader,
 * not adding a fallback here.
 */
export function useGoalsData(): GoalsData {
  return useSuspenseQuery(goalsDataQueryOptions()).data
}
