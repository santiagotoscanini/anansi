import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CAPTURE_TITLE_MAX,
  captureBody,
  captureDestination,
  captureTitle,
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
