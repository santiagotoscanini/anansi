import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { type NextRequest } from 'next/server'

import { appRouter } from '../../../../lib/api/root'
import { createTRPCContext } from '../../../../lib/api/trpc'

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => {
      return createTRPCContext({
        headers: req.headers,
      })
    },
    onError: ({ path, error }) => {
      // UNAUTHORIZED is the expected outcome of auth.me / any protected query
      // for a signed-out visitor — not a server fault worth logging.
      if (error.code === 'UNAUTHORIZED') return
      console.error(`❌ tRPC failed on ${path ?? '<no-path>'}: ${error.message}`)
    },
  })

export { handler as GET, handler as POST }
