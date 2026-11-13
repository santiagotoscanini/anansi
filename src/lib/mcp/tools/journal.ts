import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpCtx } from './types'
import { attachmentResult } from './attachment-result'
import { localDay, MENTIONS, toolInput } from './fields'
import { mcpErrorFromUnknown, mcpJsonResult } from '../errors'
import * as attachments from '~/server/services/attachments'
import * as journal from '~/server/services/journal'

// The journal: one entry per calendar day, written like a diary. This is the
// surface it was built for: a conversation at the end of the day that ends in
// an entry. So the tools are few and forgiving. A day is named by the caller
// (see `localDay`), an entry is written whole or added to without reading it
// first, and a person can be named by id or just by name.

const content = z.string().max(50_000)
const highlights = z.array(z.string().min(1).max(500)).max(50)

export function registerJournalTools(server: McpServer, ctx: McpCtx): void {
  server.registerTool(
    'get_journal_entry',
    {
      title: 'Read a journal day',
      description:
        "One day of the journal: `content` (the diary text), `highlights` (the day's short list), `mentions` (the people it names) and `attachments` (its pictures and files). Null when nothing was written that day.",
      inputSchema: toolInput({ day: localDay }),
    },
    async ({ day }) => {
      try {
        return mcpJsonResult(await journal.get(ctx.userId, { day }))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'list_journal_entries',
    {
      title: 'List journal entries',
      description:
        'Journal entries, newest day first, each in full. Narrow by a range of days, by `personId` (the days that mention that person: where the user wrote about them), or by `query` (words in the text or the highlights). Days with nothing written are not listed.',
      inputSchema: toolInput({
        from: localDay.optional().describe('First day to include, YYYY-MM-DD.'),
        to: localDay.optional().describe('Last day to include, YYYY-MM-DD.'),
        personId: z.string().optional().describe('Only days that mention this person.'),
        query: z.string().min(1).max(200).optional().describe('Only days whose text contains this.'),
        limit: z.number().int().min(1).max(100).default(30).describe('How many days at most. Default 30.'),
      }),
    },
    async (args) => {
      try {
        return mcpJsonResult(await journal.list(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'write_journal_entry',
    {
      title: 'Write a journal day',
      description: `Write the journal entry of one day, creating it when the day has none. \`content\` is the diary text, in the user's own voice and language, with blank lines between paragraphs; \`highlights\` is the day's short list, one line each. Mention everyone the day was about. A field you pass replaces what the day holds and a field you leave out stays, so to add to a day use \`append_journal_entry\` instead. ${MENTIONS} For an end-of-day reflection, talk the day through first, then write it once.`,
      inputSchema: toolInput({
        day: localDay,
        content: content.optional().describe('The diary text. Replaces the text the day holds.'),
        highlights: highlights.optional().describe("The day's highlights. Replaces the list the day holds."),
      }),
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await journal.write(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'append_journal_entry',
    {
      title: 'Add to a journal day',
      description: `Add to one day of the journal without reading it first, creating the entry when the day has none. \`content\` becomes a new paragraph after the text that is there; each of \`highlights\` joins the end of the list unless it is already on it. Nothing already written is changed. ${MENTIONS}`,
      inputSchema: toolInput({
        day: localDay,
        content: content.optional().describe('A paragraph to add at the end.'),
        highlights: highlights.optional().describe('Highlights to add to the list.'),
      }),
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await journal.append(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'delete_journal_entry',
    {
      title: 'Delete a journal day',
      description: "Delete one day's entry: its text, its highlights and its attachments, bytes included.",
      inputSchema: toolInput({ day: localDay }),
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ day }) => {
      try {
        return mcpJsonResult(await journal.remove(ctx.userId, { day }))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'get_journal_attachment',
    {
      title: 'Read a journal attachment',
      description:
        'The contents of a file on a journal day: an image as an image, a text file as text. The `url` on an attachment needs a browser session and cannot be fetched from here.',
      inputSchema: toolInput({ id: z.string().describe('Attachment id, from `get_journal_entry`.') }),
    },
    async ({ id }) => {
      try {
        return await attachmentResult(ctx.userId, id)
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'upload_journal_attachment',
    {
      title: 'Attach a file to a journal day',
      description:
        'Add a picture or a file to one day of the journal, creating the entry when the day has none. `data` is base64, and an image must really be one.',
      inputSchema: toolInput({
        day: localDay,
        fileName: z.string().min(1).max(500),
        fileType: z.enum(['image', 'document', 'video', 'audio', 'other']),
        data: z.string().describe('The file, base64.'),
      }),
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await journal.uploadAttachment(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'delete_journal_attachment',
    {
      title: 'Delete a journal attachment',
      description: 'Delete a file from a journal day, bytes included.',
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
