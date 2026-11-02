import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpCtx } from './types'
import { closedObject, localDay, toolInput } from './fields'
import { mcpErrorFromUnknown, mcpJsonResult } from '../errors'
import {
  addSyncItemSchema,
  removeSyncItemSchema,
  reorderSyncItemsSchema,
  setSyncItemTextSchema,
  uploadAttachmentSchema,
} from '~/lib/api/types'
import { weekOfDay } from '~/lib/week'
import * as attachments from '~/server/services/attachments'
import * as pulse from '~/server/services/pulse'
import * as weeklySync from '~/server/services/weekly-sync'

// The weekly sync and Pulse. A sync is one week's snapshot of tracking items,
// each with its notes and files. Weeks are named by a calendar day the caller
// supplies; see `localDay`.

/** Past this a file is no use in a tool result, and the app is the place to open it. */
const READABLE_BYTES = 5 * 1024 * 1024

export function registerWeeklySyncTools(server: McpServer, ctx: McpCtx): void {
  server.registerTool(
    'get_pulse',
    {
      title: 'Get Pulse',
      description:
        "The daily landing page in one call: this week's sync and how much of it is filled, the upcoming feed (important dates and next bids), open tasks on the month, quarter and year horizons, and the people who need attention. Start here for a daily check-in.",
      inputSchema: toolInput({ day: localDay }),
    },
    async ({ day }) => {
      try {
        return mcpJsonResult(await pulse.get(ctx.userId, day))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'get_weekly_sync',
    {
      title: 'Get a weekly sync',
      description:
        "One week's retrospective: `weeklySync` (null when the week has not been started), its items grouped by goal with notes and attachments, `unscopedItems`, and `allTrackingItems`, the library to add from.",
      inputSchema: toolInput({ day: localDay }),
    },
    async ({ day }) => {
      try {
        return mcpJsonResult(await weeklySync.getWeeklyRetrospectiveData(ctx.userId, weekOfDay(day)))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'create_weekly_sync',
    {
      title: 'Start a weekly sync',
      description:
        'Start the week containing `day`, with the items of `templateId` or of the default template, or empty when there is neither. A week has one sync: if it was already started, that sync comes back unchanged.',
      inputSchema: toolInput({
        day: localDay,
        templateId: z.string().optional().describe('Template to start from. Omit for the default.'),
      }),
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ day, templateId }) => {
      try {
        return mcpJsonResult(await weeklySync.create(ctx.userId, { weekDate: weekOfDay(day), templateId }))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'add_sync_item',
    {
      title: 'Add an item to a sync',
      description: 'Put a tracking item on one week. Adding one that is already there returns it unchanged.',
      inputSchema: toolInput({ weeklySyncId: z.string(), trackingItemId: z.string() }),
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await weeklySync.addItem(ctx.userId, addSyncItemSchema.parse(args)))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'remove_sync_item',
    {
      title: 'Remove an item from a sync',
      description:
        'Take an item off one week, along with its notes and attachments. The tracking item stays in the library.',
      inputSchema: toolInput({ weeklySyncItemId: z.string() }),
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await weeklySync.removeItem(ctx.userId, removeSyncItemSchema.parse(args)))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'set_sync_item_text',
    {
      title: "Write a sync item's notes",
      description:
        "Replace the notes on one item of a sync. It replaces rather than appends, so read the item first when adding to what is there. `weeklySyncItemId` is the item's `id` in `get_weekly_sync` or `get_pulse`, not its `trackingItemId`.",
      inputSchema: toolInput({ weeklySyncItemId: z.string(), textContent: z.string() }),
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await weeklySync.setItemText(ctx.userId, setSyncItemTextSchema.parse(args)))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'reorder_sync_items',
    {
      title: 'Reorder a sync',
      description: 'Set the order of items within one sync. Each `id` is a sync item id.',
      inputSchema: toolInput({
        weeklySyncId: z.string(),
        ordering: z.array(closedObject({ id: z.string(), orderIdx: z.number().int() })),
      }),
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await weeklySync.reorderItems(ctx.userId, reorderSyncItemsSchema.parse(args)))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'get_sync_attachment',
    {
      title: 'Read a sync attachment',
      description:
        'The contents of a file on a sync item: an image as an image, a text file as text. The `url` on an attachment needs a browser session and cannot be fetched from here.',
      inputSchema: toolInput({ id: z.string().describe('Attachment id, from `get_weekly_sync` or `get_pulse`.') }),
    },
    async ({ id }) => {
      try {
        const file = await attachments.read(ctx.userId, id)
        const about = { id: file.id, fileName: file.fileName, fileType: file.fileType, sizeBytes: file.sizeBytes }
        if (file.sizeBytes > READABLE_BYTES) {
          return mcpJsonResult({ ...about, note: 'Too large to read here. Open it in the app.' })
        }
        if (file.mimeType.startsWith('image/')) {
          return {
            content: [
              { type: 'image' as const, data: Buffer.from(file.data).toString('base64'), mimeType: file.mimeType },
              { type: 'text' as const, text: file.fileName },
            ],
          }
        }
        try {
          const text = new TextDecoder('utf-8', { fatal: true }).decode(file.data)
          return mcpJsonResult({ ...about, text })
        } catch {
          return mcpJsonResult({ ...about, note: 'A binary file. Open it in the app.' })
        }
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'upload_sync_attachment',
    {
      title: 'Attach a file to a sync item',
      description: 'Add a file to one item of a sync. `data` is base64, and an image must really be one.',
      inputSchema: toolInput({
        weeklySyncItemId: z.string(),
        fileName: z.string().min(1).max(500),
        fileType: z.enum(['image', 'document', 'video', 'audio', 'other']),
        data: z.string().describe('The file, base64.'),
      }),
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ weeklySyncItemId, ...file }) => {
      try {
        const input = uploadAttachmentSchema.parse({
          ...file,
          parentType: 'weekly_sync_item',
          parentId: weeklySyncItemId,
        })
        return mcpJsonResult(await attachments.upload(ctx.userId, input))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'delete_sync_attachment',
    {
      title: 'Delete a sync attachment',
      description: 'Delete a file from a sync item, bytes included.',
      inputSchema: toolInput({ id: z.string() }),
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return mcpJsonResult(await attachments.remove(ctx.userId, id))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )
}
