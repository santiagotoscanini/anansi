// Captures: the pure rules, shared by the service (what goes to TickTick), the
// Inbox tab (where each one went) and the tests. The phone has the same in
// `Core/Capture.swift`; change the two together.

/** A TickTick title is the capture's first line, at most this long. */
export const CAPTURE_TITLE_MAX = 120

/** A voice note waits this long for its transcript before it is sent on without one. */
export const VOICE_TRANSCRIPT_WAIT_MS = 10 * 60_000

/** The largest voice note the server takes. */
export const MAX_VOICE_CAPTURE_BYTES = 200 * 1024 * 1024

const lines = (text: string) => text.split(/\r?\n/)

/** The first line with something on it, trimmed and cut to `CAPTURE_TITLE_MAX` (with an ellipsis). */
export function captureTitle(text: string): string {
  const first =
    lines(text)
      .find((l) => l.trim() !== '')
      ?.trim() ?? ''
  if (first.length <= CAPTURE_TITLE_MAX) return first
  return `${first.slice(0, CAPTURE_TITLE_MAX - 1).trimEnd()}…`
}

/**
 * Everything after the first line, trimmed: the task's notes. A first line cut
 * short by `captureTitle` is repeated whole here, so nothing is lost.
 */
export function captureBody(text: string): string {
  const all = lines(text)
  const at = all.findIndex((l) => l.trim() !== '')
  if (at < 0) return ''
  const first = all[at]!.trim()
  const rest = all
    .slice(at + 1)
    .join('\n')
    .trim()
  if (first.length <= CAPTURE_TITLE_MAX) return rest
  return rest ? `${first}\n\n${rest}` : first
}

/** "🎙 Voice note (captured 24 Nov, 14:05)", in the user's time zone: a voice note sent on before its words are known. */
export function voiceNoteTitle(capturedAt: Date, timeZone: string): string {
  let when: string
  try {
    when = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(capturedAt)
  } catch {
    when = capturedAt.toISOString().slice(0, 16).replace('T', ' ')
  }
  return `🎙 Voice note (captured ${when})`
}

/** The notes of the TickTick task a capture becomes: its text after the title, then the way back to Anansi. */
export function tickTickContent(body: string, link: string | null, origin: string | null = null): string {
  return [body.trim(), origin ?? '', link ? `Captured in Anansi: ${link}` : ''].filter(Boolean).join('\n\n')
}

const DEVICE_NAMES = { iphone: 'iPhone', watch: 'Apple Watch' } as const

/**
 * "Recorded from my Apple Watch", "Written on my iPhone": the line a capture's
 * TickTick task carries about where it was made. Null for the web and MCP.
 */
export function captureOrigin(kind: 'text' | 'voice', device: keyof typeof DEVICE_NAMES | null): string | null {
  if (!device) return null
  return kind === 'voice' ? `Recorded from my ${DEVICE_NAMES[device]}` : `Written on my ${DEVICE_NAMES[device]}`
}

export type CaptureDestination =
  | { kind: 'question'; questionId: string | null }
  | { kind: 'ticktick' }
  | { kind: 'error'; message: string }
  | { kind: 'transcribing' }
  | { kind: 'kept' }
  | { kind: 'archived' }

/** Where a capture went, or why it is still here: what the Inbox shows on each row. */
export function captureDestination(c: {
  status: 'new' | 'routed' | 'archived'
  kind: 'text' | 'voice'
  text: string | null
  questionId: string | null
  noteId: string | null
  tickTickTaskId: string | null
  routeError: string | null
  /** Left out by callers that predate server transcription (the phone's mirror). */
  transcriptStatus?: 'pending' | 'done' | 'failed' | 'none'
}): CaptureDestination {
  if (c.status === 'archived') return { kind: 'archived' }
  if (c.noteId) return { kind: 'question', questionId: c.questionId }
  if (c.tickTickTaskId) return { kind: 'ticktick' }
  if (c.routeError) return { kind: 'error', message: c.routeError }
  // A note the transcriber refused is kept here; its words line says why.
  if (c.kind === 'voice' && c.text === null && c.transcriptStatus !== 'failed') return { kind: 'transcribing' }
  return { kind: 'kept' }
}

// ── Transcripts ─────────────────────────────────────────────────────────────
// A voice note's words come from the server's transcriber (services/captures.ts).

export type TranscriptStatus = 'pending' | 'done' | 'failed' | 'none'
export type TranscriptSource = 'server' | 'phone' | 'user'

const MINUTE = 60_000

/** How long a pending voice note waits after each attempt the transcriber could not take: 1, 2, 5, 15, 60 minutes, then hourly. */
export const TRANSCRIBE_BACKOFF_MS = [1, 2, 5, 15, 60].map((m) => m * MINUTE)

/** The wait after the `attempts`-th failed attempt (1-based). */
export function transcribeBackoffMs(attempts: number): number {
  if (attempts < 1) return 0
  return TRANSCRIBE_BACKOFF_MS[Math.min(attempts, TRANSCRIBE_BACKOFF_MS.length) - 1]!
}

/** How long one transcription may take: a minute plus twice the audio's length, at most 15 minutes. */
export function transcribeTimeoutMs(durationMs: number | null): number {
  return Math.min(15 * MINUTE, MINUTE + 2 * Math.max(0, durationMs ?? 0))
}

/**
 * May the transcriber's words be stored? Only on a voice note still waiting for
 * them: words the user wrote (or corrected) are never replaced by a late result,
 * and a note that failed or got its words another way is left alone.
 */
export function takesServerTranscript(c: {
  kind: 'text' | 'voice'
  transcriptStatus: TranscriptStatus
  transcriptSource: TranscriptSource | null
}): boolean {
  return c.kind === 'voice' && c.transcriptStatus === 'pending' && c.transcriptSource !== 'user'
}

/** The transcript fields after an attempt, by its outcome. */
export function afterTranscribeAttempt(
  c: { transcribeAttempts: number },
  outcome: { kind: 'unavailable'; message: string } | { kind: 'rejected'; message: string },
  now: Date,
): {
  transcriptStatus: TranscriptStatus
  transcribeAttempts: number
  transcribeError: string
  transcribeAfter: Date | null
} {
  const attempts = c.transcribeAttempts + 1
  if (outcome.kind === 'rejected') {
    return {
      transcriptStatus: 'failed',
      transcribeAttempts: attempts,
      transcribeError: outcome.message,
      transcribeAfter: null,
    }
  }
  return {
    transcriptStatus: 'pending',
    transcribeAttempts: attempts,
    transcribeError: outcome.message,
    transcribeAfter: new Date(now.getTime() + transcribeBackoffMs(attempts)),
  }
}

export type TranscriptView =
  | { kind: 'text'; text: string }
  | { kind: 'empty' }
  | { kind: 'transcribing'; retrying: boolean }
  | { kind: 'failed'; message: string }

/** What the Inbox shows in place of a capture's words. */
export function transcriptView(c: {
  text: string | null
  transcriptStatus: TranscriptStatus
  transcribeAttempts: number
  transcribeError: string | null
}): TranscriptView {
  if (c.text !== null) return c.text === '' ? { kind: 'empty' } : { kind: 'text', text: c.text }
  if (c.transcriptStatus === 'failed') return { kind: 'failed', message: c.transcribeError ?? '' }
  return { kind: 'transcribing', retrying: c.transcribeAttempts > 0 || c.transcribeError !== null }
}

// ── The dictionary ──────────────────────────────────────────────────────────
// The user's corrections for what the transcriber mishears ("tic tic" →
// "TickTick"), stored in `capture_terms`.

export interface CaptureTerm {
  heard: string
  meant: string
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Replaces each heard phrase with what was meant: whole words only, case
 * ignored, and the words of a phrase may come apart or together ("tic tic",
 * "Tic-Tic", "tictic"). Longer phrases first, so "tic tic list" wins over
 * "tic tic". Text with nothing to replace comes back as it was.
 */
export function applyTerms(text: string, terms: readonly CaptureTerm[]): string {
  const usable = terms
    .map((t) => ({
      words: t.heard
        .trim()
        .split(/[\s-]+/)
        .filter(Boolean),
      meant: t.meant.trim(),
    }))
    .filter((t) => t.words.length > 0 && t.meant !== '')
    .sort((a, b) => b.words.join('').length - a.words.join('').length)
  let out = text
  for (const t of usable) {
    const body = t.words.map(escapeRegExp).join('[\\s-]*')
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'giu')
    out = out.replace(pattern, () => t.meant)
  }
  return out
}

/** Whisper's prompt: the words that were meant, as vocabulary it should expect. Short (Whisper reads ~224 tokens). */
export function transcriberPrompt(terms: readonly CaptureTerm[]): string | null {
  const words = [...new Set(terms.map((t) => t.meant.trim()).filter(Boolean))]
  let prompt = ''
  for (const w of words) {
    const next = prompt ? `${prompt}, ${w}` : w
    if (next.length > 600) break
    prompt = next
  }
  return prompt || null
}

// ── Tidying ─────────────────────────────────────────────────────────────────
// A voice note's words made into a title and clean notes by the gateway's
// `smart` model (server/tidy.ts). The transcript stays as it was beside them.

export interface Tidied {
  title: string
  notes: string
}

/** The chat the model is given: what to do, the glossary, then the words. */
type ChatMessage = { role: 'system' | 'user'; content: string }

export function tidyMessages(words: string, terms: readonly CaptureTerm[]): [ChatMessage, ChatMessage] {
  const glossary = terms.length
    ? `\nThe speaker's own names and words (spell them this way): ${terms
        .map((t) => `"${t.heard.trim()}" means "${t.meant.trim()}"`)
        .join('; ')}.`
    : ''
  const system = `You tidy a voice note the user recorded for themselves into a task for their to-do list.
Answer with JSON only: {"title": string, "notes": string}.
- Write in the language the note is in (Spanish stays Spanish, English stays English; a note that mixes them keeps that mix).
- "title": what the note is about or asks for, at most ${TIDY_TITLE_MAX} characters, no ending period, no emoji.
- "notes": everything the note says, cleaned up: no filler words ("eh", "o sea", "like", "um"), no repetitions or false starts, proper punctuation, short paragraphs or a "- " list when it lists things. Keep every fact, name, number and date. Never add, guess or advise anything that was not said. Empty when the title already says it all.
- Fix words the transcriber obviously got wrong only when the meaning is clear.${glossary}`
  return [
    { role: 'system', content: system },
    { role: 'user', content: words },
  ]
}

/** A tidied title is at most this long (TickTick shows about this much). */
export const TIDY_TITLE_MAX = 100

/**
 * The model's answer as a title and notes, or null when it is not usable: its
 * thinking dropped, the JSON object found inside whatever surrounds it, both
 * fields strings, a title that is not empty.
 */
export function parseTidy(answer: string): Tidied | null {
  const text = answer.replace(/<think>[\s\S]*?<\/think>/g, '')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const { title, notes } = parsed as { title?: unknown; notes?: unknown }
  if (typeof title !== 'string') return null
  const oneLine = title.replace(/\s+/g, ' ').trim().replace(/\.$/, '')
  if (!oneLine) return null
  return {
    title: oneLine.length <= TIDY_TITLE_MAX ? oneLine : `${oneLine.slice(0, TIDY_TITLE_MAX - 1).trimEnd()}…`,
    notes: typeof notes === 'string' ? notes.trim() : '',
  }
}

/**
 * A capture's id from what a caller pasted: the id itself, or an Inbox link
 * (`…/app/inbox?capture=<id>`, the one a TickTick task carries back).
 */
export function captureIdFrom(input: string): string {
  const text = input.trim()
  const found = /[?&]capture=([^&#\s]+)/.exec(text)
  if (found) return decodeURIComponent(found[1]!)
  return text
}
