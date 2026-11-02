import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpCtx } from './types'
import { closedObject, toolInput } from './fields'
import { mcpErrorFromUnknown, mcpJsonResult } from '../errors'
import { createSyncTemplateSchema, setSyncTemplateItemsSchema, updateSyncTemplateSchema } from '~/lib/api/types'
import * as syncTemplates from '~/server/services/sync-templates'

// Sync templates: named bundles of tracking items. The one default snapshots
// into each new weekly sync, and editing a template never changes a sync that
// already exists.

export function registerSyncTemplatesTools(server: McpServer, ctx: McpCtx): void {
  server.registerTool(
    'list_sync_templates',
    {
      title: 'List sync templates',
      description: 'Every template with its items in order. At most one has `isDefault: true`.',
      inputSchema: toolInput({}),
    },
    async () => {
      try {
        return mcpJsonResult(await syncTemplates.list(ctx.userId))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'create_sync_template',
    {
      title: 'Create a sync template',
      description:
        'Create an empty template; fill it with `set_sync_template_items`. `isDefault: true` makes it the one new weeks start from and clears the previous default.',
      inputSchema: toolInput({
        name: z.string().min(1).max(100),
        isDefault: z.boolean().optional(),
      }),
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await syncTemplates.create(ctx.userId, createSyncTemplateSchema.parse(args)))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'update_sync_template',
    {
      title: 'Update a sync template',
      description: 'Rename a template, or set `isDefault: true` to make it the default.',
      inputSchema: toolInput({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        isDefault: z.boolean().optional(),
      }),
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await syncTemplates.update(ctx.userId, updateSyncTemplateSchema.parse(args)))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'delete_sync_template',
    {
      title: 'Delete a sync template',
      description: 'Delete a template. Its tracking items and every existing sync stay as they are.',
      inputSchema: toolInput({ id: z.string() }),
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return mcpJsonResult(await syncTemplates.remove(ctx.userId, id))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'set_sync_template_items',
    {
      title: "Set a template's items",
      description:
        'Replace the whole item list, in order. Not a merge: anything left out is dropped from the template, so read it first with `list_sync_templates`.',
      inputSchema: toolInput({
        templateId: z.string(),
        items: z.array(closedObject({ trackingItemId: z.string(), orderIdx: z.number().int() })),
      }),
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await syncTemplates.setItems(ctx.userId, setSyncTemplateItemsSchema.parse(args)))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )
}
