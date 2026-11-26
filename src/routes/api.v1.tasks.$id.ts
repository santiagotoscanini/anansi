import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '~/lib/data'
import { goals, tasks as taskTable } from '~/lib/data/schema'
import { readJson, withApiKey } from '~/server/api/v1'
import { AppError } from '~/server/services/errors'
import * as tasks from '~/server/services/tasks'

// One task, from the phone's Goals screen. PATCH marks it done or open (the
// only change the phone makes); the service finds what else follows (TickTick).
export const Route = createFileRoute('/api/v1/tasks/$id')({
  server: {
    handlers: {
      PATCH: ({ request, params }) =>
        withApiKey(request, async ({ userId }) => {
          const body = await readJson(request, z.object({ completed: z.boolean() }))
          const [row] = await db
            .select({ goalId: taskTable.goalId })
            .from(taskTable)
            .innerJoin(goals, eq(goals.id, taskTable.goalId))
            .where(and(eq(taskTable.id, params.id), eq(goals.userId, userId)))
            .limit(1)
          if (!row) throw new AppError('NOT_FOUND', 'Task not found')
          await tasks.update(userId, { id: params.id, goalId: row.goalId, completed: body.completed })
          return { success: true }
        }),
    },
  },
})
