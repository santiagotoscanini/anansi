import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpCtx } from './types'
import { toolInput } from './fields'
import { mcpErrorFromUnknown, mcpJsonResult } from '../errors'
import { createTrackingItemSchema, updateTrackingItemSchema } from '~/lib/api/types'
import * as trackingItems from '~/server/services/tracking-items'

// Tracking items: the library of things reviewed week to week. A goal link is
// optional, and an item with none reads as "Unscoped". A sync holds its own
// snapshot of items, so adding to the library never changes a past week. An item
// deleted or archived does leave every week's view, past ones included.

export function registerTrackingItemsTools(server: McpServer, ctx: McpCtx): void {
  server.registerTool(
    'list_tracking_items',
    {
      title: 'List tracking items',
      description:
        'Every active item in the library, optionally for one goal. Items with `goalId: null` are unscoped. Call before adding items to a sync or a template, to learn the ids.',
      inputSchema: toolInput({ goalId: z.string().optional() }),
    },
    async (args) => {
      try {
        return mcpJsonResult(await trackingItems.list(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'create_tracking_item',
    {
      title: 'Create a tracking item',
      description:
        'Add an item to the library. It joins no sync on its own: use `add_sync_item` for this week, or `set_sync_template_items` to have future weeks start with it.',
      inputSchema: toolInput({
        title: z.string().min(1).max(200),
        description: z.string().max(2000).nullable().optional(),
        goalId: z.string().nullable().optional().describe('Goal this tracks. Omit or null for unscoped.'),
        order: z.number().int().optional().describe('Position in the library. Default 0.'),
      }),
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await trackingItems.create(ctx.userId, createTrackingItemSchema.parse(args)))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'update_tracking_item',
    {
      title: 'Update a tracking item',
      description:
        'Patch a library item. `goalId: null` unscopes it. `status: archived` retires it from the library, and it stops showing on every sync, past weeks included, until it is set back to active.',
      inputSchema: toolInput({
        id: z.string(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(2000).nullable().optional(),
        goalId: z.string().nullable().optional(),
        order: z.number().int().optional(),
        status: z.enum(['active', 'archived']).optional(),
      }),
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await trackingItems.update(ctx.userId, updateTrackingItemSchema.parse(args)))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'delete_tracking_item',
    {
      title: 'Delete a tracking item',
      description:
        'Remove an item from the library. If a sync used it the row and its notes stay in the database (`soft_delete`), otherwise it goes for good (`hard_delete`). Either way it stops showing on every sync, past weeks included. To drop it from one week only, use `remove_sync_item`; to keep the history, leave it alone and stop adding it.',
      inputSchema: toolInput({ id: z.string() }),
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return mcpJsonResult(await trackingItems.remove(ctx.userId, id))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )
}
