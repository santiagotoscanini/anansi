import { createFileRoute } from '@tanstack/react-router'
import { readJson, withApiKey } from '~/server/api/v1'
import { lifeSettingsSchema } from '~/lib/api/life'
import * as life from '~/server/services/life'

// The Life tab on the phone. GET is everything the grid draws (the birth date,
// the life expectancy, chapters, views and each week's record); PUT sets the
// birth date and/or the life expectancy and answers the same.
export const Route = createFileRoute('/api/v1/life')({
  server: {
    handlers: {
      GET: ({ request }) => withApiKey(request, ({ userId }) => life.overview(userId)),
      PUT: ({ request }) =>
        withApiKey(request, async ({ userId }) => {
          await life.setSettings(userId, await readJson(request, lifeSettingsSchema))
          return life.overview(userId)
        }),
    },
  },
})
