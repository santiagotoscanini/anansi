// How much of a recording is speech, read straight off a WAV (16-bit PCM, what
// the phone records). Whisper, given silence, writes something anyway: "Thank
// you.", "Gracias.", "Thanks for watching!". A note recorded by accident (a
// press to start, a press to stop, nothing said) came back as "Thank you." and
// went to TickTick as a task. So a recording with too little speech in it is
// not sent to the transcriber at all: it heard nothing. Pure; tested.

/** A 100 ms stretch louder than this (RMS, full scale = 1) counts as sound. About -34 dBFS. */
const LOUD_RMS = 0.02
/** Less speech than this in a whole note: nothing was said. */
export const MIN_SPEECH_SECONDS = 0.5

/** Seconds of sound in a 16-bit PCM WAV, or null when the bytes are not one (another format: let Whisper decide). */
export function speechSeconds(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const ascii = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4))
  if (bytes.length < 12 || ascii(0) !== 'RIFF' || ascii(8) !== 'WAVE') return null
  let at = 12
  let rate = 0
  let channels = 0
  let bits = 0
  while (at + 8 <= bytes.length) {
    const id = ascii(at)
    const size = view.getUint32(at + 4, true)
    const body = at + 8
    if (id === 'fmt ' && body + 16 <= bytes.length) {
      if (view.getUint16(body, true) !== 1) return null // not plain PCM
      channels = view.getUint16(body + 2, true)
      rate = view.getUint32(body + 4, true)
      bits = view.getUint16(body + 14, true)
    }
    if (id === 'data') {
      if (bits !== 16 || !rate || !channels) return null
      // A header the recorder never closed says 0 (or too much): what is there counts.
      const end = size > 0 && body + size <= bytes.length ? body + size : bytes.length
      const frames = Math.floor((end - body) / (2 * channels))
      const window = Math.max(1, Math.round(rate / 10))
      let loud = 0
      for (let start = 0; start + window <= frames; start += window) {
        let sum = 0
        for (let f = start; f < start + window; f++) {
          const s = view.getInt16(body + f * 2 * channels, true) / 32768
          sum += s * s
        }
        if (Math.sqrt(sum / window) > LOUD_RMS) loud++
      }
      return (loud * window) / rate
    }
    at = body + size + (size % 2)
  }
  return null
}
