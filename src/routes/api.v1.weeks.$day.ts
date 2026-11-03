import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { weekOfDay } from '~/lib/week'
import { dayParam, readJson, withApiKey } from '~/server/api/v1'
import * as weeklySync from '~/server/services/weekly-sync'

// The week containing `day`: GET reads it (grouped by goal, `weeklySync: null`
// when not started), POST starts it from `templateId` or the default template.
// Starting a week that has a sync returns that sync.
export const Route = createFileRoute('/api/v1/weeks/$day')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApiKey(request, ({ userId }) =>
          weeklySync.getWeeklyRetrospectiveData(userId, weekOfDay(dayParam.parse(params.day))),
        ),
      POST: ({ request, params }) =>
        withApiKey(request, async ({ userId }) => {
          const body = await readJson(request, z.object({ templateId: z.string().optional() }).default({}))
          return weeklySync.create(userId, {
            weekDate: weekOfDay(dayParam.parse(params.day)),
            templateId: body.templateId,
          })
        }),
    },
  },
})
