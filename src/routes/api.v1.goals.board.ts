import { createFileRoute } from '@tanstack/react-router'
import { computeGoalProgress } from '~/lib/computation/goal-progress'
import { loadGoalsForUser } from '~/lib/data/queries/load-goals'
import { withApiKey } from '~/server/api/v1'
import * as life from '~/server/services/life'
import * as values from '~/server/services/values'

// The phone's Goals screen: every active goal with its tasks, its progress (the
// same engine as the web, `computeGoalProgress`), its importance, its values and
// the life chapters it belongs to.
export const Route = createFileRoute('/api/v1/goals/board')({
  server: {
    handlers: {
      GET: ({ request }) =>
        withApiKey(request, async ({ userId }) => {
          const [{ goals, connections }, valueRows, lifeData] = await Promise.all([
            loadGoalsForUser(userId),
            values.list(userId),
            life.list(userId),
          ])
          const { completions, progresses } = computeGoalProgress(goals, connections)
          const valueById = new Map(valueRows.map((v) => [v.id, v]))
          return goals.map((g) => ({
            id: g.id,
            title: g.title,
            description: g.description,
            emoji: g.emoji ?? null,
            parentId: g.parentId ?? null,
            importance: g.importance,
            ownProgress: Math.round(completions.get(g.id) ?? 0),
            progress: Math.round(progresses.get(g.id)?.totalProgress ?? 0),
            values: g.valueIds
              .map((id) => valueById.get(id))
              .filter((v) => v !== undefined)
              .map((v) => ({ id: v.id, name: v.name, color: v.color })),
            chapters: lifeData.chapters
              .filter((c) => c.goalIds.includes(g.id))
              .map((c) => ({
                id: c.id,
                title: c.title,
                emoji: c.emoji,
                color: c.color,
                startDay: c.startDay,
                endDay: c.endDay,
              })),
            tasks: g.tasks.map((t) => ({
              id: t.id,
              title: t.title,
              description: t.description ?? null,
              emoji: t.emoji ?? null,
              difficulty: t.difficulty,
              completed: t.completed,
              scheduledAt: t.scheduledAt ? new Date(t.scheduledAt).toISOString() : null,
            })),
          }))
        }),
    },
  },
})
