import { createFileRoute } from '@tanstack/react-router'
import { withApiKey } from '~/server/api/v1'
import * as auth from '~/server/services/auth'

// Who the key belongs to: what the phone shows after scanning a key.
export const Route = createFileRoute('/api/v1/me')({
  server: {
    handlers: {
      GET: ({ request }) =>
        withApiKey(request, async ({ userId }) => {
          const me = await auth.me(userId)
          return { id: me.id, name: me.name, email: me.email }
        }),
    },
  },
})
