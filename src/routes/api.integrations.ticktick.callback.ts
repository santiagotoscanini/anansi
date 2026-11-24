import { createFileRoute } from '@tanstack/react-router'
import { tickTickEnabled } from '~/lib/env'
import { getServerSession } from '~/server/auth/session'
import { saveConnection } from '~/server/services/ticktick'
import { exchangeCode } from '~/server/ticktick/client'
import { checkState, clearStateCookie, redirectUri } from '~/server/ticktick/oauth'

// Where TickTick sends the browser back. The state cookie set by /connect must
// match, so a callback this browser did not start connects nothing; the
// session says whose TickTick it is. Back to Profile either way, with
// `?ticktick=` saying how it went.
export const Route = createFileRoute('/api/integrations/ticktick/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const back = (outcome: 'connected' | 'denied' | 'failed') =>
          new Response(null, {
            status: 302,
            headers: {
              location: `/app?modal=profile&ticktick=${outcome}`,
              'set-cookie': clearStateCookie,
              'cache-control': 'no-store',
            },
          })
        const session = await getServerSession()
        const userId = session?.user?.id
        if (!userId) return Response.redirect(new URL('/login', request.url), 302)
        if (!tickTickEnabled) return back('failed')

        const url = new URL(request.url)
        const checked = checkState(request, url.searchParams.get('state'))
        const code = url.searchParams.get('code')
        if (!checked) return back('failed')
        if (!code) return back('denied')
        try {
          const token = await exchangeCode(code, redirectUri(request))
          await saveConnection(userId, token, checked.timeZone)
          return back('connected')
        } catch (e) {
          console.error('[ticktick] connect failed', e instanceof Error ? e.message : e)
          return back('failed')
        }
      },
    },
  },
})
