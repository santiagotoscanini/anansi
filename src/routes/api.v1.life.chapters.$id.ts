import { createFileRoute } from '@tanstack/react-router'
import { updateLifeChapterSchema } from '~/lib/api/life'
import { readJson, withApiKey } from '~/server/api/v1'
import * as life from '~/server/services/life'

// One life chapter. PATCH changes what it is given (goalIds and viewIds replace
// the whole set); DELETE removes it (its goals stay).
export const Route = createFileRoute('/api/v1/life/chapters/$id')({
  server: {
    handlers: {
      PATCH: ({ request, params }) =>
        withApiKey(request, async ({ userId }) =>
          life.updateChapter(
            userId,
            await readJson(
              request,
              updateLifeChapterSchema.omit({ id: true }).transform((b) => ({ ...b, id: params.id })),
            ),
          ),
        ),
      DELETE: ({ request, params }) => withApiKey(request, ({ userId }) => life.removeChapter(userId, params.id)),
    },
  },
})
