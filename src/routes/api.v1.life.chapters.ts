import { createFileRoute } from '@tanstack/react-router'
import { createLifeChapterSchema } from '~/lib/api/life'
import { readJson, withApiKey } from '~/server/api/v1'
import * as life from '~/server/services/life'

// A new life chapter from the phone. Null or absent start = since birth, end =
// until the end of the expected life.
export const Route = createFileRoute('/api/v1/life/chapters')({
  server: {
    handlers: {
      POST: ({ request }) =>
        withApiKey(request, async ({ userId }) =>
          life.createChapter(userId, await readJson(request, createLifeChapterSchema)),
        ),
    },
  },
})
