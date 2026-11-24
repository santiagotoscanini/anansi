import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CAPTURE_TITLE_MAX,
  captureBody,
  captureDestination,
  afterTranscribeAttempt,
  captureTitle,
  takesServerTranscript,
  transcribeBackoffMs,
  transcribeTimeoutMs,
  transcriptView,
  tickTickContent,
  voiceNoteTitle,
} from './captures.ts'

test('the title is the first line with something on it', () => {
  assert.equal(captureTitle('Buy milk'), 'Buy milk')
  assert.equal(captureTitle('\n\n  Call mom about Sunday  \nand the cake'), 'Call mom about Sunday')
  assert.equal(captureTitle('   '), '')
})

test('a long first line is cut with an ellipsis, and kept whole in the body', () => {
  const long = 'a'.repeat(200)
  const title = captureTitle(long)
  assert.equal(title.length, CAPTURE_TITLE_MAX)
  assert.ok(title.endsWith('…'))
  assert.equal(captureBody(long), long)
  assert.equal(captureBody(`${long}\nmore`), `${long}\n\nmore`)
})

test('the body is what comes after the first line', () => {
  assert.equal(captureBody('Title\n\n  rest of it\nline two  '), 'rest of it\nline two')
  assert.equal(captureBody('Only a title'), '')
  assert.equal(captureBody(''), '')
})

test('a voice note without words is named by its moment, in the user zone', () => {
  const at = new Date('2026-11-24T17:05:00Z')
  assert.equal(voiceNoteTitle(at, 'America/Montevideo'), '🎙 Voice note (captured 24 Nov, 14:05)')
  assert.equal(voiceNoteTitle(at, 'UTC'), '🎙 Voice note (captured 24 Nov, 17:05)')
  assert.match(voiceNoteTitle(at, 'Not/AZone'), /^🎙 Voice note \(captured 2026-11-24 17:05\)$/)
})

test('the task notes carry the body, then the link back', () => {
  assert.equal(tickTickContent('rest', 'https://x/app/inbox'), 'rest\n\nCaptured in Anansi: https://x/app/inbox')
  assert.equal(tickTickContent('', 'https://x/app/inbox'), 'Captured in Anansi: https://x/app/inbox')
  assert.equal(tickTickContent('rest', null), 'rest')
})

test('where a capture went', () => {
  const base = {
    status: 'new' as const,
    kind: 'text' as const,
    text: 'x',
    questionId: null,
    noteId: null,
    tickTickTaskId: null,
    routeError: null,
  }
  assert.deepEqual(captureDestination(base), { kind: 'kept' })
  assert.deepEqual(captureDestination({ ...base, status: 'routed', questionId: 'q', noteId: 'n' }), {
    kind: 'question',
    questionId: 'q',
  })
  assert.deepEqual(captureDestination({ ...base, status: 'routed', tickTickTaskId: 't' }), { kind: 'ticktick' })
  assert.deepEqual(captureDestination({ ...base, routeError: 'boom' }), { kind: 'error', message: 'boom' })
  assert.deepEqual(captureDestination({ ...base, kind: 'voice', text: null }), { kind: 'transcribing' })
  assert.deepEqual(captureDestination({ ...base, kind: 'voice', text: '' }), { kind: 'kept' })
  assert.deepEqual(captureDestination({ ...base, status: 'archived', tickTickTaskId: 't' }), { kind: 'archived' })
})

const MIN = 60_000

test('a transcriber that is down is tried again after 1, 2, 5, 15, 60 minutes, then hourly', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 9, 40].map((n) => transcribeBackoffMs(n) / MIN),
    [1, 2, 5, 15, 60, 60, 60, 60],
  )
  assert.equal(transcribeBackoffMs(0), 0)
})

test('a transcription may take a minute plus twice the audio, at most 15 minutes', () => {
  assert.equal(transcribeTimeoutMs(null), MIN)
  assert.equal(transcribeTimeoutMs(30_000), 2 * MIN)
  assert.equal(transcribeTimeoutMs(3 * 3_600_000), 15 * MIN)
})

test('unavailable keeps the note pending with the next try scheduled; rejected fails it for good', () => {
  const now = new Date('2026-11-24T12:00:00Z')
  const down = afterTranscribeAttempt({ transcribeAttempts: 2 }, { kind: 'unavailable', message: '503' }, now)
  assert.equal(down.transcriptStatus, 'pending')
  assert.equal(down.transcribeAttempts, 3)
  assert.equal(down.transcribeError, '503')
  assert.equal(down.transcribeAfter?.getTime(), now.getTime() + 5 * MIN)

  const refused = afterTranscribeAttempt({ transcribeAttempts: 0 }, { kind: 'rejected', message: 'm4a' }, now)
  assert.equal(refused.transcriptStatus, 'failed')
  assert.equal(refused.transcribeAttempts, 1)
  assert.equal(refused.transcribeAfter, null)
})

test("the server's words land only on a voice note still waiting for them, never over the user's", () => {
  const voice = { kind: 'voice' as const, transcriptSource: null }
  assert.equal(takesServerTranscript({ ...voice, transcriptStatus: 'pending' }), true)
  assert.equal(takesServerTranscript({ ...voice, transcriptStatus: 'pending', transcriptSource: 'user' }), false)
  assert.equal(takesServerTranscript({ ...voice, transcriptStatus: 'done', transcriptSource: 'user' }), false)
  assert.equal(takesServerTranscript({ ...voice, transcriptStatus: 'done', transcriptSource: 'phone' }), false)
  assert.equal(takesServerTranscript({ ...voice, transcriptStatus: 'failed' }), false)
  assert.equal(takesServerTranscript({ kind: 'text', transcriptStatus: 'none', transcriptSource: null }), false)
})

test('the Inbox shows the words, "Transcribing…" (retrying after a miss) or the failure', () => {
  const base = { transcribeAttempts: 0, transcribeError: null }
  assert.deepEqual(transcriptView({ ...base, text: 'Hi', transcriptStatus: 'done' }), { kind: 'text', text: 'Hi' })
  assert.deepEqual(transcriptView({ ...base, text: '', transcriptStatus: 'done' }), { kind: 'empty' })
  assert.deepEqual(transcriptView({ ...base, text: null, transcriptStatus: 'pending' }), {
    kind: 'transcribing',
    retrying: false,
  })
  assert.deepEqual(
    transcriptView({ text: null, transcriptStatus: 'pending', transcribeAttempts: 2, transcribeError: '503' }),
    { kind: 'transcribing', retrying: true },
  )
  assert.deepEqual(
    transcriptView({ text: null, transcriptStatus: 'failed', transcribeAttempts: 1, transcribeError: 'bad audio' }),
    { kind: 'failed', message: 'bad audio' },
  )
})

test('a voice note the transcriber refused is kept, not "waiting for its words"', () => {
  const c = {
    status: 'new' as const,
    kind: 'voice' as const,
    text: null,
    questionId: null,
    noteId: null,
    tickTickTaskId: null,
    routeError: null,
  }
  assert.deepEqual(captureDestination({ ...c, transcriptStatus: 'pending' }), { kind: 'transcribing' })
  assert.deepEqual(captureDestination({ ...c, transcriptStatus: 'failed' }), { kind: 'kept' })
})
