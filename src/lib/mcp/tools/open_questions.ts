import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpCtx } from './types'
import { MENTIONS, toolInput } from './fields'
import { mcpErrorFromUnknown, mcpJsonResult } from '../errors'
import * as openQuestions from '~/server/services/open-questions'

// Open questions: the life questions the user is living with ("Why do I want to
// be a founder?", "Why do I want to be a dad?", "What do I look for in a
// partner?"). Thinking accumulates as dated notes; when one settles, the answer
// is written down. These tools are meant for working through a question with
// the user in conversation: read it, add what they said today as a note, and
// settle it when they arrive somewhere.

const goalIds = z
  .array(z.string())
  .describe('Ids of the goals this question touches (from `list_goals`). Replaces the whole set.')
const personIds = z
  .array(z.string())
  .describe('Ids of the people this question touches (from `list_people`). Replaces the whole set.')

export function registerOpenQuestionsTools(server: McpServer, ctx: McpCtx): void {
  server.registerTool(
    'list_open_questions',
    {
      title: 'List open questions',
      description:
        'The life questions the user is living with: open ones first, then settled ones (with their `answer`). Each carries `context` (why it matters now), its `notes` (dated thinking, newest first), and the `goalIds` / `personIds` it links. Read this before talking a question through, so you build on what the user already thought.',
      inputSchema: toolInput({
        status: z.enum(['open', 'settled']).optional().describe('Only open or only settled questions.'),
      }),
    },
    async ({ status }) => {
      try {
        return mcpJsonResult(await openQuestions.list(ctx.userId, { status }))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'create_open_question',
    {
      title: 'Create an open question',
      description:
        'Start a question the user is living with. Phrase `question` the way they would ask it themselves. `context` is why it matters now, in a sentence or two.',
      inputSchema: toolInput({
        question: z.string().min(1).max(500),
        context: z.string().max(10_000).optional(),
        goalIds: goalIds.optional(),
        personIds: personIds.optional(),
      }),
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await openQuestions.create(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'update_open_question',
    {
      title: 'Update an open question',
      description:
        'Reword a question, change its context or answer, or relink it. Pass only what changes; null clears `context` or `answer`. To settle it use `settle_open_question`; to add thinking use `add_open_question_note`.',
      inputSchema: toolInput({
        id: z.string(),
        question: z.string().min(1).max(500).optional(),
        context: z.string().max(10_000).nullable().optional(),
        answer: z.string().max(10_000).nullable().optional(),
        goalIds: goalIds.optional(),
        personIds: personIds.optional(),
      }),
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await openQuestions.update(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'add_open_question_note',
    {
      title: 'Add a note to an open question',
      description: `Record a dated thought on a question: what the user said or realised today, in their words. Notes are the question's history, so add one rather than rewriting an old one. ${MENTIONS}`,
      inputSchema: toolInput({
        questionId: z.string(),
        content: z.string().min(1).max(10_000),
      }),
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await openQuestions.addNote(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'update_open_question_note',
    {
      title: 'Edit a note on an open question',
      description: `Replace the text of one note (to fix it, not to add new thinking: use \`add_open_question_note\` for that). ${MENTIONS}`,
      inputSchema: toolInput({
        id: z.string(),
        content: z.string().min(1).max(10_000),
      }),
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await openQuestions.updateNote(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'delete_open_question_note',
    {
      title: 'Delete a note from an open question',
      description: 'Remove one note for good. Confirm with the user.',
      inputSchema: toolInput({ id: z.string() }),
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return mcpJsonResult(await openQuestions.removeNote(ctx.userId, id))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'settle_open_question',
    {
      title: 'Settle an open question',
      description:
        'Mark a question settled and write down the answer the user arrived at, in their words. The notes stay as the path that led there. Only when the user says they have an answer.',
      inputSchema: toolInput({
        id: z.string(),
        answer: z.string().min(1).max(10_000),
      }),
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await openQuestions.settle(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'reopen_open_question',
    {
      title: 'Reopen a settled question',
      description: 'Open a settled question again. Its answer stays, as what the user once thought.',
      inputSchema: toolInput({ id: z.string() }),
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return mcpJsonResult(await openQuestions.reopen(ctx.userId, id))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'delete_open_question',
    {
      title: 'Delete an open question',
      description:
        'Delete a question with all its notes, for good. Prefer settling a question the user has answered. Confirm with the user.',
      inputSchema: toolInput({ id: z.string() }),
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return mcpJsonResult(await openQuestions.remove(ctx.userId, id))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )
}
