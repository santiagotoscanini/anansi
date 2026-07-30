import { createHash, timingSafeEqual } from 'node:crypto'

// PKCE (RFC 7636) verifier check. We only accept the S256 method — `plain`
// is a downgrade attack vector and the MCP spec already requires S256.
//
// SHA-256 the verifier, base64url-encode (no padding), compare to the
// previously-stored challenge with timingSafeEqual so a length-equal
// mismatch doesn't reveal where the bytes diverge.
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false
  if (verifier.length < 43 || verifier.length > 128) return false // RFC 7636 §4.1
  const expected = createHash('sha256').update(verifier).digest('base64url')
  if (expected.length !== challenge.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(challenge))
}
