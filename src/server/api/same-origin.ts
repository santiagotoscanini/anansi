import { resolveOrigin } from '~/lib/mcp/oauth/metadata'

/**
 * Whether a request that rides the session cookie was made by our own pages.
 *
 * The cookie goes along with any request a browser makes to us, so a route
 * that changes something on the strength of it has to know the page asking is
 * ours. A browser sends Origin on every such POST; when it is absent the
 * Referer's origin is the fallback, and with neither the answer is no.
 */
export function isSameOriginRequest(req: Request): boolean {
  const expected = resolveOrigin(req)
  const origin = req.headers.get('origin')
  if (origin) return origin === expected
  const referer = req.headers.get('referer')
  if (referer) {
    try {
      const r = new URL(referer)
      return `${r.protocol}//${r.host}` === expected
    } catch {
      return false
    }
  }
  return false
}
