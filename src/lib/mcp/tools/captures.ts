import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpCtx } from './types'
import { toolInput } from './fields'
import { captureIdFrom } from '~/lib/captures'
import { mcpErrorFromUnknown, mcpJsonResult } from '../errors'
import * as captures from '~/server/services/captures'

// Captures: the user's raw inbox of thoughts. Whatever crossed their mind,
// dropped from the phone's Action Button, Siri, the web or here, as text or as
// a voice note (transcribed on the server). Each one is routed once: aimed at an
// open question it became a note on it; otherwise it went to their TickTick
// Inbox (or the captures list picked in Profile) as a task to triage there (or stayed in Anansi when TickTick is not
// connected). These tools are for helping the user go through that inbox.

const STATUS =
  '`new` (not routed yet: kept in Anansi, waiting for its words, or failed with `routeError`), `routed` (became a note on `question`, or a TickTick task, in the captures list or the Inbox), `archived` (dealt with).'

/** Past this a recording is no use in a tool result (base64 makes it a third bigger). */
const AUDIO_BYTES = 8 * 1024 * 1024

export function registerCapturesTools(server: McpServer, ctx: McpCtx): void {
  server.registerTool(
    'list_captures',
    {
      title: 'List captured thoughts',
      description: `The user's raw inbox of thoughts, newest first: ideas, to-dos, questions and voice notes they captured on the go, to help them triage it. Each has \`text\` (for a voice note, its transcript with the user's dictionary applied; null until it has one; \`heard\` is what the transcriber heard before the dictionary), for a voice note \`title\` and \`notes\` (its words tidied by a model, what TickTick got; null when not tidied, \`tidyError\` says why), \`kind\` (text or voice, with \`audioUrl\` and \`durationMs\`), \`transcriptStatus\` (a voice note's words: \`pending\` while the server transcribes it, retried on its own when the transcriber is down, with \`transcribeAttempts\` and \`transcribeError\`; \`done\`; \`failed\` when the transcriber refused the audio, see \`retranscribe_capture\`; \`none\` for typed text), \`capturedAt\`, \`status\` (${STATUS}) and where it went: \`questionId\`/\`question\` and \`noteId\` for an open question, \`tickTickTaskId\` and \`tickTickListName\` for TickTick. Turn what you find into goals, tasks, journal entries or question notes with the other tools, then archive the capture with \`update_capture\`.`,
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
    'get_capture',
    {
      title: 'Read one capture, with its audio',
      description:
        "Everything about one capture of the user's inbox, by its id or by its Inbox link (`…/app/inbox?capture=<id>`, what its TickTick task links back to): its fields as `list_captures` gives them (`heard` = what the transcriber heard, `text` = that with the user's dictionary applied, `title` + `notes` = the tidied note TickTick got, where it went), `deviceLog` (the phone's recording steps for a voice note: app states, levels, never words) and `audio` (name, type, size). With `includeAudio` (default true) a voice note's recording comes too, as audio content, when it is at most 8 MB (about four minutes); `audioUrl` itself needs a browser session and cannot be fetched from here.",
      inputSchema: toolInput({
        id: z.string().min(1).describe('The capture id, or its Inbox link.'),
        includeAudio: z.boolean().optional().describe('Attach the recording (default true).'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id, includeAudio }) => {
      try {
        const captureId = captureIdFrom(id)
        const capture = await captures.detail(ctx.userId, captureId)
        const result = mcpJsonResult(capture)
        if (includeAudio === false || !capture.audio) return result
        if (capture.audio.sizeBytes > AUDIO_BYTES) {
          return mcpJsonResult({ ...capture, audioNote: 'Too large to attach here. Play it in the app.' })
        }
        const bytes = await captures.readAudio(ctx.userId, captureId)
        if (!bytes) return mcpJsonResult({ ...capture, audioNote: 'The recording is not in storage.' })
        return {
          content: [
            ...result.content,
            { type: 'audio' as const, data: Buffer.from(bytes).toString('base64'), mimeType: capture.audio.mimeType },
          ],
        }
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
        "Drop a thought into the user's inbox, as they would from their phone: an idea, a to-do, something to think about. With `questionId` (from `list_open_questions`) it becomes a dated note on that open question; without it, it goes to TickTick as a task, in the captures list they picked or else their Inbox, (its first line is the title) when TickTick is connected. Use it when the user asks you to note something for later and it is not clearly a task of a goal; answers the capture with where it went.",
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
        "Change one capture of the user's inbox. `status: 'archived'` marks it dealt with (do this after turning it into something else); `'new'` brings an archived one back. `text` replaces its words (on a voice note they are then the user's, and the transcriber never replaces them; the old tidy is dropped unless `title`/`notes` come with it). `title` and `notes` set the tidied note, what its TickTick task and question note show (null clears it, and the words go as they are). Use these to improve a voice note: read it with `get_capture` (the audio, `heard`, `text`), then send the corrected transcript as `text` and a clean `title` and `notes`, in the language it was spoken; if the transcriber keeps mishearing a word, add it with `set_capture_dictionary_entry`. Every change reaches the TickTick task or question note it became. `questionId` moves it to that open question as a note, taking it back from where it went before (its old note or TickTick task is deleted); `questionId: null` takes it out of its question and sends it to TickTick (the captures list, or the Inbox).",
      inputSchema: toolInput({
        id: z.string(),
        status: z.enum(['new', 'routed', 'archived']).optional(),
        text: z
          .string()
          .min(1)
          .max(10_000)
          .optional()
          .describe("The words: a typed thought, or a voice note's transcript."),
        title: z.string().min(1).max(200).nullable().optional().describe("A voice note's tidied title."),
        notes: z
          .string()
          .max(10_000)
          .nullable()
          .optional()
          .describe("A voice note's tidied notes (empty when the title says it all)."),
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

  server.registerTool(
    'retranscribe_capture',
    {
      title: 'Transcribe a voice note again',
      description:
        "Send one voice note of the user's inbox to the transcriber again. Use it on a capture whose `transcriptStatus` is `failed` (the transcriber refused its audio; `transcribeError` says why), or when the user asks for a fresh transcript. The new words replace the current ones when they land, even words the user wrote, and carry on to the TickTick task or question note it became. Answers the capture: `transcriptStatus` is `done` with its `text` when a short note finished within a few seconds, else still `pending` (it finishes in the background).",
      inputSchema: toolInput({ id: z.string() }),
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return mcpJsonResult(await captures.retranscribe(ctx.userId, id))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'list_capture_dictionary',
    {
      title: "List the voice notes' dictionary",
      description:
        'The user\'s dictionary for voice notes: each entry is a phrase the transcriber mishears (`heard`, e.g. "tic tic") and what the user meant (`meant`, e.g. "TickTick"). Every new transcript is corrected with it (whole words, any case), the transcriber is told to expect the meant words, and the model that tidies a note spells them that way.',
      inputSchema: toolInput({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        return mcpJsonResult(await captures.listTerms(ctx.userId))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'set_capture_dictionary_entry',
    {
      title: "Add to the voice notes' dictionary",
      description:
        'Teach the transcription a word: from now on `heard` (what the transcriber writes, e.g. "tic tic") becomes `meant` (e.g. "TickTick") in every new voice note. A phrase already in the dictionary (case aside) gets the new meaning. Notes already transcribed are not changed; `retranscribe_capture` redoes one. Use it when the user points out a name or word the transcripts keep getting wrong.',
      inputSchema: toolInput({
        heard: z.string().min(1).max(100).describe('The phrase as the transcriber writes it.'),
        meant: z.string().min(1).max(100).describe('What it should be.'),
      }),
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input) => {
      try {
        return mcpJsonResult(await captures.saveTerm(ctx.userId, input))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'delete_capture_dictionary_entry',
    {
      title: "Remove from the voice notes' dictionary",
      description:
        "Delete one entry (by `id`, from `list_capture_dictionary`) of the user's dictionary for voice notes.",
      inputSchema: toolInput({ id: z.string() }),
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return mcpJsonResult(await captures.removeTerm(ctx.userId, id))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )
}
