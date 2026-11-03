import { createFileRoute } from '@tanstack/react-router'
import { dayParam, withApiKey } from '~/server/api/v1'
import * as pulse from '~/server/services/pulse'

// Pulse for `?day=YYYY-MM-DD`, the caller's own calendar day: the same reading
// as the Pulse screen and the `get_pulse` MCP tool.
export const Route = createFileRoute('/api/v1/pulse')({
  server: {
    handlers: {
      GET: ({ request }) =>
        withApiKey(request, ({ userId }) =>
          pulse.get(userId, dayParam.parse(new URL(request.url).searchParams.get('day'))),
        ),
    },
  },
})
