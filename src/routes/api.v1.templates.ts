import { createFileRoute } from '@tanstack/react-router'
import { createSyncTemplateSchema } from '~/lib/api/types'
import { readJson, withApiKey } from '~/server/api/v1'
import * as syncTemplates from '~/server/services/sync-templates'

// Sync templates with their items; at most one is the default new weeks start
// from. POST creates one (`isDefault: true` makes it the default).
export const Route = createFileRoute('/api/v1/templates')({
  server: {
    handlers: {
      GET: ({ request }) => withApiKey(request, ({ userId }) => syncTemplates.list(userId)),
      POST: ({ request }) =>
        withApiKey(request, async ({ userId }) =>
          syncTemplates.create(userId, await readJson(request, createSyncTemplateSchema)),
        ),
    },
  },
})
