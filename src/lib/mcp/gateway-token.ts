import { createHash, timingSafeEqual } from 'node:crypto'

// The two checks behind lib/mcp/gateway.ts, apart from it so they can be
// asserted without a database.

const digest = (s: string) => createHash('sha256').update(s).digest()

/** Whether the token matches. False, always, on a box that set none. */
export function tokenMatches(presented: string | null | undefined, expected: string | undefined) {
  if (!expected || !presented) return false
  return timingSafeEqual(digest(presented), digest(expected))
}

/** Cloudflare sets these on everything through the tunnel, and a client cannot remove them. */
export const cameThroughTunnel = (headers: Headers) => headers.has('cf-connecting-ip') || headers.has('cf-ray')
