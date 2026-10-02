// In-memory fixed-window rate limiter. Sized for a single-instance
// self-hosted personal app — every container shares one Map per endpoint,
// state vanishes on restart (acceptable for brute-force defense; stricter
// guarantees would need Redis).
//
// Usage:
//   const ok = checkRateLimit("login", `ip:${ip}`, { limit: 5, windowMs: 15 * 60_000 });
//   if (!ok.allowed) return 429 with ok.retryAfterSec;

interface Bucket {
  count: number
  resetAt: number
}

interface RateLimitConfig {
  limit: number
  windowMs: number
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSec: number
}

// One Map per logical endpoint avoids cross-endpoint collisions when the
// same key (ip / userId) is used by both. Lazy-create.
const buckets = new Map<string, Map<string, Bucket>>()

function bucketsFor(endpoint: string): Map<string, Bucket> {
  let m = buckets.get(endpoint)
  if (!m) {
    m = new Map()
    buckets.set(endpoint, m)
  }
  return m
}

// Periodic best-effort cleanup so a server that runs for weeks doesn't grow
// the Map unbounded with expired entries from one-shot abusive IPs.
let lastSweepAt = 0
function maybeSweep(now: number) {
  if (now - lastSweepAt < 60_000) return
  lastSweepAt = now
  for (const [, m] of buckets) {
    for (const [key, b] of m) {
      if (b.resetAt <= now) m.delete(key)
    }
  }
}

export function checkRateLimit(endpoint: string, key: string, cfg: RateLimitConfig): RateLimitResult {
  const now = Date.now()
  maybeSweep(now)

  const m = bucketsFor(endpoint)
  let b = m.get(key)
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + cfg.windowMs }
    m.set(key, b)
  }
  b.count++

  const allowed = b.count <= cfg.limit
  return {
    allowed,
    remaining: Math.max(0, cfg.limit - b.count),
    retryAfterSec: allowed ? 0 : Math.ceil((b.resetAt - now) / 1000),
  }
}

/**
 * The rate-limit key for a request: an address the client cannot choose.
 *
 * The public path is Cloudflare's edge → cloudflared → traefik's `cfweb`
 * entrypoint (bridge-only, which trusts forwarded headers from traefik-net) →
 * the app. So X-Forwarded-For arrives as
 * `<whatever the client sent>, <real client ip>, <cloudflared's ip>`, and its
 * FIRST entry is the client's own words: keying on it let anyone rotate past
 * the sign-in limit with a fresh header per attempt (found 2026-10-02).
 *
 *   1. `cf-connecting-ip`: Cloudflare overwrites it with the address it saw.
 *   2. Else the X-Forwarded-For entry second from the right: the address the
 *      peer in front of traefik (cloudflared) saw, appended by that peer.
 *   3. Else `unknown`: one shared bucket. LAN traffic lands here (traefik's
 *      LAN entrypoint strips forwarded headers and sets a single entry), so
 *      the house shares one budget; accepted. A LAN client could also set
 *      cf-connecting-ip itself; the LAN is not what this guards against.
 *
 * X-Real-IP is not read: traefik passes a client's own through on `cfweb`.
 * Also the address the OAuth audit log records, for the same reason.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const cf = headers.get('cf-connecting-ip')?.trim()
  if (cf) return cf

  const hops = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean)
  if (hops.length >= 2) return hops[hops.length - 2]!

  return 'unknown'
}
