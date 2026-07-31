import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpCtx } from './types'
import { mcpErrorFromUnknown, mcpJsonResult } from '../errors'
import * as importantDates from '~/server/services/important-dates'

// Important dates — yearly recurring per-person dates (birthday, anniversary,
// graduation, …). Recurrence is implicit: month + day repeat every year.
// Distinct from `next_bids.dueAt` which is a one-shot deadline.

export function registerImportantDatesTools(server: McpServer, ctx: McpCtx): void {
  server.registerTool(
    'list_important_dates',
    {
      title: 'List important dates',
      description:
        'Yearly-recurring dates across people. Pass personId to filter to one person, omit for all dates sorted by month/day.',
      inputSchema: { personId: z.string().optional() },
    },
    async ({ personId }) => {
      try {
        // Upstream input is `z.object({ personId }).optional()` — pass undefined
        // (not `{ personId: undefined }`) when the LLM omits the filter so
        // Zod takes the "list all" branch.
        return mcpJsonResult(await importantDates.list(ctx.userId, personId ? { personId } : undefined))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'create_important_date',
    {
      title: 'Record an important date',
      description: "Add a yearly-recurring date for a person. `year` is optional — used for 'turning N' math.",
      inputSchema: {
        personId: z.string(),
        label: z.string().min(1).max(120).describe("Short label like 'Birthday' or 'Anniversary'."),
        month: z.number().int().min(1).max(12),
        day: z.number().int().min(1).max(31),
        year: z.number().int().min(1).max(3000).optional().describe('Original year, if known.'),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await importantDates.create(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'update_important_date',
    {
      title: 'Update an important date',
      description: 'Patch label/month/day/year. Pass `year: null` to clear the originating year.',
      inputSchema: {
        id: z.string(),
        label: z.string().min(1).max(120).optional(),
        month: z.number().int().min(1).max(12).optional(),
        day: z.number().int().min(1).max(31).optional(),
        year: z.number().int().min(1).max(3000).nullable().optional(),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await importantDates.update(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'delete_important_date',
    {
      title: 'Delete an important date',
      description: 'Remove the recurring date entry.',
      inputSchema: { id: z.string() },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return mcpJsonResult(await importantDates.remove(ctx.userId, id))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )
}
