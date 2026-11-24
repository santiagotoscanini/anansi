// The TickTick access token at rest. TickTick issues no refresh token, so the
// access token is a long-lived credential to the user's whole TickTick account;
// it is kept encrypted (AES-256-GCM) under a key derived from AUTH_SECRET.
// Rotating AUTH_SECRET makes stored tokens unreadable, which reads as "connect
// TickTick again", the same as a token TickTick stopped accepting.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { env } from '~/lib/env'

const key = () => Buffer.from(hkdfSync('sha256', env.AUTH_SECRET, 'anansi', 'ticktick-access-token', 32))

export function sealToken(token: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return ['v1', iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.')
}

/** The token, or null when it cannot be read (another AUTH_SECRET, or tampered). */
export function openToken(sealed: string): string | null {
  const [version, iv, tag, data] = sealed.split('.')
  if (version !== 'v1' || !iv || !tag || !data) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
