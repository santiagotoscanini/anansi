// Speech to text with the box's Whisper (Large v3 Turbo), behind the LiteLLM
// gateway as its `stt` model: an OpenAI-style `POST /v1/audio/transcriptions`.
// The key the app holds may use that model and `smart` (server/tidy.ts), nothing else.
//
// The Whisper server takes WAV and refuses AAC (`.m4a`), and this image has no
// ffmpeg to convert, so the phone records 16 kHz mono 16-bit WAV. The language
// is left to Whisper: the user speaks Spanish and English.
//
// Two kinds of failure, because the caller treats them differently:
//   - `TranscriberUnavailable`: not configured, unreachable, timed out, 5xx,
//     429. The audio is fine; try again later.
//   - `TranscriberRejected`: any other 4xx, i.e. the audio itself (an old
//     m4a, a broken file). Trying again will not help.
import { env, transcriptionEnabled } from '~/lib/env'
import { transcribeTimeoutMs } from '~/lib/captures'

export class TranscriberUnavailable extends Error {
  override name = 'TranscriberUnavailable'
}

export class TranscriberRejected extends Error {
  override name = 'TranscriberRejected'
}

export interface Transcript {
  text: string
  language: string | null
}

/** 16 kHz mono 16-bit PCM is 32,000 bytes a second: the length of a WAV whose duration the caller does not know. */
const WAV_BYTES_PER_SECOND = 32_000

async function detail(res: Response): Promise<string> {
  const body = await res.text().catch(() => '')
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } | string; detail?: unknown }
    const message = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message
    if (typeof message === 'string' && message) return message.slice(0, 300)
    if (typeof parsed.detail === 'string') return parsed.detail.slice(0, 300)
  } catch {
    // not JSON
  }
  return body.trim().slice(0, 300) || res.statusText
}

export async function transcribe(
  bytes: Uint8Array<ArrayBuffer>,
  fileName: string,
  mimeType: string,
  opts?: {
    durationMs?: number | null
    /** Vocabulary to expect: the user's dictionary (`transcriberPrompt`). */ prompt?: string | null
  },
): Promise<Transcript> {
  if (!transcriptionEnabled) throw new TranscriberUnavailable('The transcriber is not configured')
  const durationMs = opts?.durationMs ?? Math.round((bytes.byteLength / WAV_BYTES_PER_SECOND) * 1000)
  const form = new FormData()
  form.append('model', 'stt')
  form.append('response_format', 'json')
  if (opts?.prompt) form.append('prompt', opts.prompt)
  form.append('file', new Blob([bytes], { type: mimeType }), fileName)

  const url = `${env.LITELLM_BASE_URL!.replace(/\/+$/, '')}/v1/audio/transcriptions`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.LITELLM_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(transcribeTimeoutMs(durationMs)),
    })
  } catch (e) {
    const why =
      e instanceof Error && e.name === 'TimeoutError' ? 'timed out' : e instanceof Error ? e.message : String(e)
    throw new TranscriberUnavailable(`The transcriber could not be reached (${why})`)
  }
  if (!res.ok) {
    const why = await detail(res)
    // LiteLLM answers 500 for everything the Whisper server refused, naming its
    // status in the message ("whisper-server returned status 400: Invalid
    // request"): that is the audio, not the transcriber being down.
    const upstream = /returned status (\d{3}):? ?([^\n]*)/.exec(why)
    const status = upstream ? Number(upstream[1]) : res.status
    // A key problem (401/403) is the box's to fix, not the audio's: keep the note and try again.
    if (status === 429 || status >= 500 || status === 401 || status === 403 || status === 408) {
      throw new TranscriberUnavailable(`The transcriber answered ${res.status}: ${why}`)
    }
    const said = upstream?.[2]?.trim()
    throw new TranscriberRejected(
      `The transcriber refused this audio (${status}: ${said !== undefined && said !== '' ? said : why})`,
    )
  }
  const body = (await res.json().catch(() => null)) as { text?: unknown; language?: unknown } | null
  if (!body || typeof body.text !== 'string') throw new TranscriberUnavailable('The transcriber answered without text')
  // Whisper puts each segment on a line of its own; the words are one paragraph
  // (a capture's first line is its TickTick title).
  return {
    text: body.text.replace(/\s+/g, ' ').trim(),
    language: typeof body.language === 'string' ? body.language : null,
  }
}
