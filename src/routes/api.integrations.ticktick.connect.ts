import { createFileRoute } from '@tanstack/react-router'
import { tickTickEnabled } from '~/lib/env'
import { getServerSession } from '~/server/auth/session'
import { authorizeUrl } from '~/server/ticktick/client'
import { redirectUri, startState } from '~/server/ticktick/oauth'

// Profile → TickTick → Connect is a link here (a full-page navigation, since
// it leaves for ticktick.com). `?tz=` is the browser's time zone, kept for the
// callback: it is the zone due days are read in.
export const Route = createFileRoute('/api/integrations/ticktick/connect')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getServerSession()
        if (!session?.user?.id) return Response.redirect(new URL('/login', request.url), 302)
        if (!tickTickEnabled) return new Response('TickTick is not configured on this server', { status: 404 })
        const tz = new URL(request.url).searchParams.get('tz')
        const { state, cookie } = startState(request, tz && tz.length < 64 ? tz : null)
        return new Response(null, {
          status: 302,
          headers: {
            location: authorizeUrl(redirectUri(request), state),
            'set-cookie': cookie,
            'cache-control': 'no-store',
          },
        })
      },
    },
  },
})
