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
export function tickTickContent(body: string, link: string | null): string {
  return [body.trim(), link ? `Captured in Anansi: ${link}` : ''].filter(Boolean).join('\n\n')
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
