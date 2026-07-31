import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpCtx } from './types'
import { mcpErrorFromUnknown, mcpJsonResult } from '../errors'
import { createPersonGroupSchema } from '~/lib/api/types'
import * as groups from '~/server/services/groups'

// Groups are cross-entity tags — the same group row tags BOTH people and tasks
// (e.g. "Family" can hold both my partner and the "call mom" task). The DB
// keeps the legacy `person_groups` table name; in the product it's just
// "groups."

export function registerGroupsTools(server: McpServer, ctx: McpCtx): void {
  server.registerTool(
    'list_groups',
    {
      title: 'List groups',
      description: 'All groups the user has defined. Each group can tag people AND tasks.',
      inputSchema: {},
    },
    async () => {
      try {
        return mcpJsonResult(await groups.list(ctx.userId))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'create_group',
    {
      title: 'Create a group',
      description: 'Add a new group. Color is any CSS hex like #f97316.',
      inputSchema: {
        name: z.string().min(1),
        color: z.string().min(1),
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
        return mcpJsonResult(await groups.create(ctx.userId, createPersonGroupSchema.parse(args)))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'update_group',
    {
      title: 'Update a group',
      description: 'Rename, recolor, or reorder a group.',
      inputSchema: {
        id: z.string(),
        name: z.string().min(1).optional(),
        color: z.string().min(1).optional(),
        orderIdx: z.number().int().optional(),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await groups.update(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'delete_group',
    {
      title: 'Delete a group',
      description: 'Remove a group. Cascades to its memberships (people and tasks lose this tag).',
      inputSchema: { id: z.string() },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return mcpJsonResult(await groups.remove(ctx.userId, id))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'list_group_tasks',
    {
      title: 'Tasks in a group',
      description: "Every task tagged with the group, joined with the parent goal's context.",
      inputSchema: { groupId: z.string() },
    },
    async ({ groupId }) => {
      try {
        return mcpJsonResult(await groups.getTasks(ctx.userId, groupId))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )
}
