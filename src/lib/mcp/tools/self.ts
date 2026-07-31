import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpCtx } from './types'
import { mcpErrorFromUnknown, mcpJsonResult } from '../errors'
import * as self from '~/server/services/self'
import * as selfListItems from '~/server/services/self-list-items'

// The Self page is a "living portrait" — prose fields on user_self, plus list
// buckets in self_list_items keyed by `kind`. Empty fields are intentional;
// untouched sections must read as clean pages, not unfinished forms.

const selfListKind = z.enum([
  'energizer',
  'drainer',
  'just_for_me',
  'proud',
  'pattern',
  'trigger',
  'release',
  'year_ahead',
])

const patternCategory = z.enum(['relational', 'self_pattern', 'communication', 'body_state', 'choice'])

export function registerSelfTools(server: McpServer, ctx: McpCtx): void {
  server.registerTool(
    'get_self',
    {
      title: "Get the user's self portrait",
      description: "Return the user's prose Self row (or null if not yet started).",
      inputSchema: {},
    },
    async () => {
      try {
        return mcpJsonResult(await self.get(ctx.userId))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'update_self',
    {
      title: 'Update self portrait',
      description:
        'Partial upsert of prose Self fields. Only the fields you pass get written; omitted fields are untouched. Passing null clears a field.',
      inputSchema: {
        thisYearSelfDescription: z.string().nullable().optional().describe('Who I am this year — a paragraph.'),
        descriptionYear: z
          .number()
          .int()
          .nullable()
          .optional()
          .describe('Calendar year this description was written for.'),
        myStory: z.string().nullable().optional(),
        attachmentTendencies: z.string().nullable().optional(),
        loveLanguageGive: z.string().nullable().optional(),
        loveLanguageReceive: z.string().nullable().optional(),
        apologyLanguage: z.string().nullable().optional(),
        conflictStyle: z.string().nullable().optional(),
        stressResponse: z.string().nullable().optional(),
        noteToFutureSelf: z.string().nullable().optional(),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await self.update(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'list_self_items',
    {
      title: 'List Self list items',
      description:
        'Return every list-shaped Self item across all kinds (energizer, drainer, just_for_me, proud, pattern, trigger, release, year_ahead). Group client-side by `kind`.',
      inputSchema: {},
    },
    async () => {
      try {
        return mcpJsonResult(await selfListItems.list(ctx.userId))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'create_self_item',
    {
      title: 'Add an item to a Self bucket',
      description:
        'Add an entry to one of the Self list buckets. `patternCategory` is required ONLY when `kind = pattern` — server ignores it for other kinds.',
      inputSchema: {
        kind: selfListKind,
        content: z.string().min(1).max(2000),
        patternCategory: patternCategory.optional(),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await selfListItems.create(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'update_self_item',
    {
      title: 'Update a Self list item',
      description: 'Edit content or pattern category of an existing Self item.',
      inputSchema: {
        id: z.string(),
        content: z.string().min(1).max(2000).optional(),
        patternCategory: patternCategory.nullable().optional(),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await selfListItems.update(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'delete_self_item',
    {
      title: 'Delete a Self list item',
      description: 'Remove a Self item entirely.',
      inputSchema: { id: z.string() },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return mcpJsonResult(await selfListItems.remove(ctx.userId, id))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )
}
