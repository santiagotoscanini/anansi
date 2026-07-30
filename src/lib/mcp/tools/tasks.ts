import 'server-only'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpCtx } from './types'
import { mcpErrorFromUnknown, mcpJsonResult } from '../errors'
import { createTaskSchema } from '~/lib/api/types'
import * as tasks from '~/server/services/tasks'

// Tasks are atomic actions under a goal. Each task has a single optional
// deadline (`scheduledAt`) — the Horizons board buckets it into Month /
// Quarter / Year client-side based on how far out the date is, so we don't
// ask the LLM to think in buckets, just dates.
//
// Per CLAUDE.md, every task mutation needs the goalId for the ownership check.

const emoji = z
  .string()
  .regex(/^\S{1,8}$/u, 'emoji glyph only — 1-8 non-whitespace characters')
  .optional()
const difficulty = z.union([z.literal(1), z.literal(2), z.literal(3)])

export function registerTasksTools(server: McpServer, ctx: McpCtx): void {
  server.registerTool(
    'create_task',
    {
      title: 'Create a task',
      description:
        'Add a task to a goal. Difficulty is a vibes-based 1 (easy) to 3 (hard). `scheduledAt` is the optional deadline — omit for backlog. `referentIds` are people the user is relying on for this task; `groupIds` tag the task with cross-entity groups.',
      inputSchema: {
        goalId: z.string().describe('Parent goal id.'),
        title: z.string().min(1),
        description: z.string().optional(),
        emoji,
        difficulty: difficulty.describe('1 = easy, 2 = medium, 3 = hard.'),
        completed: z.boolean().default(false),
        scheduledAt: z.coerce.date().nullable().optional().describe('Deadline date or null/omit for backlog.'),
        referentIds: z.array(z.string()).optional().describe("People I'm relying on for this task."),
        groupIds: z.array(z.string()).optional().describe('Groups this task belongs to.'),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        // Parsed with the canonical schema before dispatch, not just handed
        // through. The hand-written `inputSchema` above is what the LLM sees
        // and is deliberately looser — it omits fields the schema supplies via
        // `.default()` (ids arrays, order indices) so the model isn't asked to
        // invent them. tRPC used to apply those defaults in `.input()`; calling
        // the service directly skips that, so the parse has to happen here or
        // the service receives `undefined` where it expects a value.
        //
        // goalId is carried alongside rather than through the schema, matching
        // the router's `createTaskSchema.extend({ goalId })` — a task's parent
        // is addressing, not payload.
        return mcpJsonResult(await tasks.create(ctx.userId, { ...createTaskSchema.parse(args), goalId: args.goalId }))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'update_task',
    {
      title: 'Update a task',
      description:
        'Patch a task. Pass only the fields you want to change. `referentIds` and `groupIds` REPLACE the existing sets if passed; omit to leave them alone. Setting `completed: true` marks the task done.',
      inputSchema: {
        id: z.string(),
        goalId: z.string().describe('Parent goal id (used for ownership check).'),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        emoji,
        difficulty: difficulty.optional(),
        completed: z.boolean().optional(),
        scheduledAt: z.coerce.date().nullable().optional().describe('Deadline, null to clear.'),
        referentIds: z.array(z.string()).optional(),
        groupIds: z.array(z.string()).optional(),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await tasks.update(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'delete_task',
    {
      title: 'Delete a task',
      description: 'Hard-delete a task. Confirm with the user before calling.',
      inputSchema: {
        id: z.string(),
        goalId: z.string().describe('Parent goal id (used for ownership check).'),
      },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, goalId }) => {
      try {
        return mcpJsonResult(await tasks.remove(ctx.userId, { id, goalId }))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'set_task_scheduled',
    {
      title: "Set or clear a task's deadline",
      description:
        "Update only a task's `scheduledAt` deadline. Pass null to move the task back to the backlog (unscheduled). Prefer this over `update_task` when scheduling is the only change.",
      inputSchema: {
        id: z.string(),
        scheduledAt: z.coerce.date().nullable().describe('New deadline date, or null to unschedule.'),
      },
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, scheduledAt }) => {
      try {
        return mcpJsonResult(await tasks.setScheduled(ctx.userId, { id, scheduledAt }))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )
}
