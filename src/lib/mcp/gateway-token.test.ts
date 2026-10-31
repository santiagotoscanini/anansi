import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { cameThroughTunnel, tokenMatches } from './gateway-token'

describe('the gateway token', () => {
  test('matches itself and nothing else', () => {
    assert.equal(tokenMatches('a', 'a'), true)
    assert.equal(tokenMatches('b', 'a'), false)
  })

  test('opens nothing on a box that set none', () => {
    assert.equal(tokenMatches('x', undefined), false)
    assert.equal(tokenMatches('', ''), false)
    assert.equal(tokenMatches(null, 'x'), false)
  })

  test('tells a request that came through the tunnel', () => {
    assert.equal(cameThroughTunnel(new Headers({ 'cf-connecting-ip': '203.0.113.1' })), true)
    assert.equal(cameThroughTunnel(new Headers({ 'cf-ray': 'abc' })), true)
    assert.equal(cameThroughTunnel(new Headers({ authorization: 'Bearer x' })), false)
  })
})
