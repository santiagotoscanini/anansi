// A voice note's words tidied into a title and clean notes by the box's chat
// model, behind the LiteLLM gateway as its `smart` model (an OpenAI-style
// `POST /v1/chat/completions`, the same key as `transcribe.ts`). What to ask and
// how to read the answer are pure and live in src/lib/captures.ts
// (`tidyMessages`, `parseTidy`).
//
// Best effort: the caller sends the note on with its plain words when this
// throws, so every failure is one error with a short reason.
import { env, transcriptionEnabled } from '~/lib/env'
import { parseTidy, tidyMessages, type CaptureTerm, type Tidied } from '~/lib/captures'

/** A model being loaded on the PC takes a while; past this the note goes on without it. */
const TIDY_TIMEOUT_MS = 90_000

export async function tidy(words: string, terms: readonly CaptureTerm[]): Promise<Tidied> {
  if (!transcriptionEnabled) throw new Error('The gateway is not configured')
  const url = `${env.LITELLM_BASE_URL!.replace(/\/+$/, '')}/v1/chat/completions`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.LITELLM_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'smart',
        temperature: 0.2,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
        messages: tidyMessages(words, terms),
      }),
      signal: AbortSignal.timeout(TIDY_TIMEOUT_MS),
    })
  } catch (e) {
    const why =
      e instanceof Error && e.name === 'TimeoutError' ? 'timed out' : e instanceof Error ? e.message : String(e)
    throw new Error(`The model could not be reached (${why})`, { cause: e })
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`The model answered ${res.status}: ${body.trim().slice(0, 200)}`)
  }
  const body = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: unknown } }[]
  } | null
  const content = body?.choices?.[0]?.message?.content
  const tidied = typeof content === 'string' ? parseTidy(content) : null
  if (!tidied) throw new Error('The model answered without a usable title')
  return tidied
}
