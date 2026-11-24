// Captures: whatever was on the user's mind, dropped without friction from the
// phone's Action Button, Siri, the web's Inbox or Claude, as text or as a voice
// note. Every capture is kept here and shown in the Inbox tab, and routed once:
//
//   - aimed at an open question (`questionId`): once it has words, it becomes a
//     dated note on that question (`noteId`);
//   - anything else: a task in TickTick (`tickTickTaskId`), when it is
//     connected, to triage there: in the captures list the user picked
//     (`ticktick_connections.capture_project_id`), else in their Inbox. It is
//     not an Anansi task and has no `ticktick_links` row; the sync never sees
//     it. A picked list that is gone sends it, and the ones after, to the Inbox.
//   - TickTick not connected: it stays `new`, in Anansi's Inbox.
//
// A voice note's words come from the server: the box's Whisper, through the
// gateway (src/server/transcribe.ts). The audio is stored first and the note
// marked `pending`; a worker in this process transcribes one note at a time
// (the GPU is shared), reading the bytes back from the bucket. A transcriber
// that cannot be reached leaves the note pending and a sweep tries again later
// (1, 2, 5, 15, 60 minutes, then hourly: `transcribeBackoffMs`); one that
// refuses the audio marks it `failed`, retried only on request
// (`retranscribe`). Words the user wrote (`setTranscript` from the phone,
// `update` with `text`) are theirs: a late server result never replaces them.
// Until a note has words it waits; after `VOICE_TRANSCRIPT_WAIT_MS` without
// them it goes to TickTick as "🎙 Voice note (captured …)" and the words, when
// they come, rename it.
//
// Routing never throws to the caller: a failure is kept in `routeError` and
// tried again by the TickTick poller (runner.ts) or a Retry. Each capture is
// routed by one call at a time (`route` chains them), so a create racing its
// transcript cannot send it twice.
import { and, desc, eq, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm'
import { db } from '~/lib/data'
import { captures, files, openQuestions, tickTickConnections } from '~/lib/data/schema'
import { tickTickEnabled, transcriptionEnabled } from '~/lib/env'
import {
  afterTranscribeAttempt,
  takesServerTranscript,
  type TranscriptSource,
  captureBody,
  captureTitle,
  MAX_VOICE_CAPTURE_BYTES,
  tickTickContent,
  VOICE_TRANSCRIPT_WAIT_MS,
  voiceNoteTitle,
} from '~/lib/captures'
import {
  captureTranscriptSchema,
  createCaptureSchema,
  listCapturesSchema,
  updateCaptureSchema,
  type CreateCapture,
  type ListCaptures,
  type UpdateCapture,
} from '~/lib/api/types'
import { checkRateLimit } from '~/lib/rate-limit'
import { tickTick, TickTickAuthError } from '~/server/ticktick/client'
import { openToken } from '~/server/ticktick/crypto'
import { transcribe, TranscriberRejected } from '~/server/transcribe'
import { AppError } from './errors'
import { fileUrl } from './file-refs'
import { deleteFiles, discardFiles, readFile, saveFileFromPath } from './files'
import * as openQuestionsService from './open-questions'

type CaptureRow = typeof captures.$inferSelect

/** How long a write waits for its routing before it answers (the routing goes on regardless). */
const ROUTE_WAIT_MS = 8_000

function limitRate(userId: string) {
  const rl = checkRateLimit('captures.create', `user:${userId}`, { limit: 60, windowMs: 60_000 })
  if (!rl.allowed) throw new AppError('TOO_MANY_REQUESTS', 'Too many captures, slow down')
}

async function owned(userId: string, id: string): Promise<CaptureRow> {
  const [row] = await db
    .select()
    .from(captures)
    .where(and(eq(captures.id, id), eq(captures.userId, userId)))
    .limit(1)
  if (!row) throw new AppError('NOT_FOUND', 'Capture not found or access denied')
  return row
}

async function assertQuestion(userId: string, questionId: string) {
  const [row] = await db
    .select({ id: openQuestions.id })
    .from(openQuestions)
    .where(and(eq(openQuestions.id, questionId), eq(openQuestions.userId, userId)))
    .limit(1)
  if (!row) throw new AppError('BAD_REQUEST', `No open question has the id ${questionId}.`)
}

/** The public origin, for the link back from TickTick. Null when the server does not know it. */
function publicOrigin(): string | null {
  for (const value of [process.env.APP_PUBLIC_URL, process.env.TICKTICK_REDIRECT_URI]) {
    try {
      if (value) return new URL(value).origin
    } catch {
      // not a URL: try the next one
    }
  }
  return null
}

const captureLink = (id: string) => {
  const origin = publicOrigin()
  return origin ? `${origin}/app/inbox?capture=${encodeURIComponent(id)}` : null
}

const selectCapture = {
  id: captures.id,
  kind: captures.kind,
  text: captures.text,
  fileId: captures.fileId,
  durationMs: captures.durationMs,
  questionId: captures.questionId,
  question: openQuestions.question,
  noteId: captures.noteId,
  tickTickTaskId: captures.tickTickTaskId,
  status: captures.status,
  routeError: captures.routeError,
  routedAt: captures.routedAt,
  source: captures.source,
  capturedAt: captures.capturedAt,
  transcriptStatus: captures.transcriptStatus,
  transcribeAttempts: captures.transcribeAttempts,
  transcribeError: captures.transcribeError,
  transcribedAt: captures.transcribedAt,
  transcriptSource: captures.transcriptSource,
  createdAt: captures.createdAt,
  updatedAt: captures.updatedAt,
}

const selectCaptures = () =>
  db.select(selectCapture).from(captures).leftJoin(openQuestions, eq(captures.questionId, openQuestions.id))

type Selected = Awaited<ReturnType<typeof selectCaptures>>[number]

function shape(row: Selected) {
  const { fileId, ...rest } = row
  return { ...rest, audioUrl: fileId ? fileUrl(fileId) : null }
}

export type Capture = ReturnType<typeof shape>

/** Newest first, with the audio's URL and the question's text. */
export async function list(userId: string, input?: ListCaptures) {
  const data = listCapturesSchema.parse(input ?? {})
  const rows = await selectCaptures()
    .where(
      data.status ? and(eq(captures.userId, userId), eq(captures.status, data.status)) : eq(captures.userId, userId),
    )
    .orderBy(desc(captures.capturedAt), desc(captures.createdAt))
    .limit(data.limit ?? 100)
  return rows.map(shape)
}

export async function get(userId: string, id: string) {
  const [row] = await selectCaptures()
    .where(and(eq(captures.id, id), eq(captures.userId, userId)))
    .limit(1)
  if (!row) throw new AppError('NOT_FOUND', 'Capture not found or access denied')
  return shape(row)
}

/**
 * Route it, waiting a little so the answer can say where it went, then answer
 * the capture. `words` is a transcription under way: a short note's words often
 * land within the wait, and its routing follows them.
 */
async function settle(userId: string, id: string, words?: Promise<void>) {
  const work = (async () => {
    await route(id)
    if (words) await words
  })()
  await Promise.race([work, new Promise((r) => setTimeout(r, ROUTE_WAIT_MS).unref?.())])
  return await get(userId, id)
}

/** A typed thought. */
export async function create(userId: string, input: CreateCapture) {
  const data = createCaptureSchema.parse(input)
  limitRate(userId)
  if (data.questionId) await assertQuestion(userId, data.questionId)
  const [row] = await db
    .insert(captures)
    .values({
      userId,
      kind: 'text',
      text: data.text,
      questionId: data.questionId ?? null,
      source: data.source,
      // Stamped here when the device sent none: the column default is the
      // database's clock, which writes local time, and would sort apart from
      // the instants the app writes.
      capturedAt: data.capturedAt ?? new Date(),
    })
    .returning({ id: captures.id })
  return await settle(userId, row!.id)
}

export interface VoiceCaptureInput {
  questionId?: string | null
  capturedAt?: Date
  durationMs?: number | null
  /** When the phone already has the words (builds that transcribed on the device). */
  transcript?: string | null
  source: 'phone' | 'web' | 'mcp'
  fileName: string
  /** `audio/*`, as the uploader named it. */
  mimeType: string
  /** Where the bytes are on disk; the caller removes it. */
  path: string
  sizeBytes: number
}

/** A voice note: the audio, streamed to the bucket, and its words when they are known. */
export async function createVoice(userId: string, input: VoiceCaptureInput) {
  limitRate(userId)
  if (!/^audio\/[\w.+-]+$/.test(input.mimeType)) {
    throw new AppError('BAD_REQUEST', 'A voice note needs an audio/* Content-Type')
  }
  if (input.sizeBytes <= 0) throw new AppError('BAD_REQUEST', 'Empty upload')
  if (input.sizeBytes > MAX_VOICE_CAPTURE_BYTES) {
    throw new AppError('BAD_REQUEST', `A voice note is at most ${MAX_VOICE_CAPTURE_BYTES} bytes`)
  }
  if (input.questionId) await assertQuestion(userId, input.questionId)
  const transcript = input.transcript == null ? null : input.transcript.trim().slice(0, 20_000)

  const file = await saveFileFromPath(userId, {
    fileName: input.fileName,
    mimeType: input.mimeType,
    path: input.path,
    sizeBytes: input.sizeBytes,
  })
  let id: string
  try {
    const [row] = await db
      .insert(captures)
      .values({
        userId,
        kind: 'voice',
        text: transcript,
        fileId: file.id,
        durationMs: input.durationMs ?? null,
        questionId: input.questionId ?? null,
        source: input.source,
        capturedAt: input.capturedAt ?? new Date(),
        ...(transcript === null
          ? { transcriptStatus: 'pending' as const }
          : { transcriptStatus: 'done' as const, transcriptSource: 'phone' as const, transcribedAt: new Date() }),
      })
      .returning({ id: captures.id })
    id = row!.id
  } catch (err) {
    await discardFiles([file.id])
    throw err
  }
  return await settle(userId, id, transcript === null ? transcribeSoon(id) : undefined)
}

/**
 * A voice note's words, written by the user (the phone's correction): theirs
 * from now on, never replaced by the transcriber. Empty means no words.
 */
export async function setTranscript(userId: string, input: { id: string; transcript: string }) {
  const data = captureTranscriptSchema.parse(input)
  const row = await owned(userId, data.id)
  if (row.kind !== 'voice') throw new AppError('BAD_REQUEST', 'Only a voice note has a transcript')
  await storeWords(row, data.transcript.trim(), 'user')
  return await settle(userId, row.id)
}

/**
 * Stores a voice note's words and carries them to where the note went (its
 * TickTick task, its question's note). The server's words land only on a note
 * still waiting for them; answers whether they landed.
 */
async function storeWords(row: CaptureRow, text: string, source: TranscriptSource): Promise<boolean> {
  const set = {
    text,
    transcriptStatus: 'done' as const,
    transcriptSource: source,
    transcribedAt: new Date(),
    transcribeError: null,
    transcribeAfter: null,
  }
  if (source === 'server') {
    const landed = await db
      .update(captures)
      .set(set)
      .where(
        and(
          eq(captures.id, row.id),
          eq(captures.transcriptStatus, 'pending'),
          or(isNull(captures.transcriptSource), ne(captures.transcriptSource, 'user')),
        ),
      )
      .returning({ id: captures.id })
    if (!landed.length) return false
  } else {
    await db.update(captures).set(set).where(eq(captures.id, row.id))
  }
  if (text) {
    // Sent on without its words: the TickTick task takes them now.
    if (row.tickTickTaskId) await renameTickTickTask(row.userId, { ...row, text })
    if (row.noteId && text !== row.text) {
      await openQuestionsService.updateNote(row.userId, { id: row.noteId, content: text }).catch((e: unknown) => {
        if (!(e instanceof AppError && e.code === 'NOT_FOUND')) throw e
      })
    }
  }
  return true
}

/** Archive or restore, edit the text, or move it to another question (or out of one, to TickTick). */
export async function update(userId: string, input: UpdateCapture) {
  const data = updateCaptureSchema.parse(input)
  let row = await owned(userId, data.id)

  if (data.text !== undefined && data.text !== row.text) {
    if (row.noteId) {
      await openQuestionsService.updateNote(userId, { id: row.noteId, content: data.text }).catch((e: unknown) => {
        // The note was deleted on its own: the capture keeps its text anyway.
        if (!(e instanceof AppError && e.code === 'NOT_FOUND')) throw e
      })
    }
    // A voice note's words edited by hand are the user's: the transcriber leaves them alone.
    await db
      .update(captures)
      .set(
        row.kind === 'voice'
          ? {
              text: data.text,
              transcriptStatus: 'done',
              transcriptSource: 'user',
              transcribedAt: new Date(),
              transcribeError: null,
              transcribeAfter: null,
            }
          : { text: data.text },
      )
      .where(eq(captures.id, row.id))
    row = { ...row, text: data.text }
    if (row.tickTickTaskId) await renameTickTickTask(userId, row)
  }

  if (data.questionId !== undefined && data.questionId !== row.questionId) {
    if (data.questionId) await assertQuestion(userId, data.questionId)
    // Moving: where it went before is undone, then it is routed afresh.
    await undoDestination(userId, row)
    await db
      .update(captures)
      .set({
        questionId: data.questionId,
        noteId: null,
        tickTickTaskId: null,
        tickTickProjectId: null,
        routeError: null,
        routedAt: null,
        status: row.status === 'archived' ? 'archived' : 'new',
      })
      .where(eq(captures.id, row.id))
    row = await owned(userId, row.id)
  }

  if (data.status !== undefined) {
    const status = data.status === 'archived' ? 'archived' : row.noteId || row.tickTickTaskId ? 'routed' : 'new'
    if (status !== row.status) await db.update(captures).set({ status }).where(eq(captures.id, row.id))
  }

  return await settle(userId, row.id)
}

/** Try routing it again now (the Inbox's Retry). */
export async function retry(userId: string, id: string) {
  const row = await owned(userId, id)
  return await settle(userId, row.id)
}

/**
 * Transcribe a voice note again (the Inbox's "Try again" on a failed one, or a
 * fresh pass over any). Its current words stay until the new ones land, which
 * replace them, even words the user wrote: asking for this is the user's choice.
 */
export async function retranscribe(userId: string, id: string) {
  const row = await owned(userId, id)
  if (row.kind !== 'voice') throw new AppError('BAD_REQUEST', 'Only a voice note can be transcribed')
  if (!row.fileId) throw new AppError('BAD_REQUEST', 'This voice note has no audio any more')
  if (!transcriptionEnabled) throw new AppError('BAD_REQUEST', 'Transcription is not configured on this server')
  await db
    .update(captures)
    .set({
      transcriptStatus: 'pending',
      transcriptSource: null,
      transcribeAttempts: 0,
      transcribeError: null,
      transcribeAfter: null,
    })
    .where(eq(captures.id, row.id))
  return await settle(userId, row.id, transcribeSoon(row.id))
}

/**
 * Deletes the capture and its audio. Where it went stays: the note on the
 * question and the TickTick task are the user's now.
 */
export async function remove(userId: string, id: string) {
  const row = await owned(userId, id)
  await db.delete(captures).where(eq(captures.id, row.id))
  if (row.fileId) await deleteFiles([row.fileId])
  return { success: true }
}

// ── Routing ─────────────────────────────────────────────────────────────────

const inFlight = new Map<string, Promise<void>>()

/**
 * Send the capture where it goes, if it has not gone yet. Idempotent, one call
 * per capture at a time, and never throws: a failure is kept in `routeError`.
 */
export function route(id: string): Promise<void> {
  const previous = inFlight.get(id) ?? Promise.resolve()
  const next = previous
    .then(() => routeNow(id))
    .catch((e: unknown) => console.error('[captures] route failed', id, e instanceof Error ? e.message : e))
    .finally(() => {
      if (inFlight.get(id) === next) inFlight.delete(id)
    })
  inFlight.set(id, next)
  return next
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500)

async function routeNow(id: string) {
  const [row] = await db
    .select({
      capture: captures,
      // Compared on the database's own clock, which stamped `created_at`.
      waited: sql<boolean>`now() - ${captures.createdAt} > ${`${VOICE_TRANSCRIPT_WAIT_MS / 1000} seconds`}::interval`,
    })
    .from(captures)
    .where(eq(captures.id, id))
    .limit(1)
  if (row?.capture.status !== 'new') return
  const c = row.capture

  if (c.questionId) {
    // A note needs words: a voice note waits for its transcript.
    if (c.text === null) return
    const content = c.text || voiceNoteTitle(c.capturedAt, 'UTC')
    try {
      const note = await openQuestionsService.addNote(c.userId, { questionId: c.questionId, content })
      await db
        .update(captures)
        .set({ noteId: note.id, status: 'routed', routedAt: new Date(), routeError: null })
        .where(and(eq(captures.id, c.id), eq(captures.status, 'new')))
    } catch (e) {
      await db
        .update(captures)
        .set({ routeError: errorText(e) })
        .where(eq(captures.id, c.id))
    }
    return
  }

  if (!tickTickEnabled) return
  const [conn] = await db.select().from(tickTickConnections).where(eq(tickTickConnections.userId, c.userId)).limit(1)
  const token = conn && !conn.needsReauth ? openToken(conn.accessToken) : null
  // Not connected: it stays in Anansi's Inbox, without an old error from when it was.
  if (!conn || !token) {
    if (c.routeError) await db.update(captures).set({ routeError: null }).where(eq(captures.id, c.id))
    return
  }
  if (c.text === null && !row.waited) return

  const words = c.text ?? ''
  const title = captureTitle(words) || voiceNoteTitle(c.capturedAt, conn.timeZone)
  const content = tickTickContent(words.trim() ? captureBody(words) : '', captureLink(c.id))
  try {
    const task = await createCaptureTask(tickTick(token), conn, { title, content, tags: ['anansi'] })
    await db
      .update(captures)
      .set({
        tickTickTaskId: task.id,
        tickTickProjectId: task.projectId,
        status: 'routed',
        routedAt: new Date(),
        routeError: null,
      })
      .where(eq(captures.id, c.id))
  } catch (e) {
    if (e instanceof TickTickAuthError) {
      await db
        .update(tickTickConnections)
        .set({ needsReauth: true, lastError: e.message })
        .where(eq(tickTickConnections.id, conn.id))
    }
    await db
      .update(captures)
      .set({ routeError: errorText(e) })
      .where(eq(captures.id, c.id))
  }
}

/**
 * The capture's TickTick task: in the captures list, or the Inbox when none is
 * picked. When the list's create fails and the list is no longer among the
 * user's, the setting goes back to the Inbox and the task goes there.
 */
async function createCaptureTask(
  tt: ReturnType<typeof tickTick>,
  conn: typeof tickTickConnections.$inferSelect,
  task: { title: string; content: string; tags: string[] },
) {
  if (!conn.captureProjectId) return tt.createInboxTask(task)
  try {
    return await tt.createTask({ ...task, projectId: conn.captureProjectId })
  } catch (e) {
    if (e instanceof TickTickAuthError) throw e
    const lists = await tt.listProjects()
    if (lists.some((p) => p.id === conn.captureProjectId && !p.closed)) throw e
    console.warn('[captures] the captures list is gone; back to the Inbox', conn.captureProjectId)
    await db
      .update(tickTickConnections)
      .set({ captureProjectId: null, captureProjectName: null })
      .where(eq(tickTickConnections.id, conn.id))
    return tt.createInboxTask(task)
  }
}

async function connectedClient(userId: string) {
  if (!tickTickEnabled) return null
  const [conn] = await db.select().from(tickTickConnections).where(eq(tickTickConnections.userId, userId)).limit(1)
  const token = conn && !conn.needsReauth ? openToken(conn.accessToken) : null
  return token ? tickTick(token) : null
}

/** The capture's TickTick task takes its current words. Best effort: TickTick is the user's to edit too. */
async function renameTickTickTask(userId: string, row: CaptureRow) {
  if (!row.tickTickTaskId || !row.tickTickProjectId || !row.text) return
  try {
    const tt = await connectedClient(userId)
    await tt?.updateTask({
      id: row.tickTickTaskId,
      projectId: row.tickTickProjectId,
      title: captureTitle(row.text),
      content: tickTickContent(captureBody(row.text), captureLink(row.id)),
    })
  } catch (e) {
    console.warn('[captures] could not rename the TickTick task', row.id, errorText(e))
  }
}

/** Where a capture went is taken back before it moves: its note is deleted, its TickTick task too. */
async function undoDestination(userId: string, row: CaptureRow) {
  if (row.noteId) {
    await openQuestionsService.removeNote(userId, row.noteId).catch(() => undefined)
  }
  if (row.tickTickTaskId && row.tickTickProjectId) {
    try {
      const tt = await connectedClient(userId)
      await tt?.deleteTask(row.tickTickProjectId, row.tickTickTaskId)
    } catch (e) {
      console.warn('[captures] could not delete the TickTick task', row.id, errorText(e))
    }
  }
}

/**
 * The poller's share (runner.ts): captures whose routing failed, and voice
 * notes that waited long enough for words that never came. A capture that is
 * simply kept (TickTick not connected) is not one of them.
 */
export async function retryPending(): Promise<void> {
  const rows = await db
    .select({ id: captures.id })
    .from(captures)
    .where(
      and(
        eq(captures.status, 'new'),
        or(
          isNotNull(captures.routeError),
          and(
            eq(captures.kind, 'voice'),
            isNull(captures.text),
            isNull(captures.questionId),
            sql`now() - ${captures.createdAt} > ${`${VOICE_TRANSCRIPT_WAIT_MS / 1000} seconds`}::interval`,
          ),
        ),
      ),
    )
    .orderBy(captures.createdAt)
    .limit(50)
  for (const { id } of rows) await route(id)
}

// ── Transcription ───────────────────────────────────────────────────────────

/** How often the sweep looks for voice notes still waiting for their words. */
const TRANSCRIBE_SWEEP_MS = 60_000

interface TranscribeWorker {
  queue: string[]
  waiting: Map<string, { promise: Promise<void>; resolve: () => void }>
  running: boolean
}

// On globalThis so a dev server's module reload does not start a second worker.
const WORKER = Symbol.for('anansi.captures.transcriber')

function worker(): TranscribeWorker {
  const g = globalThis as { [WORKER]?: TranscribeWorker }
  return (g[WORKER] ??= { queue: [], waiting: new Map(), running: false })
}

/**
 * Queue a voice note for the transcriber. Resolves once it was tried (whatever
 * came of it); a note already queued shares that promise. One note at a time
 * in this process: the GPU behind the gateway is shared.
 */
export function transcribeSoon(id: string): Promise<void> {
  if (!transcriptionEnabled) return Promise.resolve()
  const w = worker()
  const known = w.waiting.get(id)
  if (known) return known.promise
  let resolve!: () => void
  const promise = new Promise<void>((r) => (resolve = r))
  w.waiting.set(id, { promise, resolve })
  w.queue.push(id)
  void pump(w)
  return promise
}

async function pump(w: TranscribeWorker) {
  if (w.running) return
  w.running = true
  try {
    for (let id = w.queue.shift(); id !== undefined; id = w.queue.shift()) {
      try {
        await transcribeNow(id)
      } catch (e) {
        console.error('[captures] transcription failed', id, errorText(e))
      } finally {
        w.waiting.get(id)?.resolve()
        w.waiting.delete(id)
      }
    }
  } finally {
    w.running = false
  }
}

async function transcribeNow(id: string) {
  const [found] = await db
    .select({ capture: captures, fileName: files.fileName, mimeType: files.mimeType })
    .from(captures)
    .leftJoin(files, eq(captures.fileId, files.id))
    .where(eq(captures.id, id))
    .limit(1)
  if (!found || !takesServerTranscript(found.capture)) return
  const c = found.capture

  const record = async (outcome: Parameters<typeof afterTranscribeAttempt>[1]) => {
    await db
      .update(captures)
      .set(afterTranscribeAttempt(c, outcome, new Date()))
      .where(and(eq(captures.id, c.id), eq(captures.transcriptStatus, 'pending')))
  }

  if (!c.fileId || !found.mimeType) return await record({ kind: 'rejected', message: 'The audio is gone' })
  let words: string
  try {
    const bytes = await readFile(c.fileId)
    if (!bytes) return await record({ kind: 'rejected', message: 'The audio is not in storage' })
    const result = await transcribe(bytes, found.fileName ?? 'Voice note.wav', found.mimeType, {
      durationMs: c.durationMs,
    })
    words = result.text
  } catch (e) {
    // Refused: the audio itself (an old m4a). Anything else: the transcriber, the network, the bucket; try later.
    const kind = e instanceof TranscriberRejected ? 'rejected' : 'unavailable'
    console.warn(`[captures] transcription ${kind}`, c.id, errorText(e))
    return await record({ kind, message: errorText(e) })
  }
  if (await storeWords(c, words, 'server')) await route(c.id)
}

/** Voice notes whose words are due another try (or never got a first one: a restart). */
export async function transcribePending(): Promise<void> {
  if (!transcriptionEnabled) return
  const rows = await db
    .select({ id: captures.id })
    .from(captures)
    .where(
      and(
        eq(captures.kind, 'voice'),
        eq(captures.transcriptStatus, 'pending'),
        isNotNull(captures.fileId),
        or(isNull(captures.transcribeAfter), lte(captures.transcribeAfter, new Date())),
      ),
    )
    .orderBy(captures.createdAt)
    .limit(20)
  for (const { id } of rows) void transcribeSoon(id)
}

const SWEEP = Symbol.for('anansi.captures.transcribeSweep')

/**
 * Starts the sweep, for every user and independent of TickTick: started on the
 * first request (src/start.ts) like the TickTick poller. A no-op where the
 * transcriber is not configured.
 */
export function ensureTranscriber(): void {
  if (!transcriptionEnabled) return
  const g = globalThis as { [SWEEP]?: ReturnType<typeof setInterval> }
  if (g[SWEEP]) return
  const sweep = () => {
    transcribePending().catch((e: unknown) => console.error('[captures] transcription sweep failed', errorText(e)))
  }
  const timer = setInterval(sweep, TRANSCRIBE_SWEEP_MS)
  timer.unref?.()
  g[SWEEP] = timer
  sweep()
}
