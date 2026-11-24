// The browser half of connecting TickTick: the state cookie that ties the
// callback to the visit that started it, and the redirect URI both legs must
// name identically.
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from '~/lib/env'
import { resolveOrigin } from '~/lib/mcp/oauth/metadata'

const COOKIE = 'anansi_ticktick_oauth'
const PATH = '/api/integrations/ticktick'

export function redirectUri(request: Request): string {
  return env.TICKTICK_REDIRECT_URI ?? `${resolveOrigin(request)}${PATH}/callback`
}

/** A fresh state, and the cookie that remembers it (and the browser's zone) for ten minutes. */
export function startState(request: Request, timeZone: string | null) {
  const state = randomBytes(24).toString('base64url')
  const secure = resolveOrigin(request).startsWith('https:')
  const value = encodeURIComponent(JSON.stringify({ state, timeZone }))
  const cookie = `${COOKIE}=${value}; Path=${PATH}; Max-Age=600; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
  return { state, cookie }
}

export const clearStateCookie = `${COOKIE}=; Path=${PATH}; Max-Age=0; HttpOnly; SameSite=Lax`

/** The zone the visit started with, when the state matches; null otherwise. */
export function checkState(request: Request, state: string | null): { timeZone: string | null } | null {
  const raw = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1)
  if (!raw || !state) return null
  try {
    const saved = JSON.parse(decodeURIComponent(raw)) as { state?: unknown; timeZone?: unknown }
    if (typeof saved.state !== 'string') return null
    const a = Buffer.from(saved.state)
    const b = Buffer.from(state)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    return { timeZone: typeof saved.timeZone === 'string' ? saved.timeZone : null }
  } catch {
    return null
  }
}
