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

// Read the client IP from forwarded headers (Traefik / reverse proxies set
// these). Falls back to a constant string so unknown clients still get
// rate-limited as a single shared bucket — better than no limit at all.
export function clientIpFromHeaders(headers: Headers): string {
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    // First entry is the original client; the rest are intermediate proxies.
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const xri = headers.get('x-real-ip')
  if (xri) return xri.trim()
  return 'unknown'
}
