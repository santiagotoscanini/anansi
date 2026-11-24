import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MIN_SPEECH_SECONDS, speechSeconds } from './audio.ts'

/** A 16 kHz mono 16-bit WAV: `seconds` of a tone at `amplitude` (0 to 1), then `quiet` seconds at 1/1000 of it. */
function wav(seconds: number, amplitude: number, quiet = 0, closedHeader = true): Uint8Array {
  const rate = 16_000
  const n = Math.round((seconds + quiet) * rate)
  const bytes = new Uint8Array(44 + n * 2)
  const v = new DataView(bytes.buffer)
  const put = (at: number, s: string) => [...s].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)))
  put(0, 'RIFF')
  v.setUint32(4, closedHeader ? 36 + n * 2 : 0, true)
  put(8, 'WAVE')
  put(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  put(36, 'data')
  v.setUint32(40, closedHeader ? n * 2 : 0, true)
  for (let i = 0; i < n; i++) {
    const a = i < seconds * rate ? amplitude : amplitude / 1000
    v.setInt16(44 + i * 2, Math.round(Math.sin((i / rate) * 2 * Math.PI * 220) * a * 32767), true)
  }
  return bytes
}

test('a note with speech in it counts its sound', () => {
  assert.equal(speechSeconds(wav(2, 0.3, 1)), 2)
})

test('a press to start and a press to stop, nothing said: no speech', () => {
  const heard = speechSeconds(wav(0, 0, 2))
  assert.equal(heard, 0)
  assert.ok(heard < MIN_SPEECH_SECONDS)
  // Room noise, well under the line.
  assert.ok(speechSeconds(wav(2, 0.005))! < MIN_SPEECH_SECONDS)
})

test('a header the recorder never closed still reads', () => {
  assert.equal(speechSeconds(wav(1, 0.3, 0, false)), 1)
})

test('anything else is for the transcriber to judge', () => {
  assert.equal(speechSeconds(new TextEncoder().encode('ftypM4A not a wav')), null)
  assert.equal(speechSeconds(new Uint8Array()), null)
})
