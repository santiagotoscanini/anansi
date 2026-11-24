import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpCtx } from './types'
import { toolInput } from './fields'
import { mcpErrorFromUnknown, mcpJsonResult } from '../errors'
import * as captures from '~/server/services/captures'

// Captures: the user's raw inbox of thoughts. Whatever crossed their mind,
// dropped from the phone's Action Button, Siri, the web or here, as text or as
// a voice note (transcribed on the phone). Each one is routed once: aimed at an
// open question it became a note on it; otherwise it went to their TickTick
// Inbox as a task to triage there (or stayed in Anansi when TickTick is not
// connected). These tools are for helping the user go through that inbox.

const STATUS =
  '`new` (not routed yet: kept in Anansi, waiting for its words, or failed with `routeError`), `routed` (became a note on `question`, or a TickTick Inbox task), `archived` (dealt with).'

export function registerCapturesTools(server: McpServer, ctx: McpCtx): void {
  server.registerTool(
    'list_captures',
    {
      title: 'List captured thoughts',
      description: `The user's raw inbox of thoughts, newest first: ideas, to-dos, questions and voice notes they captured on the go, to help them triage it. Each has \`text\` (for a voice note, its transcript; null while it is being transcribed), \`kind\` (text or voice, with \`audioUrl\` and \`durationMs\`), \`capturedAt\`, \`status\` (${STATUS}) and where it went: \`questionId\`/\`question\` and \`noteId\` for an open question, \`tickTickTaskId\` for TickTick. Turn what you find into goals, tasks, journal entries or question notes with the other tools, then archive the capture with \`update_capture\`.`,
      inputSchema: toolInput({
        status: z.enum(['new', 'routed', 'archived']).optional().describe('Only captures in this state.'),
        limit: z.number().int().min(1).max(500).optional().describe('At most this many (default 100).'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ status, limit }) => {
      try {
        return mcpJsonResult(await captures.list(ctx.userId, { status, limit }))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'capture',
    {
      title: 'Capture a thought',
      description:
        "Drop a thought into the user's inbox, as they would from their phone: an idea, a to-do, something to think about. With `questionId` (from `list_open_questions`) it becomes a dated note on that open question; without it, it goes to their TickTick Inbox as a task (its first line is the title) when TickTick is connected. Use it when the user asks you to note something for later and it is not clearly a task of a goal; answers the capture with where it went.",
      inputSchema: toolInput({
        text: z.string().min(1).max(10_000).describe('The thought, as the user said it. The first line is its title.'),
        questionId: z.string().optional().describe('The open question it belongs to.'),
      }),
      annotations: { destructiveHint: false, openWorldHint: true },
    },
    async ({ text, questionId }) => {
      try {
        return mcpJsonResult(await captures.create(ctx.userId, { text, questionId: questionId ?? null, source: 'mcp' }))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'update_capture',
    {
      title: 'Archive, edit or move a capture',
      description:
        "Change one capture of the user's inbox. `status: 'archived'` marks it dealt with (do this after turning it into something else); `'new'` brings an archived one back. `text` replaces its words (also on the question note or TickTick task it became). `questionId` moves it to that open question as a note, taking it back from where it went before (its old note or TickTick task is deleted); `questionId: null` takes it out of its question and sends it to the TickTick Inbox.",
      inputSchema: toolInput({
        id: z.string(),
        status: z.enum(['new', 'routed', 'archived']).optional(),
        text: z.string().min(1).max(10_000).optional(),
        questionId: z.string().nullable().optional(),
      }),
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (input) => {
      try {
        return mcpJsonResult(await captures.update(ctx.userId, input))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'delete_capture',
    {
      title: 'Delete a capture',
      description:
        'Delete a capture for good, with its audio. Where it went stays (the note on the question, the TickTick task). Prefer archiving (`update_capture`) for one that was dealt with; delete only what should not have been captured.',
      inputSchema: toolInput({ id: z.string() }),
      annotations: { destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return mcpJsonResult(await captures.remove(ctx.userId, id))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )
}
