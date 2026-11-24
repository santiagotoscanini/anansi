import type { QueryClient, FetchQueryOptions } from '@tanstack/react-query'

/**
 * What a tab's loader does with its queries.
 *
 * On the server it waits for them, so the page is rendered with its data and
 * the cache travels to the browser with it. In the browser it starts them and
 * returns at once: the tab renders straight away, from the cache when it has
 * the data and behind a skeleton (the Suspense boundary around the tab in
 * AppShell) when it does not. Waiting there instead is what made a first visit
 * to a tab sit on the old page for the whole round trip.
 */
export function prime(
  queryClient: QueryClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a list of unrelated query options, each typed at its own call
  ...options: FetchQueryOptions<any, any, any, any>[]
): Promise<unknown> | undefined {
  const all = Promise.all(options.map((o) => queryClient.ensureQueryData(o)))
  if (typeof window === 'undefined') return all
  // The component's useSuspenseQuery reads the same query and shows its error.
  all.catch(() => undefined)
  return undefined
}
