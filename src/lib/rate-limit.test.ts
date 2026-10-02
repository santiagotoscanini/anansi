import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { checkRateLimit, clientIpFromHeaders, limitFailures } from './rate-limit'

const key = (headers: Record<string, string>) => clientIpFromHeaders(new Headers(headers))

describe('clientIpFromHeaders', () => {
  test('cf-connecting-ip wins over anything in X-Forwarded-For', () => {
    assert.equal(
      key({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '1.2.3.4, 203.0.113.7, 10.89.0.5' }),
      '203.0.113.7',
    )
  })

  test('the client-supplied first X-Forwarded-For entry is never the key', () => {
    // What the app sees through the tunnel when the client sends its own header.
    assert.equal(key({ 'x-forwarded-for': '1.2.3.4, 203.0.113.7, 10.89.0.5' }), '203.0.113.7')
    assert.equal(key({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7, 10.89.0.5' }), '203.0.113.7')
  })

  test('without a client header, the entry second from the right is the real client', () => {
    assert.equal(key({ 'x-forwarded-for': '203.0.113.7, 10.89.0.5' }), '203.0.113.7')
  })

  test('rotating spoofed entries all land in one bucket', () => {
    const keys = new Set(
      ['1.1.1.1', '2.2.2.2', '3.3.3.3, 4.4.4.4'].map((spoof) =>
        key({ 'cf-connecting-ip': '198.51.100.9', 'x-forwarded-for': `${spoof}, 198.51.100.9, 10.89.0.5` }),
      ),
    )
    assert.deepEqual([...keys], ['198.51.100.9'])
  })

  for (const [name, headers] of [
    ['no headers', {}],
    ['a single X-Forwarded-For entry (traefik LAN entrypoint)', { 'x-forwarded-for': '192.168.0.50' }],
    ['empty entries', { 'x-forwarded-for': ' , ' }],
    ['X-Real-IP alone', { 'x-real-ip': '1.2.3.4' }],
    ['an empty cf-connecting-ip', { 'cf-connecting-ip': '  ' }],
  ] as const) {
    test(`${name} → unknown`, () => {
      assert.equal(key(headers), 'unknown')
    })
  }
})

describe('checkRateLimit', () => {
  test('refuses the call past the limit within the window', () => {
    const endpoint = `test.${Math.random()}`
    const cfg = { limit: 2, windowMs: 60_000 }
    assert.equal(checkRateLimit(endpoint, 'ip:a', cfg).allowed, true)
    assert.equal(checkRateLimit(endpoint, 'ip:a', cfg).allowed, true)
    const third = checkRateLimit(endpoint, 'ip:a', cfg)
    assert.equal(third.allowed, false)
    assert.ok(third.retryAfterSec > 0)
    assert.equal(checkRateLimit(endpoint, 'ip:b', cfg).allowed, true)
  })
})

describe('limitFailures (the sign-in shape)', () => {
  const cfg = { limit: 5, windowMs: 15 * 60_000 }
  const ok = () => Promise.resolve('signed in')
  const wrong = () => Promise.reject(new Error('CredentialsSignin'))

  /** One sign-in as auth.fn.ts runs it: 'ok' | 'wrong' | 'limited'. */
  async function signIn(endpoint: string, attempt: () => Promise<string>) {
    try {
      const rl = await limitFailures(endpoint, 'ip:a', cfg, attempt)
      return rl.allowed ? 'ok' : 'limited'
    } catch {
      return 'wrong'
    }
  }

  test('10 successes in a row are never limited', async () => {
    const endpoint = `test.${Math.random()}`
    for (let i = 0; i < 10; i++) assert.equal(await signIn(endpoint, ok), 'ok')
  })

  test('5 failures, then the 6th is limited even with the right password, before it is checked', async () => {
    const endpoint = `test.${Math.random()}`
    for (let i = 0; i < 5; i++) assert.equal(await signIn(endpoint, wrong), 'wrong')
    let checked = false
    const right = () => {
      checked = true
      return ok()
    }
    assert.equal(await signIn(endpoint, right), 'limited')
    assert.equal(checked, false, 'a locked-out key must never reach the password check')
  })

  test('a success after 3 failures refunds only itself: 2 more failures still lock the key', async () => {
    const endpoint = `test.${Math.random()}`
    for (let i = 0; i < 3; i++) assert.equal(await signIn(endpoint, wrong), 'wrong')
    assert.equal(await signIn(endpoint, ok), 'ok')
    assert.equal(await signIn(endpoint, wrong), 'wrong')
    assert.equal(await signIn(endpoint, wrong), 'wrong')
    assert.equal(await signIn(endpoint, ok), 'limited')
  })

  test('attempts in flight count: a parallel burst cannot all pass the check', async () => {
    const endpoint = `test.${Math.random()}`
    const results = await Promise.all(Array.from({ length: 8 }, () => signIn(endpoint, wrong)))
    assert.equal(results.filter((r) => r === 'wrong').length, 5)
    assert.equal(results.filter((r) => r === 'limited').length, 3)
  })
})
