import { createHash, randomBytes } from 'node:crypto'

// Token shape:
//   prefix `mcp_` + 32 random bytes base64url-encoded → 47 chars total.
// The prefix makes leaks easy to spot in logs / git history (matches the
// GitHub-Personal-Access-Token convention). 32 bytes = 256 bits of entropy.

export function generateToken(prefix: 'mcp_at' | 'mcp_rt'): string {
  return `${prefix}_${randomBytes(32).toString('base64url')}`
}

// SHA-256 → hex. Raw tokens never touch the DB; only the hash lives in
// mcp_access_tokens.token_hash / mcp_refresh_tokens.token_hash. A DB
// compromise yields nothing replayable.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
