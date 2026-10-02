import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { checkRateLimit, clientIpFromHeaders } from './rate-limit'

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
