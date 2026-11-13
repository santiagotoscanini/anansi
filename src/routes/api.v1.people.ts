import { createFileRoute } from '@tanstack/react-router'
import { withApiKey } from '~/server/api/v1'
import * as people from '~/server/services/people'

// The people the user tracks, as the phone's mention picker needs them: id,
// name and emoji (a glyph, or null: an uploaded photo is not sent, since its
// URL needs a browser session). Archived people are left out.
export const Route = createFileRoute('/api/v1/people')({
  server: {
    handlers: {
      GET: ({ request }) =>
        withApiKey(request, async ({ userId }) =>
          (await people.list(userId))
            .map((p) => ({ id: p.id, name: p.name, emoji: p.emoji?.startsWith('/') ? null : p.emoji }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
    },
  },
})
