import 'server-only'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpCtx } from './types'
import { mcpErrorFromUnknown, mcpJsonResult } from '../errors'
import { createBucketListItemSchema } from '~/lib/api/types'
import * as bucketList from '~/server/services/bucket-list'

// Bucket list — things the user wants to do before dying. Flat list; each item
// can link to multiple people ("people I want to do this with").

export function registerBucketListTools(server: McpServer, ctx: McpCtx): void {
  server.registerTool(
    'list_bucket_list',
    {
      title: 'List bucket-list items',
      description: 'All bucket-list items oldest-first, with linked person ids hydrated.',
      inputSchema: {},
    },
    async () => {
      try {
        return mcpJsonResult(await bucketList.list(ctx.userId))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'create_bucket_list_item',
    {
      title: 'Add a bucket-list item',
      description:
        "Capture something the user wants to do. `personIds` links people to this item ('people I want to do this with').",
      inputSchema: {
        content: z.string().min(1).max(500),
        description: z.string().max(2000).optional(),
        personIds: z.array(z.string()).optional(),
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
        return mcpJsonResult(await bucketList.create(ctx.userId, createBucketListItemSchema.parse(args)))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'update_bucket_list_item',
    {
      title: 'Update a bucket-list item',
      description:
        'Edit content/description/people. `personIds` REPLACES the linked-person set if passed; omit to leave alone. `content` is required even on update.',
      inputSchema: {
        id: z.string(),
        content: z.string().min(1).max(500),
        description: z.string().max(2000).nullable().optional(),
        personIds: z.array(z.string()).optional(),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await bucketList.update(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'toggle_bucket_list_done',
    {
      title: 'Mark a bucket-list item done (or undone)',
      description: 'Set or clear the completion timestamp on a bucket-list item.',
      inputSchema: {
        id: z.string(),
        completed: z.boolean(),
      },
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, completed }) => {
      try {
        return mcpJsonResult(await bucketList.toggleCompleted(ctx.userId, { id, completed }))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'delete_bucket_list_item',
    {
      title: 'Delete a bucket-list item',
      description: 'Hard-delete. Confirm with the user before calling.',
      inputSchema: { id: z.string() },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return mcpJsonResult(await bucketList.remove(ctx.userId, id))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )
}
