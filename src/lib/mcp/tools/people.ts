import 'server-only'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpCtx } from './types'
import { mcpErrorFromUnknown, mcpJsonResult } from '../errors'
import { createPersonSchema } from '~/lib/api/types'
import * as people from '~/server/services/people'

// People = personal CRM (a reflection surface, not a contact manager). Every
// person has a `category` (board column) and a set of optional reflection
// prompts. The DB accepts URLs for `emoji` (photo uploads) but for MCP we
// reject URLs — the LLM can't construct a valid Supabase Storage URL anyway.

const emojiGlyph = z
  .string()
  .regex(/^\S{1,8}$/u, 'emoji glyph only — 1-8 non-whitespace characters')
  .optional()
const category = z.enum(['to_process', 'exploring', 'long_term', 'context_bound'])

export function registerPeopleTools(server: McpServer, ctx: McpCtx): void {
  server.registerTool(
    'list_people',
    {
      title: 'List people',
      description: 'Directory of every person the user tracks, with their categories and group memberships.',
      inputSchema: {
        includeArchived: z.boolean().default(false).describe('Include archived people. Default false.'),
      },
    },
    async ({ includeArchived }) => {
      try {
        return mcpJsonResult(await people.list(ctx.userId, { includeArchived }))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'get_person',
    {
      title: 'Get a person',
      description: 'Full record for one person — reflection prompts, category, groups.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      try {
        return mcpJsonResult(await people.getById(ctx.userId, id))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'create_person',
    {
      title: 'Create a person',
      description:
        'Add someone to the CRM. `category` is required: to_process (newly captured), exploring (decision pending), long_term (committed), or context_bound (situational ties like coworkers).',
      inputSchema: {
        name: z.string().min(1),
        emoji: emojiGlyph,
        category,
        boardOrder: z.number().int().optional(),
        appreciation: z.string().optional().describe('Things you appreciate about this person.'),
        myNeeds: z.string().optional().describe('Your unspoken needs in this relationship.'),
        legacyMessage: z.string().optional().describe('Unfinished business — repair, release, end.'),
        selfReflection: z.string().optional().describe('What this person teaches you about yourself.'),
        decideBy: z.coerce.date().optional().describe('Decision deadline (exploring column only).'),
        groupIds: z.array(z.string()).optional(),
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
        return mcpJsonResult(await people.create(ctx.userId, createPersonSchema.parse(args)))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'update_person',
    {
      title: 'Update a person',
      description:
        "Patch a person's fields. `groupIds` REPLACES the group set if passed; omit to leave alone. Use null on `decideBy` to clear it.",
      inputSchema: {
        id: z.string(),
        name: z.string().min(1).optional(),
        emoji: emojiGlyph,
        category: category.optional(),
        boardOrder: z.number().int().optional(),
        appreciation: z.string().nullable().optional(),
        myNeeds: z.string().nullable().optional(),
        legacyMessage: z.string().nullable().optional(),
        selfReflection: z.string().nullable().optional(),
        decideBy: z.coerce.date().nullable().optional(),
        groupIds: z.array(z.string()).optional(),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await people.update(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'archive_person',
    {
      title: 'Archive a person',
      description:
        'Soft-archive a person. They drop out of the active directory but their data stays intact. Prefer this over `delete_person`.',
      inputSchema: { id: z.string() },
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return mcpJsonResult(await people.archive(ctx.userId, id))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'unarchive_person',
    {
      title: 'Unarchive a person',
      description: 'Restore a previously archived person to the active directory.',
      inputSchema: { id: z.string() },
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return mcpJsonResult(await people.unarchive(ctx.userId, id))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'set_person_category',
    {
      title: 'Move a person between board columns',
      description:
        'Lightweight alternative to `update_person` when you only need to change the category (and optionally the order within the column).',
      inputSchema: {
        id: z.string(),
        category,
        boardOrder: z.number().int().optional(),
      },
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await people.setCategory(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'list_person_tasks',
    {
      title: "Tasks I'm relying on this person for",
      description:
        "Return every task where this person is listed as a referent, joined with the parent goal's context. Use to answer 'what am I depending on X for?'",
      inputSchema: { personId: z.string() },
    },
    async ({ personId }) => {
      try {
        return mcpJsonResult(await people.getTasksAsReferent(ctx.userId, personId))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'list_person_bucket_list',
    {
      title: 'Bucket-list items linked to a person',
      description: "Read-only: bucket-list items where this person is one of the 'people I want to do this with'.",
      inputSchema: { personId: z.string() },
    },
    async ({ personId }) => {
      try {
        return mcpJsonResult(await people.getBucketListItemsAsParticipant(ctx.userId, personId))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )
}
