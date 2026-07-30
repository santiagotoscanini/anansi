import { QueryClient } from '@tanstack/react-query'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  // One QueryClient per request on the server (created fresh inside getRouter),
  // and one for the lifetime of the tab on the client.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Reproduces the tRPC client's global staleTime (src/trpc/react.tsx).
        // A fresh QueryClient defaults to 0, which would turn every component
        // remount — every tab switch — into a refetch. The app has no
        // real-time requirement; 30s is the behaviour users have today.
        staleTime: 30_000,
      },
    },
  })

  const router = createTanStackRouter({
    routeTree,
    // Expose the QueryClient to loaders/components via router context.
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: 'intent',
    // Let TanStack Query own caching/staleness; the router shouldn't also
    // cache loader data. Unrelated to the `staleTime` above.
    defaultPreloadStaleTime: 0,
  })

  // Wires SSR dehydration/hydration of the Query cache into the router, so data
  // fetched in a loader on the server is reused on the client without a refetch.
  setupRouterSsrQueryIntegration({ router, queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
